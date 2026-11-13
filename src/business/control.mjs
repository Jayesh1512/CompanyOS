import {readFile,stat} from 'node:fs/promises';
import {Account,KeyPairSigner,JsonRpcProvider,actions} from 'near-api-js';
import {fingerprint} from '../contracts.mjs';
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,httpStatus:status});};

// This owner action only removes authority: fixed method, zero principal,
// configured contract and private owner key. It cannot issue or widen grants.
export async function createAuditBusinessControl({journal,contractId,credentialFile,expectedCodeHash,networkId='testnet',rpcUrl='https://rpc.testnet.fastnear.com'}){
 if(!contractId&&!credentialFile)return {view:async()=>({configured:false}),revoke:async()=>fail('AUDIT_BUSINESS_NOT_CONFIGURED')};
 const url=new URL(rpcUrl),sandbox=networkId==='sandbox'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(!contractId||!credentialFile||!expectedCodeHash||(!sandbox&&(networkId!=='testnet'||url.origin!=='https://rpc.testnet.fastnear.com'||!contractId.endsWith('.testnet'))))fail('AUDIT_BUSINESS_BINDING_REQUIRED');
 const file=await stat(credentialFile);
 if(!file.isFile()||file.size>4096||(file.mode&0o077)!==0)fail('PRIVATE_OWNER_CREDENTIAL_REQUIRED');
 const credential=JSON.parse(await readFile(credentialFile,'utf8'));
 if(credential.account_id!==contractId)fail('CONTRACT_OWNER_KEY_REQUIRED');
 const rpc=new JsonRpcProvider({url:rpcUrl}),owner=new Account(contractId,rpc,KeyPairSigner.fromSecretKey(credential.private_key));
 const viewCall=async(method,args={})=>{
  const result=await rpc.query({request_type:'call_function',finality:'final',account_id:contractId,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')});
  return JSON.parse(Buffer.from(result.result).toString('utf8'));
 };
 const bound=async()=>{const state=await rpc.query({request_type:'view_account',finality:'final',account_id:contractId});if(state.code_hash!==expectedCodeHash)fail('AUDIT_CONTRACT_UPGRADE_REQUIRED');};
 async function view(){
  await bound();const grant=await viewCall('get_grant');
  return {configured:true,networkId,contractId,grant,revoked:grant?await viewCall('is_grant_revoked',{grant_id:grant.id}):false};
 }
 let queue=Promise.resolve();
 async function perform(grantId){
  if(typeof grantId!=='string'||!/^[a-f0-9]{64}$/.test(grantId))fail('INVALID_GRANT_ID',400);
  const id=`audit-revoke:${contractId}:${grantId}`,prior=journal.get('auditRevocations',id);
  const current=await view();if(current.grant?.id!==grantId)fail('GRANT_MISMATCH');
  if(current.revoked)return {...current,status:'revoked',txHash:prior?.txHash??null,replayed:true};
  if(prior)fail('ORIGINAL_REVOCATION_REQUIRES_RECONCILIATION');
  const pending={id,contractId,grantId,status:'pending',methodName:'revoke_grant',at:new Date().toISOString()};
  await journal.transaction({actionId:id,fingerprint:fingerprint(pending)},tx=>{tx.put('auditRevocations',id,pending,{expectedVersion:0});tx.append('audit.grant_revocation_requested',{contractId,grantId});});
  // An uncertain original submission stays pending. Never resend automatically.
  const result=await owner.signAndSendTransaction({receiverId:contractId,actions:[actions.functionCall('revoke_grant',{grant_id:grantId},30_000_000_000_000n,0n)],waitUntil:'FINAL',retries:0});
  if(result.final_execution_status!=='FINAL'||!Object.hasOwn(result.status??{},'SuccessValue')||result.receipts_outcome?.some(r=>r.outcome.status.Failure))fail('FINAL_REVOCATION_REQUIRED');
  const observed=await view();if(!observed.revoked)fail('REVOCATION_READBACK_REQUIRED');
  const record={...pending,status:'confirmed',txHash:result.transaction.hash};
  await journal.transaction({actionId:id+':confirmed',fingerprint:fingerprint(record)},tx=>{tx.put('auditRevocations',id,record);tx.append('audit.grant_revoked',{contractId,grantId,txHash:record.txHash});});
  return {...observed,status:'revoked',txHash:record.txHash,replayed:false};
 }
 return {view,revoke:grantId=>{const next=queue.then(()=>perform(grantId));queue=next.catch(()=>{});return next;}};
}
