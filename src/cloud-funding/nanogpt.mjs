// NanoGPT: an inference provider whose API sells credit to an agent for crypto, no human top-up.
//   POST /api/transaction/create/near {amount} -> deposit address + expiry
//   (agent pays native NEAR to that address)    GET /api/transaction/status/near/{txId} -> Completed
//   POST /api/check-balance (x-api-key)         -> usd_balance      POST /api/v1/chat/completions (OpenAI-compatible)
// Honest label: NanoGPT is NOT TEE-attested. Private, verified inference stays on NEAR AI Cloud.
const fail = (code, extra = {}) => { throw Object.assign(new Error(code), {code, ...extra}); };
const YOCTO = 10n ** 24n;
export const nearToYocto = s => { const m = /^(\d{1,9})(?:\.(\d{1,24}))?$/.exec(String(s)); if (!m) fail('AMOUNT_INVALID'); return BigInt(m[1]) * YOCTO + BigInt((m[2] ?? '').padEnd(24, '0')); };
export const yoctoToNear = y => `${y / YOCTO}.${String(y % YOCTO).padStart(24, '0').replace(/0+$/, '') || '0'}`;
const NEAR_ACCOUNT = /^(?:[0-9a-f]{64}|(?:[a-z\d]+[-_])*[a-z\d]+(?:\.(?:[a-z\d]+[-_])*[a-z\d]+)*)$/;

