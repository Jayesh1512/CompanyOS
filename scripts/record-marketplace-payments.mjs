// Puts the two completed market.near.ai x402 purchases on the company ledger, after re-verifying each payment on chain.
//   node scripts/record-marketplace-payments.mjs verify   # read-only: public RPC
//   node scripts/record-marketplace-payments.mjs commit   # verify, then append two procurement.confirmed events (gas only); writes artifacts/marketplace/ledger-record.json
// The payer is the wallet that signed each payment (owner wallet, company wallet), not the Agent API agent.
import {readFile, writeFile} from 'node:fs/promises';
import {loadEnvFile} from 'node:process';
try { loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const [, , step = 'verify'] = process.argv, RPC = process.env.NEAR_RPC_URL ?? 'https://free.rpc.fastnear.com', OUT = 'artifacts/marketplace/ledger-record.json';
const USDC = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', PAY_TO = 'ea667f5f496e60033bf8075cce4793efdeba28d74d116ef95848324347f539fc', RELAYER = 'x402-relayer.fadeevab.near';
const payments = [
  {taskId: 'c41a599b-87a3-42cd-a70b-d35ad0d9babd', txHash: '7jhLczFqN8kr4PSKg1gTEdYEPj1fBwxyHkSMJyVTpZqr', payer: '755a0a4bb40161793c0a178c89b0ed1a876d8c0d0bbea8febecfe2a7d0d9662b', artifact: 'artifacts/marketplace/payment-1794664327542.json'},
  {taskId: '0de69385-54a4-4e1f-bd34-c4155f532242', txHash: 'BBKtuiWMrkKwNPFc5pk3Si6juam4fsS2NsbBdomd59Uz', payer: 'e17d480f28ef0c3f39c7b3a12bdf80acfa2e2282a5e7a2eae3f019510ce6e8d4', artifact: 'artifacts/marketplace/payment-1794665113958.json'},
];
const rpc = async params => (await (await fetch(RPC, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'EXPERIMENTAL_tx_status', params})})).json()).result;
let failed = 0; const check = (n, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) failed++; };
for (const p of payments) {
  const r = await rpc({tx_hash: p.txHash, sender_account_id: RELAYER, wait_until: 'FINAL'}), d = r?.receipts?.[0]?.receipt?.Action?.actions?.[0]?.Delegate?.delegate_action, f = d?.actions?.[0]?.FunctionCall;
  const args = f ? JSON.parse(Buffer.from(f.args, 'base64').toString()) : {}, task = JSON.parse(await readFile(p.artifact, 'utf8')), tag = `${p.txHash.slice(0, 8)}…`;
  check(`${tag}: FINAL and successful`, r?.final_execution_status === 'FINAL' && 'SuccessValue' in (r.status ?? {}));
  check(`${tag}: payer ${p.payer.slice(0, 8)}… signed an ft_transfer of 0.5 USDC to the marketplace recipient`, d?.sender_id === p.payer && d?.receiver_id === USDC && f?.method_name === 'ft_transfer' && args.receiver_id === PAY_TO && args.amount === '500000');
  check(`${tag}: saved task ${p.taskId.slice(0, 8)}… is completed and paid by the same payer`, task.taskId === p.taskId && task.taskState === 'TASK_STATE_COMPLETED' && task.payer === p.payer);
}
if (failed) { console.error(`${failed} check(s) failed; not committing`); process.exit(1); }
if (step === 'commit') {
  if (await readFile(OUT, 'utf8').then(() => true, () => false)) throw new Error(`${OUT} exists: already recorded`);
  const {createAgentApi} = await import('@near-intents-agent-api/sdk'), {createLedgerCommitter} = await import('../src/onchain/ledger-commit.mjs');
  const committer = createLedgerCommitter({api: createAgentApi({apiKey: process.env.NEAR_INTENTS_AGENT_API_KEY, baseUrl: process.env.NEAR_INTENTS_AGENT_API_URL}), agentId: process.env.NEAR_AGENT_ID, grantToken: process.env.NEAR_AGENT_GRANT_TOKEN, contractId: process.env.SHOP_LEDGER_CONTRACT_ID, companyId: 'local-workspace'});
  const events = payments.map(p => ({type: 'procurement.confirmed', data: {companyId: 'local-workspace', actorId: 'company', kind: 'marketplace_task', provider: 'market.near.ai', taskId: p.taskId, asset: `nep141:${USDC}`, amountAtomic: '500000', payTo: PAY_TO, payer: p.payer, paymentTxHash: p.txHash, relayer: RELAYER}}));
  const r = await committer.append(events);
  await writeFile(OUT, JSON.stringify({kind: 'marketplace-ledger-record', at: new Date().toISOString(), events, ledgerTx: r.txHash, correlationId: r.correlationId, label: 'Two wallet-signed x402 payments (owner wallet, company wallet), re-verified on chain before recording. Not paid by the Agent API agent.'}, null, 2) + '\n');
  console.log('committed 2 procurement.confirmed events | ledger', r.txHash);
}
