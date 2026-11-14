import test from 'node:test';
import assert from 'node:assert/strict';
import {createIncomingPayments} from '../../src/payments/incoming.mjs';

function make({status = 'SUCCESS', balances = ['0', '500000']} = {}) {
  let i = 0;
  return createIncomingPayments({apiKey: 'a', agentId: 'ag', grantToken: 'g', asset: 'usdc', sdkLoader: async () => ({createIdempotencyKey: () => 'k', createAgentApi: () => ({
    deposit: async () => ({correlation_id: 'op_1', details: {deposit_address: 'addr'}}), getStatus: async () => ({status}),
    forGrant: () => ({getBalances: async () => ({balances: [{asset_id: 'usdc', available_raw: balances[Math.min(i++, balances.length - 1)]}]})})})})});
}
test('received only when provider SUCCESS and the wallet balance rose by the invoiced amount', async () => {
  for (const [opts, expected] of [[{}, true], [{balances: ['0', '0']}, false], [{status: 'PENDING'}, false]]) {
    const p = make(opts), inv = await p.openInvoice({amount: '500000'}); assert.equal(inv.depositAddress, 'addr');
    assert.equal((await p.settle(inv)).received, expected);
  }
  await assert.rejects(make().openInvoice({amount: '0.5'}), {code: 'AMOUNT_INVALID'});
});
