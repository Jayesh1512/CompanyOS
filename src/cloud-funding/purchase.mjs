// Agent buys NEAR AI Cloud inference credit with company-wallet USDC.
//
// NEAR AI Cloud has no purchase API (checked against its OpenAPI). It does have a documented
// org-to-org credit transfer: POST /v1/organizations/{org}/credit/transfer, callable with an
// `organization_credential` (credits:transfer). So the purchase is two legs:
//   1. PAY:      agent pays USDC through NEAR Intents (Agent API transfer, owner-signed grant+policy)
//                to the credit seller's Intents account.
//   2. DELIVER:  the seller organization transfers the same value in credit to the agent's own
//                organization (nanoUSD), idempotent on the payment's correlation id.
// Disclosure carried in every receipt: the seller is an organization that already holds credit
// (here, operated by the owner). Real USDC moves wallet -> seller and real credit moves seller ->
// agent org, but the two legs are linked by this module, not by an on-chain atomic swap.
const CLOUD = 'https://cloud-api.near.ai';
const fail = (code, extra = {}) => { throw Object.assign(new Error(code), {code, ...extra}); };
const uint = v => typeof v === 'string' && /^[1-9][0-9]{0,30}$/.test(v) ? BigInt(v) : fail('AMOUNT_INVALID');
export const USDC_ATOMIC_TO_NANO_USD = 1000n; // 6-decimal USDC atomic -> 9-decimal nanoUSD, 1 USDC = $1

/** Seller leg: the credit-holding organization transfers credit to the buyer organization. */
export function createCreditSeller({orgId, credential, recipientOrgId, transport = fetch}) {
  if (!orgId || !credential || !recipientOrgId) fail('SELLER_NOT_CONFIGURED');
  const call = async (path, init) => {
    const r = await transport(CLOUD + path, {redirect: 'error', signal: AbortSignal.timeout(30000), ...init, headers: {authorization: `Bearer ${credential}`, 'content-type': 'application/json', ...init?.headers}});
    const body = await r.json().catch(() => null);
    if (!r.ok) fail('CREDIT_TRANSFER_REFUSED', {httpStatus: r.status, detail: body?.error?.message ?? null});
    return body;
  };
  return Object.freeze({
    recipientOrgId,
    transfer: ({amountNanoUsd, idempotencyKey, memo, metadata}) => call(`/v1/organizations/${encodeURIComponent(orgId)}/credit/transfer`, {method: 'POST', headers: {'idempotency-key': idempotencyKey},
      body: JSON.stringify({recipient_organization_id: recipientOrgId, source_credit_type: 'payment', amount: Number(amountNanoUsd), memo, metadata})}),
    read: id => call(`/v1/organizations/${encodeURIComponent(orgId)}/credit/transfers/${encodeURIComponent(id)}`, {method: 'GET'}),
  });
}

/** @param spend  port with spend({kind:'transfer',asset,amount,destination}) (src/custody/agent-spend.mjs)
 *  @param seller createCreditSeller(...)  @param committer ledger committer {append(events)} */
export function createCreditPurchase({spend, seller, committer = null, asset, sellerDestination, companyId = 'local-workspace', clock = () => new Date()}) {
  if (!spend || !seller || !asset || !sellerDestination) fail('PURCHASE_NOT_CONFIGURED');
  return Object.freeze({
    /** Buy `usdcAtomic` of credit. `maxUsdcAtomic` is a hard cap for this call. Never retries a payment. */
    async purchase({usdcAtomic, maxUsdcAtomic, saleId = null}) {
      const amount = uint(usdcAtomic); if (amount > uint(maxUsdcAtomic ?? usdcAtomic)) fail('OVER_CAP');
      const nano = amount * USDC_ATOMIC_TO_NANO_USD;
      // 1. PAY. Anything but a terminal SUCCESS stops here: no credit is requested for an unconfirmed payment.
      const pay = await spend.spend({kind: 'transfer', asset, amount: usdcAtomic, destination: sellerDestination});
      if (pay.status !== 'SUCCESS') fail('PAYMENT_NOT_CONFIRMED', {payment: {status: pay.status, correlationId: pay.correlationId, failureCode: pay.failureCode}});
      // 2. DELIVER. Idempotent on the payment, so a retried run cannot double-credit.
      const key = `credit-purchase:${pay.correlationId}`;
      const sent = await seller.transfer({amountNanoUsd: nano, idempotencyKey: key, memo: 'credit purchase by agent', metadata: {paymentCorrelationId: pay.correlationId, saleId}});
      const id = sent?.id ?? sent?.transfer_id ?? fail('TRANSFER_ID_MISSING', {payment: {correlationId: pay.correlationId}});
      const record = await seller.read(id);
      const status = String(record?.status ?? sent?.status ?? '').toLowerCase();
      if (!['completed', 'succeeded', 'success', 'settled', 'confirmed'].includes(status)) fail('TRANSFER_NOT_CONFIRMED', {transferId: id, status, payment: {correlationId: pay.correlationId}});
      const receipt = {status: 'purchased', companyId, saleId, usdcAtomic, creditNanoUsd: nano.toString(), payment: {correlationId: pay.correlationId, txHash: pay.txHash ?? null, destination: sellerDestination},
        transfer: {id, status, recipientOrgId: seller.recipientOrgId}, at: clock().toISOString(),
        label: 'USDC paid from company wallet via NEAR Intents; credit delivered by org-to-org transfer from an owner-operated credit seller'};
      if (committer) {
        const ledger = await committer.append([{type: 'procurement.confirmed', data: {companyId, actorId: 'agent', kind: 'cloud_credit', saleId, usdcAtomic, creditNanoUsd: receipt.creditNanoUsd,
          paymentCorrelationId: pay.correlationId, transferId: id, recipientOrgId: seller.recipientOrgId}}]);
        receipt.ledgerTx = ledger.txHash;
      }
      return receipt;
    },
  });
}
