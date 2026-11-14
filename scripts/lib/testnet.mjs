import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {Account, KeyPair, KeyPairSigner, JsonRpcProvider, actions} from 'near-api-js';

// Dedicated testnet credentials only. This helper never reads .env/mainnet keys.
export const DIRECTORY = '.runtime/hackathon-testnet';
export const RPC = 'https://rpc.testnet.fastnear.com';
export const provider = new JsonRpcProvider({url: RPC});
export const near = value => BigInt(value) * 10n ** 24n;
export const explorer = hash => `https://testnet.nearblocks.io/txns/${hash}`;
export const credential = async name => JSON.parse(await readFile(`${DIRECTORY}/${name}.json`, 'utf8'));
export const account = cred => new Account(cred.account_id, provider, KeyPairSigner.fromSecretKey(cred.private_key));
export function finalReceipt(result) {
  if (result.final_execution_status !== 'FINAL' || !Object.hasOwn(result.status ?? {}, 'SuccessValue') ||
      result.receipts_outcome?.some(r => Object.hasOwn(r.outcome.status, 'Failure'))) throw Error('FINAL_SUCCESS_REQUIRED');
  return {txHash: result.transaction.hash, signerId: result.transaction.signer_id,
    receiverId: result.transaction.receiver_id, nearblocks: explorer(result.transaction.hash)};
}
export async function createRun(name) {
  await mkdir(DIRECTORY, {recursive:true, mode:0o700});
  const file = `${DIRECTORY}/${name}.state.json`;
  let state; try { state=JSON.parse(await readFile(file,'utf8')); } catch(e) { if(e.code!=='ENOENT')throw e; state={network:'testnet',steps:{}}; }
  const save=async()=>{await writeFile(file+'.tmp',JSON.stringify(state,null,2)+'\n',{mode:0o600});await rename(file+'.tmp',file);};
  // A pending original operation must be inspected, never blindly resubmitted.
  async function once(id, work) {
    if(state.steps[id]?.status==='done')return state.steps[id].result;
    if(state.steps[id])throw Error(`ORIGINAL_OPERATION_REQUIRES_RECONCILIATION:${id}`);
    state.steps[id]={status:'pending',at:new Date().toISOString()};await save();
    const result=await work();state.steps[id]={...state.steps[id],status:'done',result};await save();return result;
  }
  return {state,once};
}
export async function createChild(run, parent, label, balanceYocto) {
  const id=`${label}.${parent.account_id}`, file=`${DIRECTORY}/${label}.json`;
  let cred;try{cred=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;const key=KeyPair.fromRandom('ed25519');cred={account_id:id,public_key:key.getPublicKey().toString(),private_key:key.toString()};await writeFile(file,JSON.stringify(cred)+'\n',{mode:0o600,flag:'wx'});}
  if(cred.account_id!==id)throw Error('CHILD_ACCOUNT_BINDING_MISMATCH');
  const receipt=await run.once(`create:${label}`,async()=>finalReceipt(await account(parent).signAndSendTransaction({receiverId:id,
    actions:[actions.createAccount(),actions.transfer(balanceYocto),actions.addFullAccessKey(KeyPair.fromString(cred.private_key).getPublicKey())],waitUntil:'FINAL'})));
  return {cred,receipt};
}
export async function call(cred, receiverId, methodName, args, deposit=0n) {
  return finalReceipt(await account(cred).signAndSendTransaction({receiverId,actions:[actions.functionCall(methodName,args,50_000_000_000_000n,deposit)],waitUntil:'FINAL',retries:0}));
}
export async function view(contractId,methodName,args={}) {
  const r=await provider.query({request_type:'call_function',finality:'final',account_id:contractId,method_name:methodName,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')});
  return JSON.parse(Buffer.from(r.result).toString('utf8'));
}
