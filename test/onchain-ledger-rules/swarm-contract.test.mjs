import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'near-workspaces';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ledgerBatch} from '../../src/onchain/direct-ledger.mjs';
import {ledgerCompanyHash} from '../../src/rules/onchain-ledger.mjs';
import {hash} from '../../src/rules/config.mjs';

test('compiled swarm ledger binds each writer to its actor and rejects impersonation and revocation',async()=>{
 const wasm=await readFile('artifacts/swarm-ledger/company-ledger.wasm');
 const manifest=JSON.parse(await readFile('artifacts/swarm-ledger/contract-manifest.json','utf8'));
 assert.equal(createHash('sha256').update(wasm).digest('hex'),manifest.wasmHash);
 const worker=await Worker.init({network:'sandbox'});
 try{
  const root=worker.rootAccount,contract=await root.devCreateAccount(),stranger=await root.createSubAccount('stranger');
  await contract.deploy(wasm);const companyId='swarm-contract-test',companyHash=ledgerCompanyHash(companyId);
  await contract.call(contract,'new',{company_hash:companyHash,writer_id:null});
  const agents=[];
  for(const role of ['manager','support','backlog','curator','developer']){
   const agent=await root.createSubAccount(role);agents.push(agent);
   const actorHash=hash({domain:'company-ledger:actor:v1',companyHash,actor:agent.accountId});
   await contract.call(contract,'set_agent_writer',{account_id:agent.accountId,actor_hash:actorHash});
   const head=await contract.view('get_head',{}),args=ledgerBatch(companyId,head,[{type:'work.completed',data:{actorId:agent.accountId,role}}]);
   const after=await agent.call(contract,'append',args);assert.equal(after.sequence,agents.length);
  }
  const head=await contract.view('get_head',{}),manager=agents[0];
  const own=ledgerBatch(companyId,head,[{type:'work.completed',data:{actorId:manager.accountId}}]);
  await assert.rejects(stranger.call(contract,'append',own),/WRITER_REQUIRED/);
  const forged=ledgerBatch(companyId,head,[{type:'work.completed',data:{actorId:agents[1].accountId}}]);
  await assert.rejects(manager.call(contract,'append',forged),/ACTOR_SIGNER_MISMATCH/);
  await assert.rejects(stranger.call(contract,'set_agent_writer',{account_id:stranger.accountId,actor_hash:own.records[0].actorHash}),/OWNER_REQUIRED/);
  await contract.call(contract,'set_agent_writer',{account_id:manager.accountId,actor_hash:null});
  await assert.rejects(manager.call(contract,'append',own),/WRITER_REQUIRED/);
  assert.deepEqual(await contract.view('get_head',{}),head);
 }finally{await worker.tearDown();}
});
