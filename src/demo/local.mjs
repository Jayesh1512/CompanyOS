import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import path from 'node:path';
import {createApp} from '../app.mjs';
import {ContractError} from '../contracts.mjs';

export const LOCAL_DEMO_COMPANY='real-local-demo';
const VERSION=2;
const brief={name:'Northstar Care · Demo',purpose:'Run a customer-care agency for fictional Harbor Mutual Insurance, answering policy questions from approved sources and escalating individual claims for owner review.',industry:'Customer care · fictional insurance',customer:'Harbor Mutual Insurance — fictional local example',outcome:'Source-backed customer replies, published policy and claims services, and owner-review tickets.',objective:'Set up the customer-care team, publish its services in the local marketplace, and handle a policy question or claim escalation.'};
const intent={maxAgents:6,maxOpenWork:12,maxDepth:3,maxSteps:24,maxCalls:0,maxCreations:10,maxInputBytes:262144,maxResultBytes:131072,maxRetries:2,allowedResourceKinds:['skill','soul'],allowedPatchKinds:['template.add_optional_field','template.require_field']};
const fail=(code,message)=>{throw new ContractError(code,message);};

/** Each launch identity creates a fresh company, journal and native brain.
 * Retrying the same launch identity returns that session; refreshing its pages
 * retains its work. Previous sessions and the main company are never reset. */
