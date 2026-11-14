// Chain Signatures proof: the agent's NEAR-MPC-managed EVM key signs ONE NEAR Intents transfer intent.
//   node scripts/chain-signatures-proof.mjs allow    # OWNER-signed policy_update: add native.evm.sign_intent (receivers: the company wallet only)
//   node scripts/chain-signatures-proof.mjs sign     # agent signs a 1-yocto wNEAR transfer intent; NEVER published; saves the artifact
//   node scripts/chain-signatures-proof.mjs verify   # re-checks the saved signature: recovered EVM address == the agent's EVM account
// The signed intent is not submitted anywhere, so no funds move. It stays publishable until its short deadline only.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {loadEnvFile} from 'node:process';
import {KeyPairSigner, JsonRpcProvider, actions, buildDelegateAction, encodeSignedDelegate} from 'near-api-js';
import {verifyMessage} from 'ethers';
import bs58 from 'bs58';
import {createAgentApi, createIdempotencyKey} from '@near-intents-agent-api/sdk';
import {createChainSignatures} from '../src/integrations/chain-signatures.mjs';

try { loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const [, , step = 'verify'] = process.argv, env = process.env, agentId = env.NEAR_AGENT_ID;
const companyWallet = 'e17d480f28ef0c3f39c7b3a12bdf80acfa2e2282a5e7a2eae3f019510ce6e8d4', ARTIFACT = 'artifacts/mainnet-proof/chain-signatures.json';
const api = createAgentApi({apiKey: env.NEAR_INTENTS_AGENT_API_KEY, baseUrl: env.NEAR_INTENTS_AGENT_API_URL});
const done = new Set(['SUCCESS', 'FAILED', 'REFUNDED', 'NEEDS_REVIEW']);
async function settled(id, ms = 5 * 60_000) {
  const end = Date.now() + ms; let s;
  while (Date.now() < end) { s = await api.getStatus(id, {waitMs: 5000}); if (done.has(s.status)) return s; await new Promise(r => setTimeout(r, 3000)); }
  return s;
}
// The API returns NEAR-format signatures (`secp256k1:<base58 r||s||v>`); ethers wants 0x hex.
const hexSig = sig => sig.startsWith('secp256k1:') ? '0x' + Buffer.from(bs58.decode(sig.slice('secp256k1:'.length))).toString('hex') : sig;
const agentEvm = async () => (await api.getAgent(agentId)).wallet.evm_account_id.toLowerCase();

if (step === 'allow') {
  const current = await api.getPolicy(agentId), evm = current.policy.native.evm;
  if (evm.sign_intent) { console.log('already configured:', JSON.stringify(evm.sign_intent)); process.exit(0); }
  const policy = {...current.policy, native: {...current.policy.native, evm: {...evm, sign_intent: {receivers: [companyWallet], one_click_deposits: false}}}};
  const gen = await api.generateIntent({type: 'policy_update', agent_id: agentId, policy, expected_revision: current.revision}, {idempotencyKey: createIdempotencyKey()});
  const cred = JSON.parse(await readFile(path.resolve('.runtime/company-ledger-wallet/mainnet/payer-full.json'), 'utf8')), key = KeyPairSigner.fromSecretKey(cred.private_key), p = gen.intent.payload;
  let signed_data;
  if (gen.intent.standard === 'nep366') {                       // on-chain policy store (outlayer.near), relayed by the Agent API; the owner key signs a delegate action
    if (p.actions.some(a => a.type !== 'FunctionCall' || a.params.methodName !== 'store_wallet_policy')) throw new Error('unexpected delegate action; refusing to sign');
    const provider = new JsonRpcProvider({url: 'https://free.rpc.fastnear.com'}), ak = await provider.viewAccessKey({accountId: companyWallet, publicKey: cred.public_key}), block = await provider.viewBlock({finality: 'final'});
    const delegate = buildDelegateAction({actions: p.actions.map(a => actions.functionCall(a.params.methodName, a.params.args, BigInt(a.params.gas), BigInt(a.params.deposit))), maxBlockHeight: BigInt(block.header.height + 1000), nonce: BigInt(ak.nonce) + 1n, publicKey: await key.getPublicKey(), receiverId: p.receiverId, senderId: companyWallet});
    const signed = await key.signDelegateAction(delegate);
    signed_data = {standard: 'nep366', payload: p, signed_delegate: Buffer.from(encodeSignedDelegate(signed.signedDelegate)).toString('base64')};
  } else if (gen.intent.standard === 'nep413') {
    const sig = await key.signNep413Message(companyWallet, {message: p.message, recipient: p.recipient, nonce: Buffer.from(p.nonce, 'base64')});
    signed_data = {standard: 'nep413', payload: p, public_key: sig.publicKey.toString(), signature: Buffer.from(sig.signature).toString('base64')};
  } else throw new Error(`unexpected signing standard ${gen.intent.standard}`);
  await api.submitIntent({type: 'policy_update', correlation_id: gen.correlation_id, signed_data});
  const s = await settled(gen.correlation_id); console.log('policy_update', s.status, s.failure_code ?? '', JSON.stringify(s.details ?? {}));
  if (s.status !== 'SUCCESS') process.exit(2);
} else if (step === 'sign') {
  const evmAccount = await agentEvm(), deadline = new Date(Date.now() + 240_000).toISOString();
  const payload = JSON.stringify({signer_id: evmAccount, verifying_contract: 'intents.near', deadline, nonce: randomBytes(32).toString('base64'),
    intents: [{intent: 'transfer', receiver_id: companyWallet, tokens: {'nep141:wrap.near': '1'}}]});
  const cs = createChainSignatures({apiKey: env.NEAR_INTENTS_AGENT_API_KEY, baseUrl: env.NEAR_INTENTS_AGENT_API_URL, agentId, grantToken: env.NEAR_AGENT_GRANT_TOKEN});
  const r = await cs.signIntent({payload, chain: 'evm'});
  const recovered = verifyMessage(r.signedData.payload, hexSig(r.signedData.signature)).toLowerCase();
  const policy = await api.getPolicy(agentId);
  const artifact = {kind: 'chain-signatures', at: new Date().toISOString(), route: 'agent-api native/evm/sign-intent (NEAR MPC-managed key)', correlationId: r.correlationId, accountId: r.accountId, agentEvmAccount: evmAccount,
    policyRevision: policy.revision, signIntentRules: policy.policy.native.evm.sign_intent, signedData: r.signedData, recoveredAddress: recovered, signerMatches: recovered === evmAccount,
    published: false, deadline, label: 'One signed 1-yocto wNEAR transfer intent to the company wallet. Never submitted to intents.near, 1Click or a solver; it expires at its deadline. Signing is not a fund movement.'};
  await mkdir('artifacts/mainnet-proof', {recursive: true}); await writeFile(ARTIFACT, JSON.stringify(artifact, null, 2) + '\n');
  console.log(JSON.stringify({correlationId: r.correlationId, accountId: r.accountId, recovered, signerMatches: artifact.signerMatches, signature: r.signedData.signature.slice(0, 20) + '…'}));
  if (!artifact.signerMatches) process.exit(2);
} else if (step === 'verify') {
  const a = JSON.parse(await readFile(ARTIFACT, 'utf8')), evm = await agentEvm();
  const recovered = verifyMessage(a.signedData.payload, hexSig(a.signedData.signature)).toLowerCase(), intent = JSON.parse(a.signedData.payload);
  const checks = [
    ['signature recovers to the agent EVM account', recovered === evm && recovered === a.agentEvmAccount],
    ['payload is a single transfer to the company wallet', intent.intents.length === 1 && intent.intents[0].intent === 'transfer' && intent.intents[0].receiver_id === companyWallet],
    ['payload signer is the agent EVM account', intent.signer_id === evm],
    ['recorded as never published', a.published === false],
  ];
  for (const [n, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`);
  if (checks.some(([, ok]) => !ok)) process.exit(2);
} else { console.error('usage: allow | sign | verify'); process.exit(1); }
