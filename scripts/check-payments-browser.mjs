import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../src/app.mjs';
import {startServer} from '../server.mjs';

// Actual owner UI + native JBrain, with the existing historical mainnet receipt.
// No fake payment, provider call, checkout, settlement or public transaction.
const dir=await mkdtemp(path.join(tmpdir(),'payment-browser-')),out=path.resolve('artifacts/customer-payments-ui');
await mkdir(out,{recursive:true});
const app=await createApp({directory:path.join(dir,'company'),companyId:'payments-browser',configPath:'',fundedLoopFile:'',ownerToken:'',ownerTokenFile:''});
const main=await startServer({app,port:0,demoDirectory:path.join(dir,'demo')});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(main.url+'/#payments');await page.getByRole('heading',{name:'Customer payments',exact:true}).waitFor();assert.match(await page.title(),/^CompanyOs/);await page.getByText('CompanyOs',{exact:true}).waitFor();
 await page.getByRole('heading',{name:'No customer payments received',exact:true}).waitFor();await page.getByRole('heading',{name:'Recorded mainnet payment',exact:true}).waitFor();assert.equal(await page.getByText('0.1 USDC',{exact:true}).count(),1);checks.push('prior mainnet sale is displayed separately from empty current company receipts');
 const historical=await page.evaluate(async()=>await(await fetch('/api/workspace/customer-payments')).json());assert.equal(historical.receipts.length,0);assert.equal(historical.recordedReceipt.amount.amount,'100000');assert.ok(historical.recordedReceipt.depositTxs.length);assert.ok(historical.recordedReceipt.ledgerTx);
 const links=await page.locator('.customer-payment-links a').evaluateAll(as=>as.map(a=>a.href));assert.ok(links.every(h=>h.startsWith('https://nearblocks.io/txns/')));checks.push('real saved settlement and ledger transaction references are linked');
 await page.getByRole('button',{name:'Start demo',exact:true}).click();await page.waitForURL(u=>u.origin!==main.url&&u.hash==='#setup/org');const demo=new URL(page.url()).origin;
 await page.goto(demo+'/#marketplace');await page.getByRole('heading',{name:'Marketplace',exact:true}).waitFor();assert.equal(await page.locator('.care-listing').count(),2);await page.getByRole('link',{name:'View payment receipts',exact:true}).click();await page.getByRole('heading',{name:'Customer payments',exact:true}).waitFor();await page.getByRole('heading',{name:'Recorded mainnet payment',exact:true}).waitFor();checks.push('fresh agency marketplace exposes the payment receipt page');
 const before=await page.evaluate(async()=>await(await fetch('/api/workspace/customer-payments')).json());assert.equal(before.receipts.length,0);assert.match(before.companyId,/^real-local-demo-/);
 await page.getByRole('button',{name:'Refresh receipts',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('main[aria-busy=true]'));const after=await page.evaluate(async()=>await(await fetch('/api/workspace/customer-payments')).json());assert.deepEqual(after,before);checks.push('refresh preserves payment records and does not turn historical evidence into demo revenue');
 const widths=[];for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===1440?1000:844});if(width===390)await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);
  const size=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.equal(size.width,size.scrollWidth);widths.push(size);await page.screenshot({path:path.join(out,`payments-${width}.png`),fullPage:true});
 }
 assert.deepEqual(errors,[]);const facts=await page.evaluate(async()=>await(await fetch('/api/workspace/local-demo')).json());assert.equal(facts.providerOperations,0);assert.equal(facts.financialVersion,0);
 const proof={at:new Date().toISOString(),checks,widths,pageErrors:errors,currentCompanyReceiptCount:after.receipts.length,recordedSaleId:after.recordedReceipt.id,recordedAmount:after.recordedReceipt.amount,providerOperations:facts.providerOperations,financialVersion:facts.financialVersion,newPaymentSubmitted:false};await writeFile(path.join(out,'browser-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}finally{await browser?.close();await main.close();await rm(dir,{recursive:true,force:true});}
