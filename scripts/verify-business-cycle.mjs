import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {JsonRpcProvider} from 'near-api-js';
import {verifyBusinessRecords} from '../src/business/evidence.mjs';
import {view,explorer,RPC} from './lib/testnet.mjs';
const p=JSON.parse(await readFile('docs/evidence/business-cycle.json','utf8'));
if(p.transactionHashesWithheld)throw Error('TRANSACTION_HASHES_WITHHELD: original private receipt required for transaction verification');
const rpc=new JsonRpcProvider({url:RPC}),lines=[];
const pass=s=>{lines.push('PASS '+s);console.log('PASS '+s);};
const build=JSON.parse(await readFile('artifacts/audit-business/manifest.json','utf8'));
for(const id of [p.setup.companyId,p.setup.vendorId]){
 const state=await rpc.query({request_type:'view_account',finality:'final',account_id:id});
 assert.equal(state.code_hash,build.codeHash);
}
pass('both deployed contracts match the committed compiled WASM hash');
async function tx(receipt){
 const result=await rpc.viewTransactionStatus({txHash:receipt.txHash,accountId:receipt.signerId,waitUntil:'FINAL'});
 assert.equal(result.final_execution_status,'FINAL');assert.ok(Object.hasOwn(result.status,'SuccessValue'));
 assert.ok(!result.receipts_outcome.some(r=>r.outcome.status.Failure));return result;
}
assert.equal(p.network,'testnet');assert.equal(p.taskHash,createHash('sha256').update(await readFile(p.source)).digest('hex'));
const sale=await tx(p.sale),saleCall=sale.transaction.actions[0].FunctionCall;
assert.equal(sale.transaction.signer_id,p.setup.customerId);assert.equal(sale.transaction.receiver_id,p.setup.companyId);
assert.equal(saleCall.method_name,'buy_audit');assert.equal(saleCall.deposit,'2000000000000000000000000');
assert.deepEqual(JSON.parse(Buffer.from(saleCall.args,'base64').toString()),{order_id:p.orderId,task_hash:p.taskHash});
pass(`2 test NEAR revenue FINAL: ${p.sale.txHash}\n  ${explorer(p.sale.txHash)}`);
assert.equal(p.decision.responseSignatureVerified,true);assert.equal(p.decision.signatureKind,'provider_tee');
assert.equal(p.decision.decisionHash,createHash('sha256').update(p.decision.rawOutput).digest('hex'));
assert.deepEqual(JSON.parse(p.decision.rawOutput),p.decision.command);
assert.equal(p.decision.command.vendorId,p.setup.vendorId);assert.equal(p.decision.command.amountYocto,'1000000000000000000000000');
pass('retained original SDK-verified Cloud decision selects the exact granted vendor and 1 test NEAR fee');
const spend=await tx(p.spend),spendCall=spend.transaction.actions[0].FunctionCall;
assert.equal(spend.transaction.signer_id,p.setup.agentId);assert.equal(spend.transaction.receiver_id,p.setup.companyId);
assert.equal(spendCall.method_name,'fulfill');assert.equal(spendCall.deposit,'0');
assert.deepEqual(JSON.parse(Buffer.from(spendCall.args,'base64').toString()),{order_id:p.orderId,grant_id:p.setup.grant.id,decision_hash:p.decision.decisionHash});
// A provider success flag alone is insufficient: inspect the actual receipt
// action on chain, including the exact 1 NEAR outgoing call to the supplier.
const receiptIds=spend.receipts_outcome.map(r=>r.id),actions=[];
for(const receiptId of receiptIds){const r=await rpc.sendJsonRpc('EXPERIMENTAL_receipt',{receipt_id:receiptId});if(r?.receiver_id===p.setup.vendorId)actions.push(...(r.receipt?.Action?.actions??[]));}
const notaryCall=actions.find(a=>a.FunctionCall?.method_name==='notarize')?.FunctionCall;
assert.ok(notaryCall);assert.equal(notaryCall.deposit,'1000000000000000000000000');
assert.deepEqual(JSON.parse(Buffer.from(notaryCall.args,'base64').toString()),{order_id:p.orderId,task_hash:p.taskHash});
pass(`agent-signed, grant-bound 1 test NEAR vendor call FINAL: ${p.spend.txHash}\n  ${explorer(p.spend.txHash)}`);
assert.deepEqual(await view(p.setup.companyId,'get_order',{order_id:p.orderId}),p.finalOrder);assert.equal(p.finalOrder.state,'completed');
assert.equal(await view(p.setup.vendorId,'get_notarization',{payer_id:p.setup.companyId,order_id:p.orderId}),p.taskHash);
assert.equal((await view(p.setup.companyId,'get_grant')).remainingYocto,'0');
pass('paid service stored the exact customer digest; callback marked order completed; grant allowance is exhausted');
const business=await view(p.setup.companyId,'get_records'),vendor=await view(p.setup.vendorId,'get_records');
assert.deepEqual(business,p.businessRecords);assert.deepEqual(vendor,p.vendorRecords);
verifyBusinessRecords(business);verifyBusinessRecords(vendor);
assert.deepEqual(business.map(r=>r.kind),['sale.confirmed','spend.requested','spend.completed']);
pass('both on-chain hash chains recompute; sale, requested spend, completed spend and real vendor notarization are stored');
assert.equal(BigInt(p.accounting.revenueYocto)-BigInt(p.accounting.vendorSpendYocto),BigInt(p.accounting.grossRemainderBeforeGasYocto));
lines.push('Scope: maintainer-controlled testnet accounts; no USD value, independent customers or self-funded mainnet business established. Cloud acceptance is retained original-process verification, not replayed plaintext verification.');
await writeFile('docs/evidence/business-verification.txt',lines.join('\n')+'\n');
