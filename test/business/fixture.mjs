import {Worker} from 'near-workspaces';
import path from 'node:path';
export async function businessFixture(t,{wasm='artifacts/audit-business-revocation/audit-business.wasm'}={}){
 const worker=await Worker.init({network:'sandbox'});t.after(()=>worker.tearDown());
 const root=worker.rootAccount,company=await root.devCreateAccount(),vendor=await root.devCreateAccount(),agent=await root.createSubAccount('buyer-agent');
 for(const c of [company,vendor]){await c.deploy(path.resolve(wasm));await c.call(c,'new',{});}
 const grant=await company.call(company,'issue_grant',{agent_id:agent.accountId,vendor_id:vendor.accountId,max_spend:'1000000000000000000000000',expires_at_ns:'9000000000000000000'});
 await root.call(company,'buy_audit',{order_id:'audit-1',task_hash:'a'.repeat(64)},{attachedDeposit:'2000000000000000000000000'});
 return {worker,root,company,vendor,agent,grant};
}
