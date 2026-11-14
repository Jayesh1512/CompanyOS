import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createJournal} from '../../src/journal/index.mjs';
import {createOutlayerExecutionVerifier} from '../../src/integrations/outlayer-verifier.mjs';

const callId='550e8400-e29b-41d4-a716-446655440000';
const request={binding:{networkId:'mainnet',projectOwner:'company.near',projectName:'evaluator',versionHash:'a'.repeat(64),paymentKeyOwner:'payer.near'},body:{input:{operation:'evaluate_template',jobId:'unique-job',spec:{requiredFields:['address']}}}};
const attestation={task_id:123,task_type:'execute',timestamp:1794680000,call_id:callId,wasm_hash:'a'.repeat(64),input_hash:'b'.repeat(64),output_hash:'c'.repeat(64),project_id:'company.near/evaluator',caller_account_id:'payer.near',attached_usd:'0',tdx_quote:'TEST-ONLY-QUOTE'};
const output={repaired:true};
async function fixture(t,{alter=()=>{},exitCode=0}={}){
 const directory=await mkdtemp(path.join(tmpdir(),'verifier-port-')),journal=await createJournal({directory:path.join(directory,'journal')}),binary=path.join(directory,'TEST-ONLY-verifier');let runs=0;
 await writeFile(binary,'TEST-ONLY, no cryptographic claim');await chmod(binary,0o700);
 t.after(async()=>{await journal.close();await rm(directory,{recursive:true,force:true});});
 // Only this test replaces the subprocess. A fabricated report is NOT a TEE
 // proof: these tests exercise admission at the process boundary.
 const verify=await createOutlayerExecutionVerifier({journal,binary,run:async(file,args)=>{
  runs++;assert.equal(file,binary);assert.deepEqual(args.slice(0,4),['job','123','--network','mainnet']);assert.ok(!args.includes('--payment-key'));assert.ok(!JSON.stringify(args).includes('TEST-SECRET'));
  const input=JSON.parse(await readFile(args[args.indexOf('--input')+1],'utf8')),out=JSON.parse(await readFile(args[args.indexOf('--output')+1],'utf8'));
  const pass={verdict:'pass'},report={task_id:123,task_type:'execute',timestamp:attestation.timestamp,format:'V1',authenticity:pass,identity:pass,binding:pass,input:pass,output:pass,tcb_status:'UpToDate',input_hash_computed:attestation.input_hash,output_hash_computed:attestation.output_hash,collateral:{covers_execution_time:true,contract_id:'worker.outlayer.near'}};
  const bundle={bundle_format:1,network:'mainnet',measurements_approved:true,register_contract:'worker.outlayer.near',attestation:structuredClone(attestation),input,output:out};alter(report,bundle);
  await writeFile(args[args.indexOf('--bundle')+1],JSON.stringify(bundle));return {exitCode,stdout:JSON.stringify(report)};
 }});
 return {verify,journal,get runs(){return runs;}};
}
test('verified report binds the exact job, payer, project, code and both payloads, and persists its recheckable bundle',async t=>{
 const f=await fixture(t),proof=await f.verify({callId,request,output,attestation,attestationEvidenceRef:'private:captured'});assert.equal(proof.callId,callId);assert.equal(proof.wasmHash,request.binding.versionHash);assert.ok(proof.evidenceRef.startsWith('private:'));assert.ok(proof.reportEvidenceRef.startsWith('private:'));assert.equal(f.journal.get('outlayerExecutionVerifications',callId).status,'verified');assert.equal(f.runs,1);
});
for(const [name,alter]of Object.entries({
 'missing payload verification':report=>delete report.input,
 'failed input binding':report=>report.input={verdict:'fail'},
 'unproven quote':report=>report.authenticity={verdict:'unproven'},
 'wrong task':report=>report.task_id=456,
 'legacy uncovered identity':report=>report.format='Legacy',
 'stale TCB':report=>report.tcb_status='OutOfDate',
 'wrong payload hash':report=>report.output_hash_computed='d'.repeat(64),
 'wrong register contract':report=>report.collateral.contract_id='malicious.near',
 'wrong evidence network':(_,bundle)=>bundle.network='testnet',
 'swapped quote':(_,bundle)=>bundle.attestation.tdx_quote='ANOTHER-QUOTE',
 'swapped input':(_,bundle)=>bundle.input={operation:'other'},
 'swapped output':(_,bundle)=>bundle.output={repaired:false},
}))test('rejects '+name+' despite an otherwise passing verifier process',async t=>{
 const f=await fixture(t,{alter});await assert.rejects(f.verify({callId,request,output,attestation}),{code:'OUTLAYER_EXECUTION_PROOF_REJECTED'});assert.equal(f.journal.get('outlayerExecutionVerifications',callId).status,'held');
});
test('a nonzero verifier exit cannot be promoted by a passing-looking report',async t=>{
 const f=await fixture(t,{exitCode:2});await assert.rejects(f.verify({callId,request,output,attestation}),{code:'OUTLAYER_EXECUTION_PROOF_REJECTED'});
});
for(const change of [{call_id:'another-call'},{wasm_hash:'d'.repeat(64)},{caller_account_id:'other.near'},{project_id:'other.near/evaluator'},{attached_usd:'1000'}])test('rejects captured attestation binding '+JSON.stringify(change)+' before invoking the verifier',async t=>{
 const f=await fixture(t);await assert.rejects(f.verify({callId,request,output,attestation:{...attestation,...change}}),{code:'OUTLAYER_ATTESTATION_BINDING_MISMATCH'});assert.equal(f.runs,0);
});
