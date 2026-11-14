import {readFile,writeFile} from 'node:fs/promises';
import {loadEnvFile} from 'node:process';
import {createHash} from 'node:crypto';
import {createRun,credential,call,view,near,RPC} from './lib/testnet.mjs';
import {decideAuditPurchase} from '../src/business/decision.mjs';
try{loadEnvFile('.env');}catch(e){if(e.code!=='ENOENT')throw e;}
const setup=JSON.parse(await readFile('docs/evidence/business-setup.json','utf8'));
if(setup.network!=='testnet')throw Error('TESTNET_REQUIRED');
const run=await createRun('business-cycle'),customer=await credential('customer'),agent=await credential('manager');
if(customer.account_id!==setup.customerId||agent.account_id!==setup.agentId)throw Error('ACCOUNT_BINDING_MISMATCH');
const orderId='audit-cycle-1',source='docs/evidence/swarm-execution.txt';
const taskHash=createHash('sha256').update(await readFile(source)).digest('hex');
const sale=await run.once('sale',()=>call(customer,setup.companyId,'buy_audit',{order_id:orderId,task_hash:taskHash},near(2)));
const order=await view(setup.companyId,'get_order',{order_id:orderId}),grant=await view(setup.companyId,'get_grant');
const attempt=process.argv[2]??'1';if(!['1','2'].includes(attempt))throw Error('AT_MOST_TWO_EXPLICIT_DECISION_ATTEMPTS');
if(run.state.steps.decision&&attempt==='1')throw Error('ORIGINAL_DECISION_RESPONSE_LOST_REQUIRES_EXPLICIT_NEW_ATTEMPT');
const decision=await run.once('decision:'+attempt,()=>decideAuditPurchase({apiKey:process.env.NEAR_AI_API_KEY,order,grant,
 recordEvidence:record=>writeFile(`docs/evidence/business-decision-attempt-${attempt}.json`,JSON.stringify(record,null,2)+'\n')}));
const spend=await run.once('spend',()=>call(agent,setup.companyId,'fulfill',{order_id:orderId,grant_id:grant.id,decision_hash:decision.decisionHash}));
const finalOrder=await view(setup.companyId,'get_order',{order_id:orderId});
const notarization=await view(setup.vendorId,'get_notarization',{payer_id:setup.companyId,order_id:orderId});
if(finalOrder.state!=='completed'||notarization!==taskHash)throw Error('SERVICE_DELIVERY_NOT_CONFIRMED');
const businessRecords=await view(setup.companyId,'get_records'),vendorRecords=await view(setup.vendorId,'get_records');
const proof={network:'testnet',rpc:RPC,recordedAt:new Date().toISOString(),setup,source,taskHash,orderId,sale,decision,spend,finalOrder,
 grantAfter:await view(setup.companyId,'get_grant'),notarization,businessRecords,vendorRecords,
 accounting:{revenueYocto:near(2).toString(),vendorSpendYocto:near(1).toString(),grossRemainderBeforeGasYocto:near(1).toString()},
 scope:'Maintainer-controlled testnet customer and vendor; real on-chain service and grant enforcement. Test NEAR has no claimed USD value. Cloud inference uses owner-prepaid credit. This does not establish independent customers or a self-funded mainnet business.'};
await writeFile('docs/evidence/business-cycle.json',JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({state:finalOrder.state,revenue:'2 test NEAR',spend:'1 test NEAR',saleTx:sale.txHash,spendTx:spend.txHash}));
