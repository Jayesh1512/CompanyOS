import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'near-workspaces';
import path from 'node:path';
import {verifyBusinessRecords} from '../../src/business/evidence.mjs';

const ONE='1000000000000000000000000',TWO='2000000000000000000000000';
export async function businessFixture(t){
 const worker=await Worker.init({network:'sandbox'});t.after(()=>worker.tearDown());
 const root=worker.rootAccount,company=await root.devCreateAccount(),vendor=await root.devCreateAccount(),agent=await root.createSubAccount('buyer-agent');
 for(const c of [company,vendor]){await c.deploy(path.resolve('artifacts/audit-business/audit-business.wasm'));await c.call(c,'new',{});}
 const grant=await company.call(company,'issue_grant',{agent_id:agent.accountId,vendor_id:vendor.accountId,max_spend:ONE,expires_at_ns:'9000000000000000000'});
 await root.call(company,'buy_audit',{order_id:'audit-1',task_hash:'a'.repeat(64)},{attachedDeposit:TWO});
 return {root,company,vendor,agent,grant};
}

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
