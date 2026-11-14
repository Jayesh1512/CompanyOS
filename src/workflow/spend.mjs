// Execute agent-initiated spend requests produced by the autonomy loop.
//
// A recorded `spendRequests` entry (from an agent `spend` command) is executed
// by the real Agent API spend port, within M01-admitted bounds and the owner's
// policy/grant. This module does NOT decide authority: it refuses unless the
// request is the exact admitted one, and it records the provider result and an
// optional ledger commitment so the whole run is checkable on chain.
//
// Standalone by design: it can be driven by a loop event, but it does not enter
// the frozen inference decision engine.
import {fingerprint} from '../contracts.mjs';
import {lifetimeExposure} from '../rules/ceiling.mjs';

const CLOSED = new Set(['completed', 'cancelled', 'superseded', 'failed']);
const TERMINAL = new Set(['SUCCESS', 'FAILED', 'REFUNDED', 'NEEDS_REVIEW']);

const fail = code => { throw Object.assign(new Error(code), {code}); };

const USDC = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
// A provider-confirmed failure or refund moved no money; every other non-pending state may have.
const NO_OUTFLOW = new Set(['proposed', 'admitted', 'blocked', 'denied']);
const REFUNDED = new Set(['FAILED', 'REFUNDED']);

/** USDC has 6 decimals, the ceiling counts nanoUSD (1e-9): exact. Any other asset has no
 * price source here, so it has no bound and the caller must fail closed. */
export function spendNanoUsd(asset, amount) {
  if (asset !== USDC || typeof amount !== 'string' || !/^[0-9]{1,30}$/.test(amount)) return null;
  return BigInt(amount) * 1000n;
}

/**
 * @param {object} deps
 * @param {object} deps.journal   durable journal
 * @param {object} deps.agentSpend port from createAgentSpendPort
 * @param {object} [deps.ledger]  optional { append(records) } ledger committer
 * @param {string} deps.companyId
 * @param {() => (string|null)} deps.getCeiling    REQUIRED lifetime ceiling in nanoUSD (null = none configured)
 * @param {() => object}        deps.getFinancial  REQUIRED M03 financial facts (reservations) for lifetime exposure
 */
