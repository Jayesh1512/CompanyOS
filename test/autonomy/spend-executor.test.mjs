import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createJournal} from '../../src/journal/index.mjs';
import {createSpendExecutor} from '../../src/workflow/spend.mjs';

const USDC = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
const request = {id: 'cmd:spend', companyId: 'c', actorId: 'agent-1', asset: USDC, amount: '25000', purpose: 'buy inference', state: 'proposed', admission: {commandHash: 'h'}};

async function setup({ledger, ceiling = null, reservations = [], seed = []}) {
  const journal = await createJournal({directory: await mkdtemp(path.join(os.tmpdir(), 'spend-exec-'))});
  await journal.transaction({actionId: 'seed', fingerprint: 'seed'}, tx => { tx.put('spendRequests', request.id, request); return null; });
  for (const r of seed) await journal.transaction({actionId: `seed:${r.id}`, fingerprint: r.id}, tx => { tx.put('spendRequests', r.id, r); return null; });
  const sent = [];
  const agentSpend = {capability: () => ({configured: true}), spend: async r => { sent.push(r); return {status: 'SUCCESS', correlationId: 'op_1', txHash: null}; }};
  return {journal, sent, executor: createSpendExecutor({journal, agentSpend, ledger, companyId: 'c', getCeiling: () => ceiling, getFinancial: () => ({reservations})})};
}

test('a completed spend persists the exact ledger commitment so it can be re-verified', async () => {
  const appended = [];
  const {journal, sent, executor} = await setup({ledger: {append: async events => { appended.push(events); return {txHash: 'TX1', correlationId: 'op_2'}; }}});
  const result = await executor.execute(request.id);
  const saved = journal.get('spendRequests', request.id);
  assert.equal(result.status, 'completed');
  assert.equal(sent[0].kind, 'swap');
  assert.notEqual(sent[0].destination, USDC); // a swap must move between two different assets
  assert.equal(saved.ledgerCommit.txHash, 'TX1');
  assert.deepEqual({type: saved.ledgerCommit.type, data: saved.ledgerCommit.data}, appended[0][0]); // verbatim: the verifier recomputes the payload hash from it
  assert.equal(saved.ledgerCommit.data.spendId, request.id);
  await journal.close();
});

test('a ledger failure never fabricates a ledger link or undoes the spend result', async () => {
  const {journal, executor} = await setup({ledger: {append: async () => { throw new Error('LEDGER_APPEND_FAILED'); }}});
  const result = await executor.execute(request.id);
  const saved = journal.get('spendRequests', request.id);
  assert.equal(result.status, 'completed');
  assert.equal(saved.state, 'completed');
  assert.equal(saved.ledgerCommit, undefined);
  await journal.close();
});

// --- Lifetime ceiling regression: agent spend must count against the $5 cap (judge finding). ---
const CAP = '5000000000'; // $5 in nanoUSD; the request above is 25000 micro-USDC = $0.025
const prior = (id, amount, extra = {}) => ({id, companyId: 'c', asset: USDC, amount, state: 'completed', admission: {commandHash: 'h'}, ...extra});

test('a spend that would pass the $5 lifetime ceiling is denied before any provider call', async () => {
  const {journal, sent, executor} = await setup({ceiling: CAP, seed: [prior('old', '4990000')]}); // $4.99 already spent + $0.025
  const result = await executor.execute(request.id);
  assert.deepEqual([result.status, result.reasonCode], ['denied', 'TOTAL_CEILING_EXCEEDED']);
  assert.equal(sent.length, 0);
  assert.equal(journal.get('spendRequests', request.id).state, 'denied');
  await journal.close();
});

test('a spend exactly reaching the ceiling is allowed, one unit over is denied', async () => {
  const ok = await setup({ceiling: CAP, seed: [prior('old', '4975000')]}); // 4.975 + 0.025 = 5.000
  assert.equal((await ok.executor.execute(request.id)).status, 'completed');
  await ok.journal.close();
  const over = await setup({ceiling: CAP, seed: [prior('old', '4975001')]});
  assert.equal((await over.executor.execute(request.id)).reasonCode, 'TOTAL_CEILING_EXCEEDED');
  await over.journal.close();
});