export function createLocalDemoLauncher({directory,binary,returnUrl,serve}){
 const parent=new URL(returnUrl);if(parent.protocol!=='http:'||parent.hostname!=='127.0.0.1'||parent.pathname!=='/'||parent.search||parent.hash||parent.username||parent.password)fail('LOCAL_DEMO_ORIGIN','Use the owning loopback workspace.');
 const launches=new Map(),sessions=new Set();let preparing,closing=false;
 async function prepare(){
  await access(binary);
  await mkdir(path.dirname(directory),{recursive:true});
  let fresh=false;try{await mkdir(directory,{mode:0o700});fresh=true;}catch(e){if(e.code!=='EEXIST')throw e;}
  const marker=path.join(directory,'local-demo.json');
  if(fresh)await writeFile(marker,JSON.stringify({version:VERSION,kind:'real-local-demo'})+'\n',{flag:'wx',mode:0o600});
  const saved=JSON.parse(await readFile(marker,'utf8'));
  const known=saved.kind==='real-local-demo'&&(saved.version===VERSION||saved.version===1&&saved.companyId===LOCAL_DEMO_COMPANY);
  if(!known)fail('LOCAL_DEMO_STORE_MISMATCH','This directory is not an isolated demo store.');
  await mkdir(path.join(directory,'sessions'),{recursive:true,mode:0o700});
 }
 async function open(key=randomUUID()){
  if(closing)fail('LOCAL_DEMO_CLOSING','The local workspace is closing.');
  if(typeof key!=='string'||!key.trim()||key.length>160)fail('IDEMPOTENCY_KEY_REQUIRED','Use a valid demo launch identity.');
  if(launches.has(key))return launches.get(key);
  const opening=start().catch(error=>{launches.delete(key);throw error;});launches.set(key,opening);return opening;
 }
 async function start(){
  preparing??=prepare().catch(error=>{preparing=null;throw error;});await preparing;
  if(closing)fail('LOCAL_DEMO_CLOSING','The local workspace is closing.');
  const sessionId=randomUUID(),companyId=LOCAL_DEMO_COMPANY+'-'+sessionId,sessionDirectory=path.join(directory,'sessions',sessionId);
  await mkdir(sessionDirectory,{mode:0o700});
  await writeFile(path.join(sessionDirectory,'local-demo.json'),JSON.stringify({version:VERSION,companyId,sessionId,kind:'real-local-demo'})+'\n',{flag:'wx',mode:0o600});
  const brainDirectory=path.join(sessionDirectory,'brain');await mkdir(brainDirectory,{mode:0o700});
  const token=randomBytes(32).toString('hex');await writeFile(path.join(brainDirectory,'access.token'),token+'\n',{flag:'wx',mode:0o600});
  const brain=spawn(binary,['serve'],{env:{PATH:process.env.PATH,HOME:process.env.HOME,JBRAIN_DATA_DIR:brainDirectory,JBRAIN_HOST:'127.0.0.1',JBRAIN_PORT:'0',JBRAIN_TOKEN:token,JBRAIN_HISTORY:'off'},stdio:['ignore','pipe','pipe']});brain.stderr.on('data',()=>{});
  let app,runtime;
  const stopBrain=async()=>{if(!brain.pid||brain.exitCode!==null||brain.signalCode!==null)return;brain.kill('SIGTERM');await new Promise(resolve=>brain.once('exit',resolve));};
  try{
   const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Local JBrain startup timed out.')),15000);const lines=createInterface({input:brain.stdout});lines.on('line',line=>{try{const value=JSON.parse(line);if(value.event==='ready'){clearTimeout(timer);resolve(value.url);}}catch{}});brain.once('error',e=>{clearTimeout(timer);reject(e);});brain.once('exit',()=>{clearTimeout(timer);reject(Error('Local JBrain exited before readiness.'));});});
   app=await createApp({directory:path.join(sessionDirectory,'company'),companyId,configPath:'',localDemoContext:{kind:'real-local-demo',returnUrl:parent.origin,sessionId},totalCeilingNanoUsd:'5000000000',jbrainUrl:url,jbrainToken:token,
    ownerToken:'',ownerTokenFile:'',agentId:'',accountId:'',sourceUrls:[],componentModel:'',agentBalanceSource:'',ledgerBinding:null,ledgerWalletPublicFile:'',outlayerBinding:null,creditOrganizationId:'',creditSessionSecretRef:'',reportingOrganizationId:'',reportingSecretRef:'',allowDeprecatedReporting:false,fundedLoopFile:'',enableAgentSpend:false,
    resolveSecret:async()=>null,getAiDemoAuthorization:()=>null,getAuthorization:()=>null,getComponentAuthorization:()=>null,getAgentAuthorization:()=>null,getInferenceBounds:()=>null,getIntegrationAuthorization:()=>null,getLedgerAuthorization:()=>null,integrationAuthorizationPath:'',ledgerAuthorizationPath:''});
   if(app.treasury.snapshot().version!==0||app.journal.list('orders').length||Object.keys(app.journal.snapshot().operations).length)fail('LOCAL_DEMO_ECONOMIC_HISTORY','This local demo cannot adopt economic history.');
   const owner={role:'owner',verified:true,companyId};
   await app.autonomy.onboard({version:0,organizationVersion:0,brief,intent},owner,'customer-care-demo-onboard');
   const roles=[
    ['manager','Northstar Care Manager','Customer-care agency manager','Coordinate the Northstar Care customer-care agency for fictional Harbor Mutual Insurance. Route policy questions to the policy guide, claims reporting to the claims guide, and unsupported decisions to owner review. Use approved company knowledge; never approve claims, contact insurers or authorize payments.'],
    ['backlog','Northstar Care Backlog','Customer-care quality and backlog','Track unanswered customer questions, knowledge gaps and owner-review tickets for Northstar Care. Keep the fictional Harbor Mutual sources authoritative. Propose scoped process repairs; never invent policy, approve a claim or authorize spending.'],
   ];
   for(const [role,name,agentRole,instructions]of roles){const agent=app.journal.get('agents',companyId+':'+role);await app.workspace.update(agent.id,{version:agent.version,name,role:agentRole,instructions,status:'ready'},owner);}
   await app.customerCare.setupDemo(owner,'customer-care-demo-services');
   const company=app.journal.get('autonomousCompanies',companyId);
   await app.autonomy.reviewSetup({version:company.version},owner,'customer-care-demo-review');
   await app.journal.transaction({actionId:'customer-care-demo-initialized',fingerprint:companyId},tx=>tx.put('runtime','localDemoInitialized',{id:'localDemoInitialized',version:VERSION,sessionId,companyId}));
   runtime=await serve({app,port:0,host:'127.0.0.1',enableLocalDemo:false,localOwnerAccess:true});
   const owned={close:async()=>{await runtime.close();await stopBrain();}};sessions.add(owned);
   brain.once('exit',()=>{if(sessions.delete(owned))runtime.close().catch(()=>{});});
   return {active:true,url:runtime.url+'/#setup/org',companyId,sessionId,realLocal:true,paidCalls:0};
  }catch(error){await runtime?.close().catch(()=>{});if(!runtime)await app?.close().catch(()=>{});await stopBrain();throw error;}
 }
 return {open,async close(){closing=true;await Promise.allSettled(launches.values());await Promise.allSettled([...sessions].map(async owned=>{sessions.delete(owned);await owned.close();}));}};
}
