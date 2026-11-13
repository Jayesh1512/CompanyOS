import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {businessFixture} from './fixture.mjs';
import {verifyBusinessRecords} from '../../src/business/evidence.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import {createApp} from '../../src/app.mjs';

test('compiled WASM enforces owner revocation against direct calls, preserves state on upgrade and allows a new active grant',async t=>{
 const {root,company,vendor,agent,grant}=await businessFixture(t,{wasm:'artifacts/audit-business/audit-business.wasm'});
 const args={order_id:'audit-1',grant_id:grant.id,decision_hash:'b'.repeat(64)};
 await company.deploy(path.resolve('artifacts/audit-business-revocation/audit-business.wasm'));
 assert.deepEqual(await company.view('get_grant',{}),grant);
 assert.equal((await company.view('get_order',{order_id:'audit-1'})).state,'paid');
 await assert.rejects(root.call(company,'revoke_grant',{grant_id:grant.id}),/OWNER_REQUIRED/);
 assert.equal(await company.view('is_grant_revoked',{grant_id:grant.id}),false);
 await assert.rejects(company.call(company,'revoke_grant',{grant_id:'f'.repeat(64)}),/GRANT_MISMATCH/);
 const result=await company.callRaw(company,'revoke_grant',{grant_id:grant.id});
 assert.ok(result.logs.some(line=>line.startsWith('EVENT_JSON:')&&JSON.parse(line.slice(11)).event==='grant_revoked'));
 assert.equal(await company.view('is_grant_revoked',{grant_id:grant.id}),true);
 const after=await company.view('get_records',{});
 assert.equal(after.at(-1).kind,'grant.revoked');assert.equal(verifyBusinessRecords(after).sequence,2);
 assert.equal(await company.call(company,'revoke_grant',{grant_id:grant.id}),false);
 assert.deepEqual(await company.view('get_records',{}),after);
 await assert.rejects(agent.call(company,'fulfill',args),/GRANT_REVOKED/);
 assert.equal((await company.view('get_order',{order_id:'audit-1'})).state,'paid');
 assert.equal((await company.view('get_grant',{})).remainingYocto,'1000000000000000000000000');
 assert.equal(await vendor.view('get_notarization',{payer_id:company.accountId,order_id:'audit-1'}),null);
 assert.deepEqual(await company.view('get_records',{}),after);
 const active=await company.call(company,'issue_grant',{agent_id:agent.accountId,vendor_id:vendor.accountId,max_spend:'1000000000000000000000000',expires_at_ns:'9000000000000000000'});
 assert.notEqual(active.id,grant.id);assert.equal(await company.view('is_grant_revoked',{grant_id:active.id}),false);
 assert.equal(await agent.call(company,'fulfill',{...args,grant_id:active.id},{gas:'50000000000000'}),true);
 assert.equal(await company.view('is_grant_revoked',{grant_id:grant.id}),true);
});

test('owner app action invokes real compiled revoke_grant and blocks a later direct spend',async t=>{
 const {worker,company,agent,grant}=await businessFixture(t);
 const directory=await mkdtemp(path.join(os.tmpdir(),'audit-owner-action-'));let app;
 t.after(async()=>{await app?.close();await rm(directory,{recursive:true,force:true});});
 const credentialFile=path.join(directory,'owner.json');
 await writeFile(credentialFile,JSON.stringify({account_id:company.accountId,private_key:(await company.getKey()).toString()}),{mode:0o600});
 app=await createApp({directory:path.join(directory,'journal'),configPath:'',companyId:'revocation-test',ownerToken:'LOCAL-OWNER-ONLY',
  auditBusinessBinding:{contractId:company.accountId,credentialFile,networkId:'sandbox',rpcUrl:worker.provider.connection.url}});
 const request=token=>new Request('http://127.0.0.1/api/workspace/audit-business/revoke',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({grantId:grant.id})});
 assert.equal((await app.web.handle(request())).status,403);
 assert.equal(await company.view('is_grant_revoked',{grant_id:grant.id}),false);
 const response=await app.web.handle(request('LOCAL-OWNER-ONLY')),result=await response.json();
 assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.status,'revoked');assert.equal(result.revoked,true);assert.ok(result.txHash);
 assert.equal(await company.view('is_grant_revoked',{grant_id:grant.id}),true);
 await assert.rejects(agent.call(company,'fulfill',{order_id:'audit-1',grant_id:grant.id,decision_hash:'b'.repeat(64)}),/GRANT_REVOKED/);
 const repeated=await (await app.web.handle(request('LOCAL-OWNER-ONLY'))).json();
 assert.equal(repeated.txHash,result.txHash);assert.equal(repeated.replayed,true);
 assert.equal(app.journal.list('auditRevocations').length,1);
});