test('inference/funding reservations and earlier spends share one cap', async () => {
  const reservations = [{actionId: 'a1', status: 'reconciled', upperBoundNanoUsd: '4990000000', actualCostNanoUsd: '4990000000'}];
  const {journal, sent, executor} = await setup({ceiling: CAP, reservations});
  assert.equal((await executor.execute(request.id)).reasonCode, 'TOTAL_CEILING_EXCEEDED'); // 4.99 + 0.025
  assert.equal(sent.length, 0);
  await journal.close();
});

test('provider-confirmed failed or refunded spends and denied/blocked ones do not count; unknown ones do', async () => {
  const seed = [prior('f', '4000000', {state: 'failed', providerStatus: 'REFUNDED'}), prior('d', '4000000', {state: 'denied'}), prior('b', '4000000', {state: 'blocked'})];
  const clear = await setup({ceiling: CAP, seed});
  assert.equal((await clear.executor.execute(request.id)).status, 'completed');
  await clear.journal.close();
  const unknown = await setup({ceiling: CAP, seed: [prior('u', '4990000', {state: 'unknown'})]});
  assert.equal((await unknown.executor.execute(request.id)).reasonCode, 'TOTAL_CEILING_EXCEEDED');
  await unknown.journal.close();
});

test('an unpriceable asset fails closed instead of slipping under the cap', async () => {
  const {journal, sent, executor} = await setup({ceiling: CAP, seed: [{...request, id: 'wrap', asset: 'nep141:wrap.near', amount: '1'}]});
  assert.equal((await executor.execute('wrap')).reasonCode, 'SPEND_USD_BOUND_REQUIRED');
  assert.equal(sent.length, 0);
  await journal.close();
});

test('an unpriceable earlier spend or unreadable financial facts fail closed', async () => {
  const a = await setup({ceiling: CAP, seed: [prior('w', '1', {asset: 'nep141:wrap.near'})]});
  assert.equal((await a.executor.execute(request.id)).reasonCode, 'SPEND_EXPOSURE_UNPRICED');
  await a.journal.close();
  const b = await setup({ceiling: CAP});
  const broken = createSpendExecutor({journal: b.journal, agentSpend: {capability: () => ({configured: true}), spend: async () => { throw new Error('must not dispatch'); }}, companyId: 'c', getCeiling: () => CAP, getFinancial: () => ({})});
  assert.equal((await broken.execute(request.id)).reasonCode, 'TOTAL_CEILING_FACTS_REQUIRED');
  await b.journal.close();
});

test('the executor cannot be constructed without the ceiling wiring, so the cap cannot be forgotten', async () => {
  const journal = await createJournal({directory: await mkdtemp(path.join(os.tmpdir(), 'spend-exec-'))});
  const agentSpend = {capability: () => ({configured: true}), spend: async () => ({})};
  assert.throws(() => createSpendExecutor({journal, agentSpend, companyId: 'c'}), /getCeiling and getFinancial/);
  assert.throws(() => createSpendExecutor({journal, agentSpend, companyId: 'c', getCeiling: () => null}), /getCeiling and getFinancial/);
  await journal.close();
});

test('every createSpendExecutor call site in the repo passes the ceiling wiring', async () => {
  const {execFileSync} = await import('node:child_process');
  const files = execFileSync('git', ['grep', '-l', 'createSpendExecutor(', '--', 'src', 'scripts'], {encoding: 'utf8', cwd: path.resolve(import.meta.dirname, '../..')}).split('\n').filter(Boolean).filter(f => f !== 'src/workflow/spend.mjs');
  assert.ok(files.length >= 2);
  const {readFile} = await import('node:fs/promises');
  for (const f of files) {
    const text = await readFile(path.resolve(import.meta.dirname, '../..', f), 'utf8');
    for (const [, call] of text.matchAll(/createSpendExecutor\(([\s\S]*?)\);/g)) assert.match(call, /getCeiling[\s\S]*getFinancial/, `${f} must wire the ceiling`);
  }
});
