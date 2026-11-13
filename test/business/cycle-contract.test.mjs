import test from 'node:test';
import assert from 'node:assert/strict';
import {businessFixture} from './fixture.mjs';
import {verifyBusinessRecords} from '../../src/business/evidence.mjs';

const ONE='1000000000000000000000000',TWO='2000000000000000000000000';

test('compiled business executes revenue, grant-bound service purchase, delivery and hash-chain commits',async t=>{
 const {company,vendor,agent,grant}=await businessFixture(t);
 const delivered=await agent.call(company,'fulfill',{order_id:'audit-1',grant_id:grant.id,decision_hash:'b'.repeat(64)},{gas:'50000000000000'});
 assert.equal(delivered,true);
 const order=await company.view('get_order',{order_id:'audit-1'});assert.equal(order.state,'completed');assert.equal(order.revenueYocto,TWO);assert.equal(order.spendYocto,ONE);
 assert.equal(await vendor.view('get_notarization',{payer_id:company.accountId,order_id:'audit-1'}),'a'.repeat(64));
 assert.equal((await company.view('get_grant',{})).remainingYocto,'0');
 const records=await company.view('get_records',{});assert.deepEqual(records.map(r=>r.kind),['sale.confirmed','spend.requested','spend.completed']);
 assert.equal(verifyBusinessRecords(records).sequence,3);assert.equal(verifyBusinessRecords(await vendor.view('get_records',{})).sequence,1);
});

test('compiled business rejects unauthorized and expired-grant spends before any external effect',async t=>{
 const {worker,root,company,vendor,agent,grant}=await businessFixture(t);
 const args={order_id:'audit-1',grant_id:grant.id,decision_hash:'b'.repeat(64)};
 const original=await company.view('get_records',{});
 const unchanged=async()=>{
  assert.deepEqual(await company.view('get_records',{}),original);
  assert.equal((await company.view('get_order',{order_id:'audit-1'})).state,'paid');
  assert.equal(await vendor.view('get_notarization',{payer_id:company.accountId,order_id:'audit-1'}),null);
  assert.equal((await company.view('get_grant',{})).remainingYocto,ONE);
 };
 await t.test('unauthorized signer cannot spend',async()=>{await assert.rejects(root.call(company,'fulfill',args),/AGENT_REQUIRED/);await unchanged();});
 await t.test('foreign grant cannot spend',async()=>{await assert.rejects(agent.call(company,'fulfill',{...args,grant_id:'wrong-grant'}),/GRANT_MISMATCH/);await unchanged();});
 await t.test('invalid decision commitment cannot spend',async()=>{await assert.rejects(agent.call(company,'fulfill',{...args,decision_hash:'not-a-hash'}),/DECISION_HASH_REQUIRED/);await unchanged();});
 await t.test('non-owner cannot widen the grant',async()=>{
  await assert.rejects(root.call(company,'issue_grant',{agent_id:root.accountId,vendor_id:vendor.accountId,max_spend:TWO,expires_at_ns:'9000000000000000000'}),/OWNER_REQUIRED/);await unchanged();
 });
 await t.test('forged callback cannot manufacture completion',async()=>{await assert.rejects(root.call(company,'on_notarized',{order_id:'audit-1'}),/private/);await unchanged();});
 await t.test('expired grant cannot spend or consume the order',async()=>{
  const block=await worker.provider.block({finality:'final'});
  const expiry=(BigInt(block.header.timestamp_nanosec??block.header.timestamp)+10_000_000_000n).toString();
  const short=await company.call(company,'issue_grant',{agent_id:agent.accountId,vendor_id:vendor.accountId,max_spend:ONE,expires_at_ns:expiry});
  await worker.provider.fastForward(20);
  await assert.rejects(agent.call(company,'fulfill',{...args,grant_id:short.id}),/GRANT_EXPIRED/);await unchanged();
 });
});

test('compiled business cannot double-spend a delivered order or exceed a grant',async t=>{
 const {root,company,vendor,agent,grant}=await businessFixture(t);
 const args={order_id:'audit-1',grant_id:grant.id,decision_hash:'b'.repeat(64)};
 await agent.call(company,'fulfill',args,{gas:'50000000000000'});
 await root.call(company,'buy_audit',{order_id:'audit-2',task_hash:'c'.repeat(64)},{attachedDeposit:TWO});
 await assert.rejects(agent.call(company,'fulfill',{...args,order_id:'audit-2'}),/GRANT_EXHAUSTED/);
 assert.equal((await company.view('get_order',{order_id:'audit-2'})).state,'paid');
 const renewed=await company.call(company,'issue_grant',{agent_id:agent.accountId,vendor_id:vendor.accountId,max_spend:ONE,expires_at_ns:'9000000000000000000'});
 const before=await company.view('get_records',{});
 await assert.rejects(agent.call(company,'fulfill',{...args,grant_id:renewed.id}),/ORDER_NOT_SPENDABLE/);
 assert.deepEqual(await company.view('get_records',{}),before);
 assert.equal((await company.view('get_grant',{})).remainingYocto,ONE);
 assert.equal((await vendor.view('get_records',{})).length,1);
});
