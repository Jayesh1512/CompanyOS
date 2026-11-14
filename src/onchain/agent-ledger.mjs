import {readFile} from 'node:fs/promises';
import {Account,JsonRpcProvider,KeyPairSigner,actions} from 'near-api-js';
import {fingerprint} from '../contracts.mjs';
import {ledgerBatch} from './direct-ledger.mjs';

// Each configured recovery role uses its own testnet account. The contract
// checks its actor commitment against the actual transaction predecessor.
export async function createAgentLedger({manifest,journal,reader}) {
  if(manifest.network!=='testnet'||!manifest.contractId.endsWith('.testnet'))throw Error('TESTNET_REQUIRED');
  const provider=new JsonRpcProvider({url:'https://rpc.testnet.fastnear.com'});
  const keys=new Map();
  for(const [role,identity] of Object.entries(manifest.agents)){
    if(!/^\.runtime\/hackathon-testnet\/[a-z_]+\.json$/.test(identity.keyFile))throw Error('PRIVATE_KEY_PATH_REQUIRED');
    const credential=JSON.parse(await readFile(identity.keyFile,'utf8'));
    if(credential.account_id!==identity.accountId||!identity.accountId.endsWith('.'+manifest.parentId))throw Error('AGENT_ACCOUNT_MISMATCH');
    keys.set(role,new Account(identity.accountId,provider,KeyPairSigner.fromSecretKey(credential.private_key)));
  }
  return {async commitRun(run){
    const role=run.role.startsWith('support_')?'support':run.role,signer=keys.get(role);
    if(!signer||run.state!=='completed'||run.result?.status!=='confirmed'||run.result.proof?.status!=='verified')throw Error('VERIFIED_AGENT_ACTION_REQUIRED');
    const events=[{type:'work.completed',data:{actorId:signer.accountId,localActorId:run.actorId,role,workId:run.id,
      requestFingerprint:run.requestFingerprint,providerRequestId:run.result.providerRequestId??run.result.generation?.providerRequestId??null,
      inferenceId:run.result.inferenceId,outputHash:fingerprint(run.value),documentsHash:fingerprint(run.documents)}}];
    const id='agent-chain:'+run.id,fp=fingerprint(events),old=journal.getOperation(id);
    const finish=async result=>{
      const records=await reader.view(manifest.contractId,'get_records',{from_sequence:result.args.records[0].sequence,limit:1});
      if(records[0]?.hash!==result.args.records[0].hash)throw Error('AGENT_CHAIN_READBACK_MISMATCH');
      await journal.transaction({actionId:id+':record',fingerprint:fp},tx=>tx.put('agentChainCommits',run.id,{id:run.id,...result}));
      return result;
    };
    if(old){if(old.fingerprint!==fp)throw Error('AGENT_ACTION_CONFLICT');if(old.result?.status==='confirmed')return finish(old.result);if(old.result?.status!=='not_submitted')throw Error('ORIGINAL_CHAIN_OPERATION_REQUIRES_RECONCILIATION');}
    const args=old?.payload??ledgerBatch(manifest.companyId,await reader.view(manifest.contractId,'get_head'),events);
    const binding=await reader.view(manifest.contractId,'get_agent_writer',{account_id:signer.accountId});
    if(binding!==args.records[0].actorHash)throw Error('AGENT_SIGNER_NOT_BOUND');
    await journal.registerOperation({actionId:id,fingerprint:fp,provider:'near-testnet-per-agent',mode:'testnet',status:'unknown',payload:args});
    let outcome;
    try{outcome=await signer.signAndSendTransaction({receiverId:manifest.contractId,actions:[actions.functionCall('append',args,50_000_000_000_000n,0n)],waitUntil:'FINAL',retries:0});}
    catch(error){
      // This RPC error rejects the transaction before inclusion. Other errors
      // retain the original unknown operation and cannot trigger another send.
      if(error.name==='NotEnoughBalanceError'){
        await journal.recordOperationResult(id,{status:'not_submitted',code:'RPC_NOT_ENOUGH_BALANCE'});
        throw Object.assign(Error('AGENT_CHAIN_NOT_SUBMITTED'),{code:'AGENT_CHAIN_NOT_SUBMITTED'});
      }
      throw error;
    }
    if(outcome.final_execution_status!=='FINAL'||!Object.hasOwn(outcome.status??{},'SuccessValue')||outcome.receipts_outcome?.some(r=>r.outcome.status.Failure))throw Error('AGENT_CHAIN_FINALITY_REQUIRED');
    const result={status:'confirmed',network:'testnet',txHash:outcome.transaction.hash,signerId:outcome.transaction.signer_id,contractId:manifest.contractId,
      nearblocks:`https://testnet.nearblocks.io/txns/${outcome.transaction.hash}`,events,args};
    await journal.recordOperationResult(id,result);
    return finish(result);
  }};
}
