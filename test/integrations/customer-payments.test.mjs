import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../../src/app.mjs';
import {paymentReceipt,customerPaymentView} from '../../src/payments/receipts.mjs';
import {renderCustomerPayments,renderPaymentSummary} from '../../public/customer-payments.js';
import {renderWorkspace} from '../../public/workspace.js';
import {parseRoute} from '../../public/app.js';
const recorded=JSON.parse(await readFile(new URL('../../artifacts/mainnet-proof/funded-loop.json',import.meta.url),'utf8'));

test('receipt projection exposes exact USDC and evidence references, excluding private payment and inference data',()=>{
 const r=paymentReceipt(recorded);assert.equal(r.status,'received');assert.deepEqual(r.amount,{amount:'100000',decimals:6,asset:'USDC',network:'NEAR mainnet'});assert.equal(r.id,recorded.sale.id);assert.equal(r.ledgerTx,recorded.sale.saleLedgerTx);
 const text=JSON.stringify(r);for(const field of ['customer','depositAddress','answer','runKey','inferenceId','funding'])assert.ok(!Object.hasOwn(r,field));assert.ok(!text.includes(recorded.sale.customer));
 for(const sale of [{},{...recorded.sale,asset:'unknown'},{...recorded.sale,priceAtomic:'NaN'},{...recorded.sale,priceAtomic:100000},{...recorded.sale,status:'pending'},{...recorded.sale,priceAtomic:'0'},{...recorded.sale,depositTxs:[]},{...recorded.sale,saleLedgerTx:null}])assert.equal(paymentReceipt({sale}),null);
});
test('recorded mainnet receipt is separate from company receipts and demo never reads the parent funded state',async()=>{
 const empty=await customerPaymentView({companyId:'fresh'});assert.equal(empty.receipts.length,0);assert.equal(empty.recordedReceipt.id,recorded.sale.id);
 const demo=await customerPaymentView({companyId:'demo',localDemo:true,fundedLoop:{view(){throw Error('Parent state must not be read');}}});assert.equal(demo.receipts.length,0);assert.equal(demo.canReceivePayments,false);
 const current=await customerPaymentView({companyId:'current',fundedLoop:{view:async()=>({sales:{[recorded.sale.id]:recorded}})}});assert.equal(current.receipts.length,1);assert.equal(current.recordedReceipt,null);
});
test('owner receipt endpoint is read-only, query-free and does not change financial or journal state',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'payment-ui-'));const app=await createApp({directory:dir,companyId:'receipt-test',configPath:'',fundedLoopFile:''});
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 const call=(route='/api/workspace/customer-payments',owner=false,method='GET')=>app.web.handle(new Request('http://localhost'+route,{method}),{localOwner:owner});
 const before=app.journal.snapshot(),financial=app.treasury.snapshot();
 assert.equal((await call()).status,403);const r=await call(undefined,true);assert.equal(r.status,200);const d=await r.json();assert.equal(d.companyId,'receipt-test');assert.equal(d.receipts.length,0);assert.equal(d.recordedReceipt.id,recorded.sale.id);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal((await call('/api/workspace/customer-payments?companyId=other',true)).status,400);assert.equal((await call(undefined,true,'POST')).status,405);
 assert.deepEqual(app.journal.snapshot(),before);assert.deepEqual(app.treasury.snapshot(),financial);
});
test('payments route and templates distinguish fresh agency receipts, prior sale, errors and loading',async()=>{
 const customerPayments=await customerPaymentView({companyId:'fresh'}),state={customerPayments,localDemo:{active:true},route:parseRoute('#payments'),data:{agents:[],catalog:[],tasks:[],activity:[]}};
 assert.equal(state.route.page,'payments');const html=renderWorkspace(state);assert.ok(html.includes('<h1>Customer payments</h1>'));assert.ok(html.includes('No customer payments received'));assert.ok(html.includes('0.1 USDC'));assert.ok(html.includes('Received · recorded'));assert.ok(html.includes('not income for this demo session'));assert.ok(html.includes('View settlement transaction'));assert.ok(html.includes('View sale ledger record'));assert.ok(html.includes('href="#payments" aria-current="page"'));
 const summary=renderPaymentSummary(state);assert.ok(summary.includes('No customer payments received by this company yet'));assert.ok(!summary.includes('0.1 USDC'));
 assert.ok(renderCustomerPayments({}).includes('Loading payment receipts'));const error=renderCustomerPayments({customerPaymentsError:'<img src=x onerror=alert(1)>'});assert.ok(error.includes('could not be loaded'));assert.ok(!error.includes('<img'));assert.ok(!error.includes('No customer payments received'));
 const unsafe=renderCustomerPayments({customerPayments:{receipts:[{...paymentReceipt(recorded),id:'<script>bad</script>',orderId:'<img>',serviceName:'<svg>'}]}});assert.ok(!unsafe.includes('<script>'));assert.ok(!unsafe.includes('<img>'));assert.ok(!unsafe.includes('<svg>'));
});


test('configured company payments come from its durable sale store and refresh never mutates the receipt',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'company-payment-')),file=path.join(dir,'sales.json');
 const app=await createApp({directory:path.join(dir,'app'),companyId:'configured-company',configPath:'',fundedLoopFile:file});
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 const settlement=JSON.parse(await readFile(new URL('../../artifacts/mainnet-proof/live-checkout-settlement.json',import.meta.url),'utf8'));
 await app.fundedLoop.register(settlement);const before=await readFile(file,'utf8');
 for(let i=0;i<2;i++){
  const response=await app.web.handle(new Request('http://localhost/api/workspace/customer-payments'),{localOwner:true});assert.equal(response.status,200);const d=await response.json();assert.equal(d.receipts.length,1);assert.equal(d.receipts[0].id,recorded.sale.id);assert.equal(d.recordedReceipt,null);assert.equal(d.companyId,'configured-company');
 }
 assert.equal(await readFile(file,'utf8'),before);
});
