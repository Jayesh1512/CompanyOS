// Verify the NanoGPT closed loop against public NEAR mainnet (read-only; signs and spends nothing).
//   customer NEAR payment -> sale.confirmed -> agent pays NanoGPT invoice -> procurement.confirmed -> inference -> inference.consumed
// LIVE_PUBLIC = read/recomputed from mainnet RPC; LIVE_AUTHED = re-read from NanoGPT (needs NANOGPT_API_KEY); LOCAL_ARTIFACT = recorded assertion.
// Usage: node scripts/verify-nanogpt-loop.mjs [artifacts/mainnet-proof/nanogpt-loop.json]
import {readFile} from 'node:fs/promises';
import {loadEnvFile} from 'node:process';
import {hash} from '../src/rules/config.mjs';
import {ledgerCompanyHash} from '../src/rules/onchain-ledger.mjs';

try { loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const file = process.argv[2] ?? 'artifacts/mainnet-proof/nanogpt-loop.json', RPC = process.env.NEAR_RPC_URL ?? 'https://free.rpc.fastnear.com';
const rpc = async (method, params) => { const p = await (await fetch(RPC, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}), signal: AbortSignal.timeout(20000)})).json(); if (p.error) throw new Error(p.error.data ?? p.error.message); return p.result; };
const results = []; const check = (scope, name, ok, detail = '') => { results.push({scope, ok}); console.log(`${ok ? 'PASS' : 'FAIL'}  [${scope}] ${name}${detail ? ` - ${detail}` : ''}`); return ok; };
const finalOk = tx => tx.final_execution_status === 'FINAL' && 'SuccessValue' in (tx.status ?? {}) && !(tx.receipts_outcome ?? []).some(r => 'Failure' in (r.outcome?.status ?? {}));
const r = JSON.parse(await readFile(file, 'utf8')), {sale, purchase, answer} = r, companyHash = ledgerCompanyHash('local-workspace');
const contract = process.env.SHOP_LEDGER_CONTRACT_ID, signer = process.env.SHOP_LEDGER_SIGNER_ID ?? process.env.NEAR_AGENT_ACCOUNT_ID;
console.log(`NanoGPT loop, company wallet ${r.companyWallet.slice(0, 12)}...\n${r.labels.map(l => `  note: ${l}`).join('\n')}\n`);

async function transfer(label, txHash, from, to, yocto) {
  try {
    const tx = await rpc('tx', {tx_hash: txHash, sender_account_id: from, wait_until: 'FINAL'}), dep = tx.transaction?.actions?.find(a => a.Transfer)?.Transfer?.deposit;
    check('LIVE_PUBLIC', `${label}: tx FINAL and succeeded`, finalOk(tx), `${txHash.slice(0, 12)}...`);
    check('LIVE_PUBLIC', `${label}: native transfer of the exact amount, signer -> receiver as recorded`, tx.transaction.signer_id === from && tx.transaction.receiver_id === to && dep === yocto, `${dep} yocto`);
  } catch (e) { check('LIVE_PUBLIC', `${label}: tx lookup`, false, String(e.message).slice(0, 80)); }
}
await transfer('customer payment', sale.paymentTxHash, sale.customer, r.companyWallet, sale.amountYocto);
await transfer('agent payment to NanoGPT invoice', purchase.paymentTxHash, r.companyWallet, purchase.address, purchase.paidYocto);

for (const c of r.ledgerCommits) {
  const type = c.events[0].type;
  try {
    const tx = await rpc('tx', {tx_hash: c.txHash, sender_account_id: signer, wait_until: 'FINAL'}), call = tx.transaction?.actions?.[0]?.FunctionCall, args = call ? JSON.parse(Buffer.from(call.args, 'base64').toString('utf8')) : null;
    check('LIVE_PUBLIC', `${type}: ledger append() FINAL, signed by the agent, on the ledger contract`, finalOk(tx) && call?.method_name === 'append' && tx.transaction.receiver_id === contract && tx.transaction.signer_id === signer, `${c.txHash.slice(0, 12)}...`);
    const rec = args?.records?.find(x => x.type === type);
    check('LIVE_PUBLIC', `${type}: payload hash recomputes from the recorded event data`, Boolean(rec) && args.company_hash === companyHash && rec.payloadHash === hash({domain: 'company-ledger:payload:v1', companyHash, data: c.events[0].data}));
  } catch (e) { check('LIVE_PUBLIC', `${type}: ledger tx lookup`, false, String(e.message).slice(0, 80)); }
}
const types = r.ledgerCommits.map(c => c.events[0].type);
check('LOCAL_ARTIFACT', 'ledger has sale.confirmed, procurement.confirmed and inference.consumed', ['sale.confirmed', 'procurement.confirmed', 'inference.consumed'].every(t => types.includes(t)), types.join(', '));
{
  // Invariant: a purchase larger than the sale revenue is never silent. The shortfall must be disclosed with a ledger-recorded funding event.
  const shortfall = BigInt(purchase.paidYocto) - BigInt(sale.amountYocto), funding = r.funding;
  check('LOCAL_ARTIFACT', shortfall <= 0n ? 'credit purchase does not exceed customer revenue' : 'purchase exceeds sale revenue: the shortfall is disclosed and the agent funding is on the ledger',
    shortfall <= 0n || Boolean(funding?.ledgerTx && funding.correlationId && (r.labels ?? []).some(l => /shortfall/.test(l))), shortfall <= 0n ? `${purchase.paidYocto} <= ${sale.amountYocto} yocto` : `purchase ${purchase.paidYocto} yocto vs sale ${sale.amountYocto}; shortfall ${shortfall} yocto; agent withdrawal ${funding?.fundedYocto ?? 'none'} yocto (${funding?.correlationId ?? 'unrecorded'}) plus the company wallet's own prior balance`);
}
check('LOCAL_ARTIFACT', 'NanoGPT balance rose after the purchase and fell after inference', Number(purchase.balanceAfterUsd) > Number(purchase.balanceBeforeUsd) && Number(answer.balanceAfterUsd) < Number(answer.balanceBeforeUsd), `$${purchase.balanceBeforeUsd} -> $${purchase.balanceAfterUsd}; inference cost $${answer.costUsd}`);

if (process.env.NANOGPT_API_KEY) {
  try {
    const {createNanoGpt} = await import('../src/cloud-funding/nanogpt.mjs'), n = createNanoGpt({apiKey: process.env.NANOGPT_API_KEY});
    check('LIVE_AUTHED', 'NanoGPT reports the invoice Completed', String((await n.status(purchase.invoiceTxId)).status).toLowerCase() === 'completed', purchase.invoiceTxId);
    check('LIVE_AUTHED', 'NanoGPT balance is consistent with the recorded post-inference balance', Math.abs(Number((await n.balance()).usd) - Number(answer.balanceAfterUsd)) < 0.01);
  } catch (e) { check('LIVE_AUTHED', 'NanoGPT re-read', false, String(e.message).slice(0, 80)); }
} else console.log('SKIP  [LIVE_AUTHED] NanoGPT re-read (set NANOGPT_API_KEY to enable)');

const failed = results.filter(x => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}`);
console.log('Not proven here: whether the customer wallet belongs to an independent third party (see the note above); the inference cost is a balance delta measured by us; NanoGPT is not TEE-attested; a ledger commitment proves the record existed, not that the business event is true.');
process.exitCode = failed ? 1 : 0;