export function createNanoGpt({apiKey, transport = fetch, origin = 'https://nano-gpt.com', apiOrigin = 'https://api.nano-gpt.com'} = {}) {
  if (!apiKey) fail('NANOGPT_NOT_CONFIGURED');
  const call = async (url, {method = 'GET', body, auth = 'x-api-key'} = {}) => {
    const r = await transport(url, {method, redirect: 'error', signal: AbortSignal.timeout(60000), headers: {...(auth === 'bearer' ? {authorization: `Bearer ${apiKey}`} : {'x-api-key': apiKey}), ...(body ? {'content-type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
    const json = await r.json().catch(() => null);
    if (!r.ok) fail('NANOGPT_HTTP_ERROR', {httpStatus: r.status, detail: json?.message ?? json?.error ?? null});
    return json;
  };
  return Object.freeze({
    limits: () => call(`${origin}/api/transaction/limits/near`),
    createInvoice: amount => call(`${origin}/api/transaction/create/near`, {method: 'POST', body: {amount}}),
    status: async txId => { const raw = await call(`${origin}/api/transaction/status/near/${encodeURIComponent(txId)}`); const statuses = {COMPLETED:'Completed',FAILED:'Failed',EXPIRED:'Expired'}; return {...raw, rawStatus:raw.status, status:statuses[String(raw.status).toUpperCase()] ?? raw.status}; },
    balance: async () => { const b = await call(`${origin}/api/check-balance`, {method: 'POST'}); return {usd: String(b.usd_balance)}; },
    chat: ({model, messages, maxTokens = 200}) => call(`${apiOrigin}/api/v1/chat/completions`, {method: 'POST', auth: 'bearer', body: {model, messages, max_tokens: maxTokens}}),
  });
}

/** Agent buys credit: validate invoice -> pay exact amount once -> wait for Completed. Never pays twice, never records an unconfirmed credit.
 *  @param sendNear async ({to, yocto}) => {txHash} (signs with the company wallet) */
export function createNanoGptPurchase({nano, sendNear, committer = null, companyId = 'local-workspace', clock = () => new Date(), sleep = ms => new Promise(r => setTimeout(r, ms)), onPayment = null, pollMs = 15000, timeoutMs = 25 * 60000}) {
  return Object.freeze({
    /** A payment already made but never recorded (timeout, crash, status mismatch): check the SAME invoice, never pay again. */
    async recover({payment, saleId = null}) {
      const inv = await nano.status(payment.invoiceTxId);
      if (String(inv.status).toLowerCase() !== 'completed') fail('CREDIT_NOT_COMPLETED', {status: inv.status, payment});
      if (inv.payinHash !== payment.txHash) fail('PAYIN_MISMATCH', {payment});               // the provider must name OUR payment transaction
      const credited = String(inv.amountFiat), after = await nano.balance();
      if (!(Number(credited) > 0) || Number(after.usd) < Number(credited)) fail('CREDIT_NOT_VISIBLE_IN_BALANCE', {credited, balance: after.usd, payment});
      const receipt = {status: 'purchased', provider: 'nanogpt', companyId, saleId, invoiceTxId: payment.invoiceTxId, address: payment.address, paidYocto: payment.yocto, paymentTxHash: payment.txHash,
        creditedUsd: credited, balanceBeforeUsd: (Number(after.usd) - Number(credited)).toFixed(8), balanceBeforeDerived: true, balanceAfterUsd: after.usd, creditQuote: inv.creditQuote ?? null, at: clock().toISOString(), recovered: true,
        label: 'recovered from the saved invoice after the original wait missed COMPLETED; balanceBefore is derived (balance minus the provider-reported credit); NanoGPT is not TEE-attested'};
      if (committer) receipt.ledgerTx = (await committer.append([{type: 'procurement.confirmed', data: {companyId, actorId: 'agent', kind: 'inference_credit', provider: 'nanogpt', saleId, invoiceTxId: payment.invoiceTxId,
        paidYocto: payment.yocto, paymentTxHash: payment.txHash, balanceBeforeUsd: receipt.balanceBeforeUsd, balanceAfterUsd: after.usd, creditedUsd: credited, recovered: true}}])).txHash;
      return receipt;
    },
    async purchase({maxYocto, saleId = null}) {
      const cap = BigInt(maxYocto), lim = await nano.limits();
      const min = nearToYocto((Math.ceil(lim.minimum * 1e6) / 1e6).toFixed(6));
      if (min > cap) fail('MINIMUM_EXCEEDS_BUDGET', {minimumYocto: min.toString()});
      const before = await nano.balance();
      const inv = await nano.createInvoice(Number(yoctoToNear(min)));
      // Refuse anything we cannot pay exactly: memo/tag requirements, odd addresses, near-expired invoices, amount drift.
      if (!inv?.txId || typeof inv.address !== 'string' || !NEAR_ACCOUNT.test(inv.address)) fail('INVOICE_ADDRESS_INVALID');
      if (['memo', 'tag', 'destinationTag', 'paymentId'].some(k => inv[k])) fail('INVOICE_NEEDS_MEMO');
      if (!(Date.parse(inv.expiresAt) - clock().getTime() > 5 * 60000)) fail('INVOICE_EXPIRING');
      const pay = nearToYocto(String(inv.amount)); if (pay > cap || pay < min) fail('INVOICE_AMOUNT_UNEXPECTED', {amount: inv.amount});
      const sent = await sendNear({to: inv.address, yocto: pay});                        // the ONLY money movement; no retry
      // Persist the invoice id the moment money has left, so a provider delay or crash cannot lose the only handle needed to check or finish this payment.
      await onPayment?.({invoiceTxId: inv.txId, address: inv.address, paymentTxHash: sent.txHash, yocto: pay.toString()});
      const deadline = clock().getTime() + timeoutMs; let status = inv.status;
      while (clock().getTime() < deadline) {
        status = String((await nano.status(inv.txId)).status);
        if (['completed', 'failed', 'expired'].includes(status.toLowerCase())) break;   // the provider returns COMPLETED; never compare case-sensitively
        await sleep(pollMs);
      }
      if (status.toLowerCase() !== 'completed') fail('CREDIT_NOT_COMPLETED', {status, payment: {txHash: sent.txHash, invoiceTxId: inv.txId, address: inv.address, yocto: pay.toString()}});
      const after = await nano.balance();
      const receipt = {status: 'purchased', provider: 'nanogpt', companyId, saleId, invoiceTxId: inv.txId, address: inv.address, paidYocto: pay.toString(), paymentTxHash: sent.txHash,
        balanceBeforeUsd: before.usd, balanceAfterUsd: after.usd, at: clock().toISOString(),
        label: 'native NEAR paid from the company wallet to a NanoGPT deposit invoice; NanoGPT is not TEE-attested'};
      if (Number(after.usd) <= Number(before.usd)) fail('BALANCE_DID_NOT_RISE', {receipt});
      if (committer) receipt.ledgerTx = (await committer.append([{type: 'procurement.confirmed', data: {companyId, actorId: 'agent', kind: 'inference_credit', provider: 'nanogpt', saleId, invoiceTxId: inv.txId,
        paidYocto: receipt.paidYocto, paymentTxHash: sent.txHash, balanceBeforeUsd: before.usd, balanceAfterUsd: after.usd}}])).txHash;
      return receipt;
    },
  });
}
