// Read-only: confirms from public NEAR RPC that the agent wallet's policy is stored on OutLayer (outlayer.near).
//   node scripts/verify-outlayer-custody.mjs
// For each listed transaction: FINAL and successful; the delegate action's sender is the company wallet, its receiver is
// outlayer.near and its only call is store_wallet_policy with the recorded on-chain version and this agent wallet's public key;
// and the receipt executed on outlayer.near succeeded. It does not decrypt the stored policy.
import {readFile} from 'node:fs/promises';
const RPC = process.env.NEAR_RPC_URL ?? 'https://free.rpc.fastnear.com';
const a = JSON.parse(await readFile(new URL('../artifacts/mainnet-proof/outlayer-custody.json', import.meta.url), 'utf8'));
const rpc = async (method, params) => (await (await fetch(RPC, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})})).json()).result;
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; };
for (const t of a.txs) {
  const r = await rpc('EXPERIMENTAL_tx_status', {tx_hash: t.hash, sender_account_id: t.relayer, wait_until: 'FINAL'}), label = `policy rev ${t.policyRevision} (${t.hash.slice(0, 8)}…)`;
  const d = r?.receipts?.[0]?.receipt?.Action?.actions?.[0]?.Delegate?.delegate_action, call = d?.actions?.length === 1 ? d.actions[0].FunctionCall : null;
  const args = call ? JSON.parse(Buffer.from(call.args, 'base64').toString()) : {};
  check(`${label}: FINAL and successful`, r?.final_execution_status === 'FINAL' && 'SuccessValue' in (r.status ?? {}));
  check(`${label}: company wallet's delegate action calls store_wallet_policy on outlayer.near`, d?.sender_id === a.companyWallet && d?.receiver_id === 'outlayer.near' && call?.method_name === 'store_wallet_policy');
  check(`${label}: stores on-chain version ${t.onchainVersion} for this agent wallet`, args.version === t.onchainVersion && args.wallet_pubkey === `ed25519:${a.walletNearAccount}`);
  check(`${label}: the receipt executed on outlayer.near succeeded`, (r?.receipts_outcome ?? []).some(o => o.outcome.executor_id === 'outlayer.near' && 'SuccessValue' in o.outcome.status));
}
console.log(failed ? `${failed} check(s) failed` : `${a.txs.length * 4}/${a.txs.length * 4} checks passed`);
process.exit(failed ? 1 : 0);
