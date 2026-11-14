import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {actions} from 'near-api-js';
import {createRun,credential,createChild,account,call,view,finalReceipt,near,RPC} from './lib/testnet.mjs';
import {ledgerCompanyHash} from '../src/rules/onchain-ledger.mjs';
import {ledgerBatch} from '../src/onchain/direct-ledger.mjs';

const run=await createRun('recovery-anchor'),parent=await credential('parent');
const {cred,receipt:creation}=await createChild(run,parent,'recovery',near(2));
const wasm=await readFile('artifacts/onchain-ledger/company-ledger.wasm');
const deployment=await run.once('deploy',async()=>finalReceipt(await account(cred).signAndSendTransaction({receiverId:cred.account_id,
  actions:[actions.deployContract(wasm),actions.functionCall('new',{company_hash:ledgerCompanyHash('recovery-evidence'),writer_id:parent.account_id},100_000_000_000_000n,0n)],waitUntil:'FINAL'})));
const source='artifacts/recovery-missing-address/live-run.json',bytes=await readFile(source),artifactSha256=createHash('sha256').update(bytes).digest('hex');
const events=[{type:'recovery.evidence_anchored',data:{actorId:parent.account_id,source,artifactSha256,
  originalRecordedAt:JSON.parse(bytes).recordedAt,scope:'Retrospective commitment to a historical off-chain run; not on-chain execution of the recovery.'}}];
const append=await run.once('append',async()=>{
  const args=ledgerBatch('recovery-evidence',await view(cred.account_id,'get_head'),events);
  const receipt=await call(parent,cred.account_id,'append',args);
  return {...receipt,args};
});
const records=await view(cred.account_id,'get_records',{from_sequence:1,limit:50});
if(records[0]?.hash!==append.args.records[0].hash)throw Error('ANCHOR_READBACK_MISMATCH');
await writeFile('docs/evidence/recovery-anchor.json',JSON.stringify({network:'testnet',rpc:RPC,source,artifactSha256,events,creation,storageTopup:run.state.steps['storage-topup']?.result??null,failedDeployment:run.state.failedDeployment??null,deployment,append,records},null,2)+'\n');
console.log(JSON.stringify({status:'verified',artifactSha256,txHash:append.txHash,nearblocks:append.nearblocks}));
