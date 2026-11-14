import {fingerprint,ContractError} from '../contracts.mjs';
import {createOperationRuntime,capability,result} from '../custody/adapter-runtime.mjs';
import {readExchange} from './http.mjs';
import {ownerIntentRequest,signedOwnerRequest,createOwnerSigning} from './owner-signing.mjs';
import {accountPlan,checkpointFeedPlan} from './accounts.mjs';

const fail=(code,status=409)=>{throw Object.assign(new ContractError(code,code),{httpStatus:status});};
export function readIntegrationFacts({journal,companyId,authorization=null,bounds=[],resources=[],costs=[]}){
 return {companyId,plans:journal?.list('integrationPlans')??[],operations:journal?Object.values(journal.snapshot().operations):[],incidents:journal?.list('integrationIncidents')??[],authorization,bounds,resources,costs};
}
export function createNearIntegrations({journal,rules,treasury,providers,dispatchAuthorized,companyId,autonomy,clock=()=>new Date(),technical={},transport=fetch}){
 const resources=new Map(),costs=new Map();
 const expires=()=>new Date(new Date(clock()).getTime()+30000).toISOString();
 let queue=Promise.resolve();const serial=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};
 const clients={'near-agent-api':createOwnerSigning({resolveSecret:providers.resolveSecret,transport,clock})};
 const meta=capability('near-integrations','live','near-ecosystem',{verified:false});
 const runtime=createOperationRuntime({journal,namespace:'near-integrations',meta,dispatchAuthorized,binding:{companyId},clock});
 const requireAllow=d=>{if(d.status!=='allow')fail(d.reasonCode,d.reasonCode==='ACCESS_DENIED'?403:409);return d;};
 const view=access=>{const d=requireAllow(rules.evaluate({id:`integrations:${companyId}:view`,type:'integration_view'},{access}));return {...d.plan,plans:journal.list('integrationPlans').filter(p=>p.companyId===companyId).map(p=>({id:p.id,kind:p.kind,hash:p.hash,createdAt:p.createdAt,expiresAt:p.expiresAt,binding:p.binding,readiness:rules.evaluate({id:`${p.id}:review`,type:'integration_review',planId:p.id},{access,financial:treasury.snapshot()}).plan??{executionAllowed:false,reasonCode:'INTEGRATION_PLAN_REQUIRED'}})),runs:journal.list('integrationRuns').filter(r=>r.companyId===companyId).map(r=>({id:r.id,planId:r.planId,status:r.result.status,reasonCode:r.result.code??null,reportedCostNanoUsd:r.result.reportedCostNanoUsd??null,evidenceRef:r.evidenceRef,providerRequestId:r.result.providerRequestId??null})),prerequisites:{cloud:'SUPPORTED_DURABLE_PLAINTEXT_REQUIRED',ledger:'EXACT_NATIVE_FEE_AND_SIGNING_AUTHORITY_REQUIRED',owner:'PARTNER_CREDENTIAL_AND_EXACT_SIGNED_INTENT_REQUIRED'}};};
 function getPlan(id){const p=journal.get('integrationPlans',id);if(!p||p.companyId!==companyId)fail('NOT_FOUND',404);return p;}
 async function prepare(kind,input,access,key){
  view(access);if(typeof key!=='string'||!key||key.length>160)fail('IDEMPOTENCY_KEY_REQUIRED',400);
  const id=`integration:${companyId}:${fingerprint(key)}`,old=journal.get('integrationPlans',id),inputHash=fingerprint({kind,input});
  if(old){if(old.inputHash!==inputHash)fail('CONFLICT');return {plan:old,replayed:true,executionAllowed:false};}
  let request;
  if(kind==='owner_generate')request=ownerIntentRequest(input);
  else if(kind==='owner_submit'){
   if(Object.keys(input).some(k=>!['intentPlanId','signedData'].includes(k)))fail('INVALID_INPUT',400);
   const prior=journal.list('integrationRuns').find(r=>r.planId===input.intentPlanId&&r.companyId===companyId&&r.result.intent);
   if(!prior)fail('OWNER_ORIGINAL_INTENT_REQUIRED');request=signedOwnerRequest(prior.result.intent,input.signedData,new Date(clock()).getTime());
  }else fail('INTEGRATION_KIND_UNSUPPORTED');
  const binding=request.binding,createdAt=new Date(clock()).toISOString(),expiresAt=new Date(new Date(clock()).getTime()+300000).toISOString();
  const p={id,companyId,kind,inputHash,request,binding,createdAt,expiresAt};p.hash=fingerprint({kind,request,binding,inputHash});
  await journal.transaction({actionId:id,fingerprint:inputHash},tx=>{tx.put('integrationPlans',id,p,{expectedVersion:0});tx.append('integration.prepared',{companyId,kind,planId:id,requestHash:p.hash});return null;});
  return {plan:p,replayed:false,executionAllowed:false};
 }
 async function recordExchange(p,action,exchange){
  const artifact=await journal.putArtifact({actionId:`${action.id}:exchange:${exchange.wireHash}`,content:exchange.raw.toString('utf8'),mediaType:'application/json'});
  const record={id:action.id,companyId,planId:p.id,requestHash:p.hash,wireHash:exchange.wireHash,evidenceRef:`private:${artifact.id}`,httpStatus:exchange.httpStatus,ok:exchange.ok,raw:exchange.raw.toString('utf8')};
  await journal.transaction({actionId:`${action.id}:wire:${exchange.wireHash}`,fingerprint:fingerprint(record)},tx=>{tx.put('integrationExchanges',action.id,record);});
  return record.evidenceRef;
 }
 async function persist(p,action,outcome,exchange){
  let evidenceRef=null;
  if(exchange)evidenceRef=await recordExchange(p,action,exchange);
  const id=action.id;
  await journal.transaction({actionId:`integration-result:${id}:${fingerprint(outcome)}`,fingerprint:fingerprint(outcome)},tx=>{tx.put('integrationRuns',id,{id,companyId,planId:p.id,requestHash:p.hash,result:outcome,evidenceRef:evidenceRef??tx.get('integrationRuns',id)?.evidenceRef??null});if(outcome.code==='PROVIDER_COST_EXCEEDED')tx.put('integrationIncidents',id,{id,companyId,type:'provider_cost_bound_breach',operationId:id,evidenceRef});tx.append('integration.observed',{companyId,kind:p.kind,planId:p.id,operationId:id,status:outcome.status,reasonCode:outcome.code??null});return null;});
  return {...outcome,planId:p.id,evidenceRef};
 }
 async function execute({planId},access){
  view(access);const p=getPlan(planId),id=`${p.id}:execute`;
  const maxCostNanoUsd=p.request.maxCostNanoUsd??'0',action={id,type:'integration_execute',planId,requestHash:p.hash,maxCostNanoUsd};
  const old=runtime.read(action);if(old)return {status:old.result?.status??old.status,reasonCode:'ORIGINAL_OPERATION_RECONCILIATION_REQUIRED',operationId:id};
  const facts={access,financial:treasury.snapshot()},decision=requireAllow(rules.evaluate(action,facts));
  const client=clients[p.binding.provider];if(!client)fail('INTEGRATION_PROVIDER_UNAVAILABLE');
  // Resolve credentials before reserving, so missing credentials cause no held money.
  const prepared=await client.prepare(p.request);
  await treasury.applyDecision({actionId:id,decision});
  let exchange;
  const outcome=await runtime.execute({action,decision,facts,payload:p.request,prepare:async()=>prepared,send:async handle=>{
   exchange=await readExchange(await handle.start());
   // Preserve the exact accepted response before parsing/verification or a
   // workflow transition. Recovery can inspect it without resending an effect.
   await recordExchange(p,action,exchange);
   if(exchange.parseError)throw new ContractError(exchange.parseError,exchange.parseError);
   if(!exchange.ok)return result(meta,exchange.httpStatus>=500?'unknown':'failed',action,{code:'PROVIDER_HTTP_ERROR',cost:{status:'pending',actualCostNanoUsd:null}});
   const decoded=await client.decode(exchange,p.request);return result(meta,decoded.status,action,decoded);
  }});
  const observed=await persist(p,action,outcome,exchange);
  if(outcome.status==='not_submitted'){const d=rules.evaluate({id:`${id}:release`,type:'integration_release',operationId:id},{access,financial:treasury.snapshot()});if(d.status==='allow')await treasury.applyDecision({actionId:`${id}:release`,decision:d});}
  else if(['unknown','pending','failed'].includes(outcome.status)||outcome.cost?.status==='pending'){const d=rules.evaluate({id:`${id}:unresolved`,type:'integration_observed',operationId:id},{access,financial:treasury.snapshot()});if(d.status==='allow')await treasury.applyDecision({actionId:`${id}:unresolved`,decision:d});}
  return observed;
 }
 async function reconcile({planId},access){
  view(access);const p=getPlan(planId),action={id:`${p.id}:execute`,type:'integration_execute',planId,requestHash:p.hash,maxCostNanoUsd:p.request.maxCostNanoUsd??'0'},client=clients[p.binding.provider];
  let exchange;
  const outcome=await runtime.reconcile(action,async op=>{
   if(!op.result){const wire=journal.get('integrationExchanges',action.id);if(wire?.requestHash===p.hash){let value;try{value=JSON.parse(wire.raw);}catch{return result(meta,'unknown',action,{code:'PROVIDER_INVALID_JSON'});}return result(meta,'unknown',action,await client.decode({...wire,value},p.request));}}
   if(p.kind==='owner_submit'){exchange=await client.observe(p.request.body.correlation_id);return result(meta,'unknown',action,await client.decode(exchange,p.request));}
   // Reconciliation observes the original operation; it never resends an effect.
   return op.result??result(meta,'unknown',action,{code:'ORIGINAL_PROVIDER_OBSERVATION_REQUIRED'});
  });
  return persist(p,action,outcome,exchange);
 }
 return {view,prepare:(...args)=>serial(()=>prepare(...args)),execute:(...args)=>serial(()=>execute(...args)),reconcile:(...args)=>serial(()=>reconcile(...args)),
  facts:()=>({resources:[...resources.values()],costs:[...costs.values()],bounds:[]}),
  accountPlan:(input,access)=>{view(access);return accountPlan(input);},
  feedPlan:(input,access)=>{view(access);if(Object.keys(input).some(k=>k!=='destination'))fail('INVALID_INPUT',400);return checkpointFeedPlan({checkpoint:journal.list('ledgerChainCheckpoints').find(c=>c.companyId===companyId),binding:technical.ledgerBinding,destination:input.destination});},
 };
}
