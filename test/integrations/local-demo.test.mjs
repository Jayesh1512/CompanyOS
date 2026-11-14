import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../../src/app.mjs';
import {startServer} from '../../server.mjs';
import {createRules} from '../../src/rules/index.mjs';
import {createRuntimeProviders} from '../../src/runtime/providers.mjs';

test('each launch creates a fresh customer-care agency while retries and page refresh retain the current session',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'near-real-demo-')),demoDirectory=path.join(dir,'demo');let main;
 const actualFetch=globalThis.fetch,external=[];globalThis.fetch=(target,options)=>{const u=new URL(typeof target==='string'?target:target.url??target);if(u.hostname!=='127.0.0.1'){external.push(u.origin);throw Error('Unexpected external request in local demo');}return actualFetch(target,options);};t.after(()=>{globalThis.fetch=actualFetch;});
 t.after(async()=>{await main?.close();await rm(dir,{recursive:true,force:true});});
 const make=async()=>startServer({app:await createApp({directory:path.join(dir,'main'),configPath:'',companyId:'main-company'}),port:0,demoDirectory});
 main=await make();const before=main.app.journal.snapshot();
 const request=async(base,route,body,token,key='local-demo-test')=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Origin:base,'Sec-Fetch-Site':'same-origin','content-type':'application/json','idempotency-key':key,...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 const [a,b]=await Promise.all([request(main.url,'/api/workspace/local-demo/open',{}),request(main.url,'/api/workspace/local-demo/open',{})]);assert.equal(a.status,200,JSON.stringify(a));assert.equal(b.status,200);assert.equal(a.body.url,b.body.url);assert.equal(a.body.companyId,b.body.companyId);assert.match(a.body.companyId,/^real-local-demo-[a-f0-9-]{36}$/);
 let demo=new URL(a.body.url).origin;const status=await request(demo,'/api/workspace/local-demo');assert.equal(status.body.active,true);assert.equal(status.body.agentCount,4);assert.equal(status.body.documentCount,4);assert.equal(status.body.serviceCount,2);assert.equal(status.body.knowledgeStatus,'connected');assert.equal(status.body.financialVersion,0);assert.equal(status.body.providerOperations,0);
 const team=(await request(demo,'/api/workspace')).body;assert.equal(team.workspace.id,a.body.companyId);assert.match(team.organization.name,/Northstar Care/);assert.match(team.organization.purpose,/customer-care/);assert.deepEqual(team.agents.map(a=>a.name).sort(),['Harbor Mutual Claims Guide','Harbor Mutual Policy Guide','Northstar Care Backlog','Northstar Care Manager']);assert.ok(team.agents.every(agent=>agent.companyId===a.body.companyId&&agent.status==='ready'));
 const catalog=(await request(demo,'/api/support/services')).body.services,opened=(await request(demo,'/api/support/conversations',{serviceId:catalog[0].id})).body;
 const reply=await request(demo,`/api/support/conversations/${opened.conversation.id}/messages`,{text:'What is the auto collision deductible?'},opened.accessToken);assert.equal(reply.status,200);assert.match(reply.body.reply.text,/500 demo dollars/);assert.ok(reply.body.reply.citations.length);
 // Use a different stable identity for the second message.
 const reviewed=await fetch(demo+`/api/support/conversations/${opened.conversation.id}/messages`,{method:'POST',headers:{Origin:demo,'content-type':'application/json','idempotency-key':'claim-decision',authorization:'Bearer '+opened.accessToken},body:JSON.stringify({text:'Please approve my insurance claim.'})});assert.equal(reviewed.status,200);assert.ok((await reviewed.json()).ticket);
 const inbox=(await request(demo,'/api/workspace/support')).body;assert.equal(inbox.tickets.length,1);
 const final=(await request(demo,'/api/workspace/local-demo')).body;assert.equal(final.replyCount,2);assert.equal(final.ticketCount,1);assert.ok(final.eventCount>status.body.eventCount);assert.equal(final.financialVersion,0);assert.equal(final.providerOperations,0);
 assert.equal(catalog.length,2);assert.ok(catalog.every(service=>service.companyId===a.body.companyId&&service.status==='published'&&team.agents.some(agent=>agent.id===service.agentId)));
 const company=(await request(demo,'/api/workspace/autonomy')).body.company;const denied=await request(demo,'/api/workspace/autonomy/control',{version:company.version,operation:'start'});assert.equal(denied.status,409);assert.equal(denied.body.error.code,'LOCAL_DEMO_SCOPE');
 const cross=await fetch(main.url+'/api/workspace/local-demo/open',{method:'POST',headers:{Origin:'https://other.invalid','content-type':'application/json'},body:'{}'});assert.equal(cross.status,403);
 assert.deepEqual(main.app.journal.snapshot(),before,'opening/using demo must not change original company');
 const fresh=await request(main.url,'/api/workspace/local-demo/open',{},undefined,'next-launch');assert.equal(fresh.status,200);assert.notEqual(fresh.body.companyId,a.body.companyId);assert.notEqual(fresh.body.url,a.body.url);
 const nextDemo=new URL(fresh.body.url).origin,next=(await request(nextDemo,'/api/workspace/local-demo')).body,nextTeam=(await request(nextDemo,'/api/workspace')).body;assert.equal(next.companyId,fresh.body.companyId);assert.equal(next.agentCount,4);assert.equal(next.serviceCount,2);assert.equal(next.ticketCount,0);assert.equal(next.replyCount,0);assert.ok(nextTeam.agents.every(agent=>!team.agents.some(old=>old.id===agent.id)));
 const transcript=await request(demo,'/api/support/conversations/'+opened.conversation.id,undefined,opened.accessToken);assert.equal(transcript.status,200);assert.equal(transcript.body.messages.length,4);
 assert.equal((await request(nextDemo,'/api/support/conversations/'+opened.conversation.id,undefined,opened.accessToken)).status,403);
 assert.equal((await request(demo,'/api/workspace/local-demo')).body.companyId,a.body.companyId);
 const oldJournal=path.join(demoDirectory,'sessions',a.body.sessionId,'company','journal.json'),saved=await readFile(oldJournal,'utf8');assert.ok(saved.includes(opened.conversation.id));
 await main.close();main=await make();const reopened=await request(main.url,'/api/workspace/local-demo/open',{});assert.equal(reopened.status,200,JSON.stringify(reopened));demo=new URL(reopened.body.url).origin;
 const restarted=(await request(demo,'/api/workspace/local-demo')).body;assert.notEqual(restarted.companyId,a.body.companyId);assert.notEqual(restarted.companyId,fresh.body.companyId);assert.equal(restarted.agentCount,4);assert.equal(restarted.serviceCount,2);assert.equal(restarted.ticketCount,0);assert.equal(restarted.replyCount,0);assert.equal(restarted.returnUrl,main.url);assert.equal(await readFile(oldJournal,'utf8'),saved);
 assert.deepEqual(external,[],'no external provider request during the complete local demo');
});
test('local-demo private context denies paid/provisioning/preflight/start paths and cannot be supplied through request facts',()=>{
 const companyId='real-local-demo',owner={companyId,role:'owner',verified:true},rules=createRules({companyId,setupOnly:true,localDemoContext:{kind:'real-local-demo',returnUrl:'http://127.0.0.1:4173'}});
 for(const type of ['agent_inference','component_inference','integration_execute','ledger_chain_publish','funding','payout','refund','runtime_probe','component_preflight','cloud_catalog'])assert.equal(rules.evaluate({id:type,type},{access:owner}).reasonCode,'LOCAL_DEMO_SCOPE',type);
 assert.equal(rules.evaluate({id:'start',type:'autonomy_control'},{access:owner,input:{operation:'start'}}).reasonCode,'LOCAL_DEMO_SCOPE');
 assert.equal(rules.evaluate({id:'status',type:'local_demo_status'},{access:owner,input:{}}).plan.active,true);
 assert.equal(rules.evaluate({id:'status',type:'local_demo_status'},{access:{role:'public'},input:{}}).reasonCode,'ACCESS_DENIED');
 const normal=createRules({companyId,setupOnly:true});assert.equal(normal.evaluate({id:'status',type:'local_demo_status'},{access:owner,localDemoContext:{kind:'real-local-demo'},input:{}}).plan.active,false);
});
test('explicit null authorization and binding isolation never fall back to the main environment',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'near-demo-env-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=path.join(dir,'owner.json');await writeFile(file,JSON.stringify({id:'MAIN-OWNER-AUTHORIZATION'}),{mode:0o600});
 const p=createRuntimeProviders({aiDemoAuthorizationPath:file,integrationAuthorizationPath:file,ledgerAuthorizationPath:file,getAiDemoAuthorization:()=>null,getIntegrationAuthorization:()=>null,getLedgerAuthorization:()=>null});assert.equal(p.getAiDemoAuthorization(),null);assert.equal(p.getIntegrationAuthorization(),null);assert.equal(p.getLedgerAuthorization(),null);
 const parent=path.join(dir,'existing');await mkdir(parent);await assert.rejects((await import('../../src/demo/local.mjs')).createLocalDemoLauncher({directory:parent,binary:path.resolve('.runtime/dependencies/jbrain/target/release/jbrain'),returnUrl:'http://127.0.0.1:4173',serve:startServer}).open(),{code:'ENOENT'});
});

test('legacy demo history is retained while new launches receive fresh session directories',async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'near-legacy-demo-')),demoDirectory=path.join(directory,'demo');await mkdir(demoDirectory);await writeFile(path.join(demoDirectory,'local-demo.json'),JSON.stringify({version:1,companyId:'real-local-demo',kind:'real-local-demo'}));await writeFile(path.join(demoDirectory,'old-history.txt'),'previous agency work');
 const main=await startServer({app:await createApp({directory:path.join(directory,'main'),configPath:'',companyId:'main-company'}),port:0,demoDirectory});t.after(async()=>{await main.close();await rm(directory,{recursive:true,force:true});});
 const response=await fetch(main.url+'/api/workspace/local-demo/open',{method:'POST',headers:{Origin:main.url,'content-type':'application/json'},body:'{}'}),value=await response.json();assert.equal(response.status,200,JSON.stringify(value));assert.notEqual(value.companyId,'real-local-demo');assert.equal(await readFile(path.join(demoDirectory,'old-history.txt'),'utf8'),'previous agency work');
});
