// Closed loop, all real: customer pays NEAR -> company wallet -> agent buys inference credit from NanoGPT
// (programmatic invoice, paid in native NEAR) -> agent runs LLM inference on that credit -> every step on the ledger.
//   node scripts/demo-nanogpt-loop.mjs preflight                 # read-only: keys, balances, NanoGPT minimum, planned spend
//   node scripts/demo-nanogpt-loop.mjs customer-pay [near=0.40]  # customer (owner wallet; only ~0.15 NEAR is spendable there, the rest is locked for contract storage) pays the company wallet; commits sale.confirmed
//   node scripts/demo-nanogpt-loop.mjs record-sale <txHash> <senderAccount>   # a payment YOU sent from your own wallet: verified on-chain, then committed (no signing here)
//   node scripts/demo-nanogpt-loop.mjs buy-credits               # agent pays a NanoGPT invoice from the company wallet; commits procurement.confirmed
//   node scripts/demo-nanogpt-loop.mjs answer "<question>"       # inference on the bought credit; cost = balance delta; commits inference.consumed
//   node scripts/demo-nanogpt-loop.mjs report                    # artifacts/mainnet-proof/nanogpt-loop.json (checked by scripts/verify-nanogpt-loop.mjs)
// Labels: the "customer" is the owner's wallet (a real on-chain payment, not a third-party buyer);
// NanoGPT is not TEE-attested (private verified inference stays on NEAR AI Cloud).
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {Account, KeyPair, KeyPairSigner, JsonRpcProvider, actions} from 'near-api-js';
import {createNanoGpt, createNanoGptPurchase, nearToYocto, yoctoToNear} from '../src/cloud-funding/nanogpt.mjs';
import {documents} from '../src/support/demo.mjs';

try { loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const [, , step = 'preflight', ...rest] = process.argv;
const RPC = 'https://free.rpc.fastnear.com', walletDir = '.runtime/company-ledger-wallet/mainnet', stateFile = '.runtime/nanogpt-loop/state.json', MODEL = process.env.NANOGPT_MODEL ?? 'minimax/minimax-m2.7';
const provider = new JsonRpcProvider({url: RPC});
const payerKey = KeyPair.fromString(JSON.parse(await readFile(`${walletDir}/payer-full.json`, 'utf8')).private_key);
const companyWallet = Buffer.from(payerKey.getPublicKey().data).toString('hex');               // implicit account = company wallet
const customerCred = JSON.parse(await readFile(`${walletDir}/credential.json`, 'utf8')), customerId = JSON.parse(await readFile(`${walletDir}/public.json`, 'utf8')).accountId;
const state = await readFile(stateFile, 'utf8').then(JSON.parse, () => ({commits: []}));
const save = async () => { await mkdir('.runtime/nanogpt-loop', {recursive: true}); await writeFile(stateFile, JSON.stringify(state, null, 2) + '\n', {mode: 0o600}); };
const nearBalance = async id => BigInt((await provider.query({request_type: 'view_account', finality: 'final', account_id: id})).amount);
const send = async (signerId, secret, to, yocto) => { const acc = new Account(signerId, provider, KeyPairSigner.fromSecretKey(secret)); const r = await acc.signAndSendTransaction({receiverId: to, actions: [actions.transfer(yocto)], waitUntil: 'FINAL'}); if (!('SuccessValue' in (r.status ?? {}))) throw new Error('TX_FAILED'); return {txHash: r.transaction.hash}; };
async function ledger() {                                                             // records exact event data so the verifier can recompute hashes
  const {createAgentApi} = await import('@near-intents-agent-api/sdk'), {createLedgerCommitter} = await import('../src/onchain/ledger-commit.mjs');
  const c = createLedgerCommitter({api: createAgentApi({apiKey: process.env.NEAR_INTENTS_AGENT_API_KEY, baseUrl: process.env.NEAR_INTENTS_AGENT_API_URL}), agentId: process.env.NEAR_AGENT_ID, grantToken: process.env.NEAR_AGENT_GRANT_TOKEN, contractId: process.env.SHOP_LEDGER_CONTRACT_ID, companyId: 'local-workspace'});
  return {append: async events => { const r = await c.append(events); state.commits.push({events, txHash: r.txHash}); await save(); return r; }};
}
const needKey = () => process.env.NANOGPT_API_KEY ?? (() => { throw new Error('NANOGPT_API_KEY missing in .env (create it at https://nano-gpt.com/api)'); })();

if (step === 'preflight') {
  const lim = await createNanoGpt({apiKey: process.env.NANOGPT_API_KEY ?? 'unset'}).limits(), min = Math.ceil(lim.minimum * 1e6) / 1e6;
  console.log(`${process.env.NANOGPT_API_KEY ? 'OK     ' : 'MISSING'} NANOGPT_API_KEY (create at https://nano-gpt.com/api)`);
  console.log(`customer wallet ${customerId.slice(0, 12)}…  ${yoctoToNear(await nearBalance(customerId))} NEAR\ncompany wallet  ${companyWallet.slice(0, 12)}…  ${yoctoToNear(await nearBalance(companyWallet))} NEAR`);
  console.log(`NanoGPT minimum NEAR deposit ${min} (~$${lim.fiatEquivalentMinimum}); plan: customer pays 0.40 NEAR, agent buys ${min} NEAR of credit, tx gas is tiny`);
  console.log(`already done: sale=${Boolean(state.sale)} purchase=${Boolean(state.purchase)} answer=${Boolean(state.answer)}`);
} else if (step === 'customer-pay') {
  if (state.sale) throw new Error('sale already recorded');
  const yocto = nearToYocto(rest[0] ?? '0.40'), paid = await send(customerId, customerCred.private_key, companyWallet, yocto);
  const saleId = 'sale:' + createHash('sha256').update(paid.txHash).digest('hex').slice(0, 24);
  state.sale = {id: saleId, customer: customerId, companyWallet, amountYocto: yocto.toString(), paymentTxHash: paid.txHash, at: new Date().toISOString(), asset: 'near:native'}; await save();
  const l = await (await ledger()).append([{type: 'sale.confirmed', data: {companyId: 'local-workspace', actorId: 'customer', saleId, asset: 'near:native', amountYocto: state.sale.amountYocto, paymentTxHash: paid.txHash, receivedBy: companyWallet}}]);
  state.sale.ledgerTx = l.txHash; await save(); console.log('customer paid', yoctoToNear(yocto), 'NEAR ->', paid.txHash, '| ledger', l.txHash);
} else if (step === 'record-sale') {
  if (state.sale) throw new Error('sale already recorded');
  const [txHash, sender] = rest; if (!txHash || !sender) throw new Error('usage: record-sale <txHash> <senderAccountId>');
  const tx = await provider.viewTransactionStatus({txHash, accountId: sender, waitUntil: 'FINAL'}), t = tx.transaction, dep = t.actions?.find(a => a.Transfer)?.Transfer?.deposit;
  const ok = tx.final_execution_status === 'FINAL' && 'SuccessValue' in (tx.status ?? {}) && t.signer_id === sender && t.receiver_id === companyWallet && BigInt(dep ?? 0) > 0n;
  if (!ok) throw new Error(`payment not verified: needs a FINAL, successful native transfer from ${sender} to ${companyWallet}`);
  const saleId = 'sale:' + createHash('sha256').update(txHash).digest('hex').slice(0, 24);
  state.sale = {id: saleId, customer: sender, companyWallet, amountYocto: String(dep), paymentTxHash: txHash, at: new Date().toISOString(), asset: 'near:native', customerIsOwnerWallet: sender === customerId}; await save();
  const l = await (await ledger()).append([{type: 'sale.confirmed', data: {companyId: 'local-workspace', actorId: 'customer', saleId, asset: 'near:native', amountYocto: state.sale.amountYocto, paymentTxHash: txHash, receivedBy: companyWallet}}]);
  state.sale.ledgerTx = l.txHash; await save(); console.log('verified payment', yoctoToNear(BigInt(dep)), 'NEAR from', sender, '| ledger', l.txHash);
} else if (step === 'buy-credits') {
  if (!state.sale) throw new Error('run customer-pay first'); if (state.purchase) throw new Error('credit already purchased for this sale');
  const nano = createNanoGpt({apiKey: needKey()});
  try {
    state.purchase = await createNanoGptPurchase({nano, committer: await ledger(), saleId: state.sale.id, sendNear: ({to, yocto}) => send(companyWallet, payerKey.toString(), to, yocto)}).purchase({maxYocto: state.sale.amountYocto, saleId: state.sale.id});
    await save(); console.log(JSON.stringify(state.purchase, null, 1));
  } catch (e) { state.purchaseFailure = {code: e.code, payment: e.payment ?? null, status: e.status ?? null}; await save(); console.error('purchase stopped:', e.code, JSON.stringify(e.payment ?? e.minimumYocto ?? '')); process.exitCode = 2; }
} else if (step === 'answer') {
  if (!state.purchase) throw new Error('buy-credits first'); if (state.answer) throw new Error('answer already recorded');
  const nano = createNanoGpt({apiKey: needKey()}), question = rest.join(' ') || 'What is the collision deductible on the auto policy?', before = await nano.balance();
  const context = documents.map(d => `## ${d.title}\n${d.body}`).join('\n\n').slice(0, 11000);
  const res = await nano.chat({model: MODEL, maxTokens: 300, messages: [{role: 'system', content: 'You are Harbor Mutual (fictional insurer) support. Answer in at most two sentences using ONLY the documents.'}, {role: 'user', content: `Documents:\n${context}\n\nQuestion: ${question}`}]});
  await new Promise(r => setTimeout(r, 4000)); const after = await nano.balance(), cost = Number(before.usd) - Number(after.usd);
  const answer = res.choices?.[0]?.message?.content ?? ''; console.log('answer:', answer.trim(), '\ncost (balance delta) USD:', cost.toFixed(8));
  if (!(cost > 0)) throw new Error('COST_NOT_OBSERVED (balance did not fall); not recording');
  state.answer = {model: MODEL, question, answer, balanceBeforeUsd: before.usd, balanceAfterUsd: after.usd, costUsd: cost.toFixed(8), usage: res.usage ?? null, at: new Date().toISOString()}; await save();
  const l = await (await ledger()).append([{type: 'inference.consumed', data: {companyId: 'local-workspace', actorId: 'agent', provider: 'nanogpt', model: MODEL, saleId: state.sale.id, invoiceTxId: state.purchase.invoiceTxId, costUsd: state.answer.costUsd, balanceBeforeUsd: before.usd, balanceAfterUsd: after.usd, funding: 'credit bought by the agent from customer revenue (native NEAR)'}}]);
  state.answer.ledgerTx = l.txHash; await save(); console.log('ledger', l.txHash);
} else if (step === 'report') {
  if (!state.answer) throw new Error('loop not complete'); await mkdir('artifacts/mainnet-proof', {recursive: true});
  await writeFile('artifacts/mainnet-proof/nanogpt-loop.json', JSON.stringify({kind: 'nanogpt-loop', at: new Date().toISOString(), companyWallet, sale: state.sale, purchase: state.purchase, answer: state.answer, ledgerCommits: state.commits,
    labels: [state.sale.customerIsOwnerWallet === false ? 'customer is a separate wallet supplied by the maintainer (real on-chain payment)' : 'customer is the owner wallet (real on-chain payment)', 'NanoGPT is not TEE-attested', 'cost is measured as the NanoGPT USD balance delta around the call']}, null, 2) + '\n'); console.log('wrote artifacts/mainnet-proof/nanogpt-loop.json');
} else { console.error('usage: preflight | customer-pay [near] | buy-credits | answer "<q>" | report'); process.exit(1); }
