import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fingerprint,ContractError} from '../contracts.mjs';
import {NEAR_RPC} from '../onchain/rpc.mjs';

export const OUTLAYER_VERIFIER_REVISION='90c27d9d4fc843194ddc6f8ebaafa4eb320c3bb6';
export const OUTLAYER_VERIFIER_ROOT_HASH='44a0196b2b99f889b8e149e95b807a350e7424964399e885a7cbb8ccfab674d3';
const exec=promisify(execFile),fail=code=>{throw new ContractError(code,code);};
const origins={mainnet:'https://api.outlayer.ai',testnet:'https://testnet-api.outlayer.ai'};
const bindingFields=['task_id','task_type','timestamp','tdx_quote','wasm_hash','input_hash','output_hash','repo_url','commit_hash','build_target','block_height','caller_account_id','project_id','secrets_ref','attached_usd','call_id'];
const identity=record=>Object.fromEntries(bindingFields.map(k=>[k,record[k]??null]));
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);

async function runBinary(binary,args){
 try{const {stdout,stderr}=await exec(binary,args,{timeout:120000,maxBuffer:4*1024*1024,encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME,NO_COLOR:'1'}});return {exitCode:0,stdout,stderr};}
 catch(error){return {exitCode:Number.isInteger(error.code)?error.code:null,stdout:error.stdout??'',stderr:error.stderr??''};}
}

/** Only the pinned verifier performs cryptographic quote checks. This bridge
 * requires every layer AND both payload checks, then binds its evidence to the
 * original job, payer, project and exact deployed WASM. It never makes a paid call. */
export async function createOutlayerExecutionVerifier({journal,binary,run=runBinary}={}){
 if(!journal||typeof binary!=='string')fail('OUTLAYER_EXECUTION_VERIFIER_REQUIRED');
 await access(binary,constants.X_OK);
 const binaryHash=createHash('sha256').update(await readFile(binary)).digest('hex');
 return async function verifyExecution({callId,request,output,attestation,attestationEvidenceRef}){
  const a=attestation,network=request?.binding?.networkId;
  if(!origins[network]||!a||!Number.isSafeInteger(a.task_id)||a.task_id<0||a.task_type!=='execute'||a.call_id!==callId||a.wasm_hash!==request.binding.versionHash||a.project_id!==`${request.binding.projectOwner}/${request.binding.projectName}`||a.caller_account_id!==request.binding.paymentKeyOwner||a.attached_usd!=='0'||!hex(a.input_hash)||!hex(a.output_hash))fail('OUTLAYER_ATTESTATION_BINDING_MISMATCH');
  const directory=await mkdtemp(path.join(tmpdir(),'outlayer-proof-'));
  try{
   const inputFile=path.join(directory,'input.json'),outputFile=path.join(directory,'output.json'),bundleFile=path.join(directory,'proof.json');
   await writeFile(inputFile,JSON.stringify(request.body.input),{mode:0o600});
   await writeFile(outputFile,JSON.stringify(output),{mode:0o600});
   // Numeric task lookup works independently of the mainnet call-ID lookup
   // rollout. The captured attestation and returned record must be identical.
   const checked=await run(binary,['job',String(a.task_id),'--network',network,'--api',origins[network],'--rpc',NEAR_RPC[network],'--input',inputFile,'--output',outputFile,'--json','--bundle',bundleFile]);
   let report,bundle,rawBundle;
   try{report=JSON.parse(checked.stdout);rawBundle=await readFile(bundleFile,'utf8');if(Buffer.byteLength(rawBundle)>4*1024*1024)fail('OUTLAYER_VERIFIER_EVIDENCE_TOO_LARGE');bundle=JSON.parse(rawBundle);}catch{fail('OUTLAYER_VERIFICATION_UNAVAILABLE');}
   const reportArtifact=await journal.putArtifact({actionId:`outlayer-verifier:${callId}:report:${fingerprint(report)}`,content:JSON.stringify(report),mediaType:'application/json'});
   const bundleArtifact=await journal.putArtifact({actionId:`outlayer-verifier:${callId}:bundle:${fingerprint(bundle)}`,content:rawBundle,mediaType:'application/json'});
   const expectedRegister=network==='mainnet'?'worker.outlayer.near':'worker.outlayer.testnet';
   const passed=checked.exitCode===0
    &&['authenticity','identity','binding','input','output'].every(k=>report[k]?.verdict==='pass')
    &&report.format==='V1'&&report.tcb_status==='UpToDate'&&!(report.uncovered_fields?.length)
    &&report.task_id===a.task_id&&report.task_type===a.task_type&&report.timestamp===a.timestamp
    &&report.input_hash_computed===a.input_hash&&report.output_hash_computed===a.output_hash
    &&report.collateral?.covers_execution_time===true&&report.collateral?.contract_id===expectedRegister
    &&bundle.bundle_format===1&&bundle.network===network&&bundle.measurements_approved===true
    &&bundle.register_contract===expectedRegister
    &&fingerprint(identity(bundle.attestation??{}))===fingerprint(identity(a))
    &&Object.hasOwn(bundle,'input')&&Object.hasOwn(bundle,'output')
    &&fingerprint(bundle.input)===fingerprint(request.body.input)&&fingerprint(bundle.output)===fingerprint(output);
   const evidenceRef=`private:${bundleArtifact.id}`,value={id:callId,status:passed?'verified':'held',taskId:a.task_id,binaryHash,reportEvidenceRef:`private:${reportArtifact.id}`,evidenceRef,attestationEvidenceRef};
   await journal.transaction({actionId:`outlayer-verifier:${callId}:${fingerprint(value)}`,fingerprint:fingerprint(value)},tx=>tx.put('outlayerExecutionVerifications',callId,value));
   if(!passed)fail('OUTLAYER_EXECUTION_PROOF_REJECTED');
   return {source:'outlayer-execution-verifier',callId,taskId:a.task_id,wasmHash:a.wasm_hash,inputHash:a.input_hash,outputHash:a.output_hash,inputFingerprint:fingerprint(request.body.input),outputFingerprint:fingerprint(output),evidenceRef,reportEvidenceRef:value.reportEvidenceRef,verifierBinaryHash:binaryHash,tcbStatus:report.tcb_status};
  }finally{await rm(directory,{recursive:true,force:true});}
 };
}
