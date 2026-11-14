// Receive a customer payment into the COMPANY WALLET = the agent's confidential Intents balance
// (the balance the agent can later spend from under its grant). A payment counts as received only
// when BOTH hold: the deposit's own correlation reaches provider SUCCESS, and the balance rose by
// at least the invoiced amount. This module moves no funds: the customer pays the address.
const fail = (code, extra = {}) => { throw Object.assign(new Error(code), {code, ...extra}); };
const atomic = v => typeof v === 'string' && /^[1-9][0-9]{0,30}$/.test(v) ? BigInt(v) : fail('AMOUNT_INVALID');
async function defaultSdk() { return import('@near-intents-agent-api/sdk'); }

export function createIncomingPayments({apiKey, baseUrl, agentId, grantToken, asset, sdkLoader = defaultSdk} = {}) {
  if (!apiKey || !agentId || !grantToken || !asset) fail('INCOMING_NOT_CONFIGURED');
  const sdk = sdkLoader().then(m => { const api = m.createAgentApi({apiKey, baseUrl}); return {api, grant: api.forGrant(grantToken), key: m.createIdempotencyKey}; });
  async function balance() {
    const {grant} = await sdk;
    return BigInt(((await grant.getBalances(agentId, {source: 'confidential'})).balances ?? []).find(b => b.asset_id === asset)?.available_raw ?? '0');
  }
  async function openInvoice({amount}) {
    atomic(amount); const {api, key} = await sdk, before = await balance();
    const d = await api.deposit(agentId, {origin_asset: asset, amount, confidential: true}, {idempotencyKey: key()});
    const address = d.details?.deposit_address ?? d.details?.request?.deposit_address;
    if (!address || !d.correlation_id) fail('DEPOSIT_ADDRESS_UNAVAILABLE');
    return {correlationId: d.correlation_id, depositAddress: address, amount, asset, balanceBefore: before.toString()};
  }
  async function settle(invoice) {
    const {api} = await sdk, status = await api.getStatus(invoice.correlationId, {}), after = await balance(), delta = after - BigInt(invoice.balanceBefore);
    return {received: status.status === 'SUCCESS' && delta >= atomic(invoice.amount), providerStatus: status.status, balanceAfter: after.toString(), delta: delta.toString(), correlationId: invoice.correlationId};
  }
  return Object.freeze({openInvoice, settle, balance});
}