export function createSpendExecutor({journal, agentSpend, ledger = null, companyId, getCeiling, getFinancial, clock = () => new Date()}) {
  // The cap must be a deliberate wiring decision, never a forgotten default: without both
  // functions the executor cannot be constructed, so this path cannot silently bypass it.
  if (typeof getCeiling !== 'function' || typeof getFinancial !== 'function') {
    throw new TypeError('createSpendExecutor requires getCeiling and getFinancial so spend counts against the lifetime ceiling');
  }
  const now = () => new Date(clock()).toISOString();
  const scoped = xs => (xs ?? []).filter(x => x.companyId === companyId);

  function admittedRequest(spendId) {
    const req = journal.get('spendRequests', spendId);
    if (!req || req.companyId !== companyId) fail('SPEND_REQUEST_NOT_FOUND');
    if (req.state !== 'proposed' && req.state !== 'admitted') fail('SPEND_ALREADY_HANDLED');
    if (!req.admission || typeof req.admission.commandHash !== 'string') fail('SPEND_ADMISSION_REQUIRED');
    return req;
  }

  /** Natural-language purpose -> structured request the port can execute. */
  function toPortRequest(req) {
    // A supplierRef means "pay this supplier" (transfer). Otherwise swap into the
    // other configured asset; a swap must move between TWO DIFFERENT assets or the
    // provider refuses it with validation_failed.
    if (req.supplierRef) return {kind: 'transfer', asset: req.asset, amount: req.amount, destination: req.supplierRef};
    const USDC = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
    const WRAP = 'nep141:wrap.near';
    const destination = req.destinationAsset ?? (req.asset === USDC ? WRAP : USDC);
    if (destination === req.asset) throw Object.assign(new Error('SPEND_SWAP_ASSETS_IDENTICAL'), {code: 'SPEND_SWAP_ASSETS_IDENTICAL'});
    return {kind: 'swap', asset: req.asset, amount: req.amount, destination};
  }

  /** null when within the lifetime ceiling, else a reason code. Counts M03 reservations
   * (inference, funding, ...) plus every earlier agent spend that may have moved money. */
  function ceilingReason(req) {
    const ceilingText = getCeiling();
    if (ceilingText === null || ceilingText === undefined) return null; // no ceiling configured, same as every other action
    let ceiling; try { ceiling = BigInt(ceilingText); } catch { return 'TOTAL_CEILING_INVALID'; }
    const proposed = spendNanoUsd(req.asset, req.amount);
    if (proposed === null) return 'SPEND_USD_BOUND_REQUIRED';
    let used;
    try { used = lifetimeExposure(getFinancial(), null); } catch { return 'TOTAL_CEILING_FACTS_REQUIRED'; }
    for (const prior of scoped(journal.list('spendRequests'))) {
      if (prior.id === req.id || NO_OUTFLOW.has(prior.state)) continue;
      if (prior.state === 'failed' && REFUNDED.has(prior.providerStatus)) continue;
      const bound = spendNanoUsd(prior.asset, prior.amount);
      if (bound === null) return 'SPEND_EXPOSURE_UNPRICED';
      used += bound;
    }
    return used + proposed > ceiling ? 'TOTAL_CEILING_EXCEEDED' : null;
  }

  async function execute(spendId) {
    const req = admittedRequest(spendId);
    const reason = ceilingReason(req);
    if (reason) {
      // Decided before any provider call, so a denied spend never moves money.
      const denied = {...req, state: 'denied', reasonCode: reason, updatedAt: now()};
      await journal.transaction({actionId: `spend:${req.id}:denied`, fingerprint: fingerprint(denied)}, tx => {tx.put('spendRequests', req.id, denied); return null;});
      return {status: 'denied', reasonCode: reason};
    }
    const capability = agentSpend.capability?.() ?? {};
    if (!capability.configured) {
      const blocked = {...req, state: 'blocked', reasonCode: 'SPEND_PORT_NOT_CONFIGURED', updatedAt: now()};
      await journal.transaction({actionId: `spend:${req.id}:blocked`, fingerprint: fingerprint(blocked)}, tx => {tx.put('spendRequests', req.id, blocked); return null;});
      return {status: 'blocked', reasonCode: 'SPEND_PORT_NOT_CONFIGURED'};
    }

    // Mark in-flight before dispatch so a restart cannot double-send.
    const inFlight = {...req, state: 'dispatching', dispatchedAt: now(), updatedAt: now()};
    await journal.transaction({actionId: `spend:${req.id}:dispatch`, fingerprint: fingerprint(inFlight)}, tx => {tx.put('spendRequests', req.id, inFlight); return null;});

    let outcome;
    try {
      outcome = await agentSpend.spend(toPortRequest(req));
    } catch (error) {
      const failed = {...inFlight, state: 'failed', reasonCode: error.code ?? 'SPEND_ERROR', updatedAt: now()};
      await journal.transaction({actionId: `spend:${req.id}:error`, fingerprint: fingerprint(failed)}, tx => {tx.put('spendRequests', req.id, failed); return null;});
      return {status: 'failed', reasonCode: failed.reasonCode};
    }

    const succeeded = outcome.status === 'SUCCESS';
    const recorded = {
      ...inFlight,
      state: succeeded ? 'completed' : TERMINAL.has(outcome.status) ? 'failed' : 'unknown',
      reasonCode: succeeded ? null : outcome.failureCode ?? outcome.status,
      correlationId: outcome.correlationId,
      txHash: outcome.txHash ?? null,
      providerStatus: outcome.status,
      spentAt: succeeded ? now() : null,
      updatedAt: now(),
    };
    await journal.transaction({actionId: `spend:${req.id}:result`, fingerprint: fingerprint(recorded)}, tx => {tx.put('spendRequests', req.id, recorded); return null;});

    // Optional: commit the spend event to the on-chain ledger so a judge can
    // verify the whole loop from the repo + explorer.
    let ledgerTx = null;
    if (succeeded && ledger?.append) {
      // The committed data is persisted verbatim so anyone can recompute the on-chain
      // payload commitment from the journal (see scripts/verify-loop-receipt.mjs).
      const committed = {type: 'spend.completed', data: {companyId, actorId: recorded.actorId, spendId: recorded.id, asset: recorded.asset, amount: recorded.amount, purpose: recorded.purpose, txHash: recorded.txHash}};
      try {
        ledgerTx = await ledger.append([committed]);
        const linked = {...recorded, ledgerCommit: {...committed, committedAt: now(), txHash: ledgerTx?.txHash ?? null, correlationId: ledgerTx?.correlationId ?? null}, updatedAt: now()};
        await journal.transaction({actionId: `spend:${req.id}:ledger`, fingerprint: fingerprint(linked)}, tx => {tx.put('spendRequests', req.id, linked); return null;});
      } catch {
        ledgerTx = null; // Ledger failure never fabricates a spend result.
      }
    }

    return {status: recorded.state, reasonCode: recorded.reasonCode, txHash: recorded.txHash, correlationId: recorded.correlationId, ledgerTx};
  }

  return {execute, admittedRequest};
}
