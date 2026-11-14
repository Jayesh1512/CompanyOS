// Let the Agent API agent fund the company wallet with native NEAR from its own balance.
//   node scripts/agent-fund-company-wallet.mjs allow          # OWNER-signed policy_update: add ONE withdraw destination (the company wallet)
//   node scripts/agent-fund-company-wallet.mjs fund [near=0.19]   # AGENT withdraws wNEAR as native NEAR to the company wallet (dry quote first)
// Everything else in the policy is copied unchanged. The owner is the company wallet itself (its key signs `allow`);
// the agent then moves funds under its grant and the policy's per-transaction and daily USD limits.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {loadEnvFile} from 'node:process';
import {KeyPairSigner} from 'near-api-js';
import {createAgentApi, createIdempotencyKey} from '@near-intents-agent-api/sdk';

try { loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const [, , step = 'allow', amountNear = '0.19'] = process.argv;
const env = process.env, agentId = env.NEAR_AGENT_ID, WRAP = 'nep141:wrap.near';
const companyWallet = 'e17d480f28ef0c3f39c7b3a12bdf80acfa2e2282a5e7a2eae3f019510ce6e8d4';
const api = createAgentApi({apiKey: env.NEAR_INTENTS_AGENT_API_KEY, baseUrl: env.NEAR_INTENTS_AGENT_API_URL});
const done = new Set(['SUCCESS', 'FAILED', 'REFUNDED', 'NEEDS_REVIEW']);
async function settled(id, ms = 5 * 60_000) {
  const end = Date.now() + ms; let s;
  while (Date.now() < end) { s = await api.getStatus(id, {waitMs: 5000}); if (done.has(s.status)) return s; await new Promise(r => setTimeout(r, 3000)); }
  return s;
}
const destination = {action: 'withdraw', chain: 'near', address: companyWallet, memo: null};

if (step === 'allow') {
  const current = await api.getPolicy(agentId);
  if (current.policy.destinations.list.some(d => d.address === companyWallet)) { console.log('already allowed'); process.exit(0); }
  if (current.policy.destinations.list.length) throw new Error('policy already has destinations; refusing to widen further without review');
  const policy = {...current.policy, destinations: {mode: 'only', list: [destination]}};
  const gen = await api.generateIntent({type: 'policy_update', agent_id: agentId, policy, expected_revision: current.revision}, {idempotencyKey: createIdempotencyKey()});
  console.log('standard:', gen.intent.standard, '| preview:', JSON.stringify(gen.preview).slice(0, 600));
  if (gen.intent.standard !== 'nep413') throw new Error(`unexpected signing standard ${gen.intent.standard}`);
  const cred = JSON.parse(await readFile(path.resolve('.runtime/company-ledger-wallet/mainnet/payer-full.json'), 'utf8'));
  const signer = KeyPairSigner.fromSecretKey(cred.private_key), p = gen.intent.payload;
  const sig = await signer.signNep413Message(companyWallet, {message: p.message, recipient: p.recipient, nonce: Buffer.from(p.nonce, 'base64')});
  await api.submitIntent({type: 'policy_update', correlation_id: gen.correlation_id, signed_data: {standard: 'nep413', payload: p, public_key: sig.publicKey.toString(), signature: Buffer.from(sig.signature).toString('base64')}});
  const s = await settled(gen.correlation_id); console.log('policy_update', s.status, s.failure_code ?? '', JSON.stringify(s.details ?? {}));
  if (s.status !== 'SUCCESS') process.exit(2);
} else if (step === 'fund') {
  const amount = (BigInt(Math.round(Number(amountNear) * 1e6)) * 10n ** 18n).toString(), g = api.forGrant(env.NEAR_AGENT_GRANT_TOKEN);
  const body = {asset: WRAP, amount, chain: 'near', recipient: companyWallet};
  console.log('dry quote:', JSON.stringify(await g.withdraw(agentId, {...body, dry: true})).slice(0, 700));
  const ex = await g.withdraw(agentId, body, {idempotencyKey: createIdempotencyKey()});
  const s = await settled(ex.correlation_id);
  console.log('withdraw', s.status, s.failure_code ?? '', 'correlation', ex.correlation_id, 'tx', s.details?.tx_hash ?? s.details?.transaction_hash ?? '(none)');
  if (s.status !== 'SUCCESS') process.exit(2);
} else { console.error('usage: allow | fund [near]'); process.exit(1); }
