import test from 'node:test';
import assert from 'node:assert/strict';
import {createNanoGpt, createNanoGptPurchase, nearToYocto, yoctoToNear} from '../../src/cloud-funding/nanogpt.mjs';

const NOW = Date.parse('2026-11-14T20:00:00Z');
function make({inv = {txId: 't1', address: 'a'.repeat(64), amount: 0.326862, status: 'New', expiresAt: new Date(NOW + 3600000).toISOString()}, statuses = ['Processing', 'Completed'], bal = ['0.10', '1.09']} = {}) {
  const log = {sent: [], ledger: [], invoiceAmounts: []}; let s = 0, b = 0;
  const nano = {limits: async () => ({minimum: 0.32686179662201403}), createInvoice: async a => { log.invoiceAmounts.push(a); return inv; },
    status: async () => ({status: statuses[Math.min(s++, statuses.length - 1)]}), balance: async () => ({usd: bal[Math.min(b++, bal.length - 1)]})};
  const buyer = createNanoGptPurchase({nano, sendNear: async x => { log.sent.push(x); return {txHash: 'H'}; }, committer: {append: async e => { log.ledger.push(...e); return {txHash: 'L'}; }}, clock: () => new Date(NOW), sleep: async () => {}});
  return {log, buyer};
}
test('unit conversion is exact', () => { assert.equal(nearToYocto('0.326862'), 326862n * 10n ** 18n); assert.equal(yoctoToNear(326862n * 10n ** 18n), '0.326862'); assert.throws(() => nearToYocto('1e3'), {code: 'AMOUNT_INVALID'}); });
test('pays the exact invoice once, waits for Completed, records the credit on the ledger', async () => {
  const {buyer, log} = make(), r = await buyer.purchase({maxYocto: nearToYocto('0.5').toString(), saleId: 's'});
  assert.equal(log.sent.length, 1); assert.equal(log.sent[0].yocto, nearToYocto('0.326862')); assert.equal(r.status, 'purchased'); assert.equal(r.ledgerTx, 'L'); assert.equal(log.ledger[0].type, 'procurement.confirmed');
});
test('refuses unsafe invoices BEFORE any payment', async () => {
  const base = {txId: 't1', address: 'a'.repeat(64), amount: 0.326862, expiresAt: new Date(NOW + 3600000).toISOString()};
  for (const [inv, code] of [[{...base, memo: '123'}, 'INVOICE_NEEDS_MEMO'], [{...base, address: 'Not An Account!'}, 'INVOICE_ADDRESS_INVALID'], [{...base, expiresAt: new Date(NOW + 60000).toISOString()}, 'INVOICE_EXPIRING'], [{...base, amount: 9}, 'INVOICE_AMOUNT_UNEXPECTED']]) {
    const {buyer, log} = make({inv}); await assert.rejects(buyer.purchase({maxYocto: nearToYocto('0.5').toString()}), {code}); assert.equal(log.sent.length, 0);
  }
  const {buyer, log} = make(); await assert.rejects(buyer.purchase({maxYocto: nearToYocto('0.1').toString()}), {code: 'MINIMUM_EXCEEDS_BUDGET'}); assert.equal(log.sent.length, 0);
});
test('paid but not Completed, or balance did not rise: no ledger event, payment is reported not hidden', async () => {
  let m = make({statuses: ['Failed']}); await assert.rejects(m.buyer.purchase({maxYocto: nearToYocto('0.5').toString()}), e => e.code === 'CREDIT_NOT_COMPLETED' && e.payment.txHash === 'H'); assert.equal(m.log.ledger.length, 0);
  m = make({bal: ['1.0', '1.0']}); await assert.rejects(m.buyer.purchase({maxYocto: nearToYocto('0.5').toString()}), {code: 'BALANCE_DID_NOT_RISE'}); assert.equal(m.log.ledger.length, 0);
});
test('client sends the documented requests with the key', async () => {
  const seen = []; const transport = async (url, init) => { seen.push({url, init}); return new Response(JSON.stringify({usd_balance: '1.5', txId: 'x'}), {status: 200}); };
  const n = createNanoGpt({apiKey: 'k', transport}); await n.balance(); await n.createInvoice(0.4); await n.chat({model: 'm', messages: []});
  assert.equal(seen[0].url, 'https://nano-gpt.com/api/check-balance'); assert.equal(seen[0].init.headers['x-api-key'], 'k');
  assert.equal(seen[1].url, 'https://nano-gpt.com/api/transaction/create/near'); assert.deepEqual(JSON.parse(seen[1].init.body), {amount: 0.4});
  assert.equal(seen[2].url, 'https://api.nano-gpt.com/api/v1/chat/completions'); assert.equal(seen[2].init.headers.authorization, 'Bearer k'); assert.throws(() => createNanoGpt({}), {code: 'NANOGPT_NOT_CONFIGURED'});
});
