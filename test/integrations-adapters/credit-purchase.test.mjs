import test from 'node:test';
import assert from 'node:assert/strict';
import {createCreditPurchase, createCreditSeller} from '../../src/cloud-funding/purchase.mjs';

function make({pay = {status: 'SUCCESS', correlationId: 'op_1', txHash: 'h'}, transferRes = {id: 't1'}, readRes = {status: 'completed'}} = {}) {
  const log = {spend: [], transfer: [], ledger: []};
  const spend = {spend: async r => { log.spend.push(r); return pay; }};
  const seller = {recipientOrgId: 'orgB', transfer: async r => { log.transfer.push(r); return transferRes; }, read: async () => readRes};
  const committer = {append: async e => { log.ledger.push(...e); return {txHash: 'L'}; }};
  return {log, p: createCreditPurchase({spend, seller, committer, asset: 'usdc', sellerDestination: 'seller.near'})};
}
test('pays USDC first, then delivers equal credit idempotently, then records on the ledger', async () => {
  const {p, log} = make(), r = await p.purchase({usdcAtomic: '100000', saleId: 's1'});
  assert.deepEqual(log.spend[0], {kind: 'transfer', asset: 'usdc', amount: '100000', destination: 'seller.near'});
  assert.equal(log.transfer[0].amountNanoUsd, 100000000n); assert.equal(log.transfer[0].idempotencyKey, 'credit-purchase:op_1');
  assert.equal(r.status, 'purchased'); assert.equal(r.creditNanoUsd, '100000000'); assert.equal(r.ledgerTx, 'L');
  assert.equal(log.ledger[0].type, 'procurement.confirmed');
});
test('an unconfirmed payment never requests credit', async () => {
  const {p, log} = make({pay: {status: 'FAILED', correlationId: 'op_2'}});
  await assert.rejects(p.purchase({usdcAtomic: '100000'}), {code: 'PAYMENT_NOT_CONFIRMED'});
  assert.equal(log.transfer.length, 0); assert.equal(log.ledger.length, 0);
});
test('credit transfer that is not confirmed yields no receipt and no ledger event', async () => {
  const {p, log} = make({readRes: {status: 'pending'}});
  await assert.rejects(p.purchase({usdcAtomic: '100000'}), {code: 'TRANSFER_NOT_CONFIRMED'}); assert.equal(log.ledger.length, 0);
  await assert.rejects(make({transferRes: {}}).p.purchase({usdcAtomic: '100000'}), {code: 'TRANSFER_ID_MISSING'});
});
test('cap and amount validation happen before any payment', async () => {
  const {p, log} = make();
  await assert.rejects(p.purchase({usdcAtomic: '200000', maxUsdcAtomic: '100000'}), {code: 'OVER_CAP'});
  await assert.rejects(p.purchase({usdcAtomic: '0.5'}), {code: 'AMOUNT_INVALID'}); assert.equal(log.spend.length, 0);
});
test('seller posts the documented transfer body with the org credential', async () => {
  const seen = []; const transport = async (url, init) => { seen.push({url, init}); return new Response(JSON.stringify({id: 'x'}), {status: 200}); };
  const s = createCreditSeller({orgId: 'orgA', credential: 'cred', recipientOrgId: 'orgB', transport});
  await s.transfer({amountNanoUsd: 5n, idempotencyKey: 'k', memo: 'm', metadata: {}});
  assert.equal(seen[0].url, 'https://cloud-api.near.ai/v1/organizations/orgA/credit/transfer'); assert.equal(seen[0].init.headers.authorization, 'Bearer cred');
  assert.deepEqual(JSON.parse(seen[0].init.body), {recipient_organization_id: 'orgB', source_credit_type: 'payment', amount: 5, memo: 'm', metadata: {}});
  assert.throws(() => createCreditSeller({}), {code: 'SELLER_NOT_CONFIGURED'});
});
