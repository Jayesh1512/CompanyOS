import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const main=process.env.WALKTHROUGH_URL??'http://127.0.0.1:4173';
const recovery=process.env.WALKTHROUGH_RECOVERY_URL??'http://127.0.0.1:4188';
const out=path.resolve(process.env.WALKTHROUGH_OUTPUT??'artifacts/companyos-walkthrough');
await mkdir(out,{recursive:true});
const run=await fetch(recovery+'/api/workspace/recovery').then(r=>{if(!r.ok)throw Error('Recorded recovery workspace is unavailable');return r.json();});
assert.equal(run.scenario?.state,'completed','This recording inspects an existing completed live run; it never starts paid work.');
assert.equal(run.scenario?.definitionId,'missing-address');
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,recordVideo:{dir:out,size:{width:1920,height:1080}}});
const page=await context.newPage(),video=page.video(),scenes=[],errors=[],start=Date.now();let demo;
page.on('pageerror',e=>errors.push(e.message));
const pause=ms=>page.waitForTimeout(ms);
async function mark(id,title){scenes.push({id,title,atSeconds:Number(((Date.now()-start)/1000).toFixed(2)),url:page.url()});console.log(JSON.stringify({recording:true,scene:id,title}));}
async function scroll(locator,position='center'){await page.locator(locator).first().evaluate((el,p)=>el.scrollIntoView({behavior:'smooth',block:p}),position);await pause(1200);}
async function route(url,heading){await page.goto(url);if(heading)await page.getByRole('heading',{name:heading,exact:true}).waitFor();await page.evaluate(()=>window.scrollTo(0,0));await pause(1000);}
try{
 await route(main+'/#setup/org','Set up your organization');await mark('01','Create a customer-care agency');await pause(3000);
 await page.getByRole('button',{name:'Start demo',exact:true}).click();await page.waitForURL(u=>u.origin!==main&&u.hash==='#setup/org');demo=new URL(page.url()).origin;await page.getByLabel('Company name',{exact:true}).waitFor();assert.match(await page.title(),/^CompanyOs/);await page.getByText('CompanyOs',{exact:true}).waitFor();await pause(6500);
 await scroll('#company-purpose');await pause(5000);await scroll('#company-objective');await pause(6000);
 await page.getByRole('button',{name:'Save company & review agents',exact:true}).click();await page.getByRole('heading',{name:'Your configured agent team',exact:true}).waitFor();await mark('02','Review the team and company knowledge');await pause(6000);
 const policy=page.locator('.configured-agent').filter({has:page.getByRole('heading',{name:'Harbor Mutual Policy Guide',exact:true})});await policy.scrollIntoViewIfNeeded();await pause(3500);await policy.locator('summary').click();await pause(6000);
 await page.getByRole('link',{name:'Continue to company brain',exact:true}).click();await page.getByRole('heading',{name:'Add the company’s knowledge',exact:true}).waitFor();await page.evaluate(()=>window.scrollTo(0,0));await pause(6500);
 await page.getByRole('link',{name:'Continue to boundaries',exact:true}).click();await page.getByRole('heading',{name:'Review operating limits',exact:true}).waitFor();await pause(5000);await page.getByRole('button',{name:'Save boundaries & review',exact:true}).click();await page.waitForURL('**/#setup/review');await pause(4500);
 await page.getByRole('link',{name:'Open agency marketplace',exact:true}).click();await page.getByRole('heading',{name:'Marketplace',exact:true}).waitFor();await page.evaluate(()=>window.scrollTo(0,0));await mark('03','Explore the agency marketplace');assert.equal(await page.locator('.care-listing').count(),2);await pause(9000);
 await page.locator('.care-listing').filter({has:page.getByRole('heading',{name:'Harbor Mutual Policy Guide',exact:true})}).getByRole('link',{name:'Chat with agent',exact:true}).click();await page.getByRole('button',{name:'Start conversation',exact:true}).waitFor();await pause(4500);await page.getByRole('button',{name:'Start conversation',exact:true}).click();await page.getByLabel('Your message',{exact:true}).waitFor();await pause(2500);
 await mark('04','Answer a customer question');await page.getByLabel('Your message',{exact:true}).pressSequentially('What is the auto collision deductible?',{delay:65});await pause(1500);await page.getByRole('button',{name:'Send message',exact:true}).click();await page.locator('.care-message.assistant').filter({hasText:'500 demo dollars'}).waitFor();await scroll('.care-message.assistant');await pause(9500);assert.ok(await page.locator('.care-citation').count());
 await route(demo+'/#payments','Customer payments');await mark('05','Inspect received payment receipts');await pause(6000);await scroll('.recorded-customer-payment','start');await pause(11000);
 const payment=await page.evaluate(async()=>await(await fetch('/api/workspace/customer-payments')).json());assert.equal(payment.receipts.length,0);assert.equal(payment.recordedReceipt.amount.amount,'100000');
 await route(recovery+'/recovery.html','Watch a company repair its process');await mark('06','Inspect a recorded live recovery');await pause(7000);
 const first=page.locator('.recovery-run').filter({has:page.getByRole('heading',{name:'Support · first attempt',exact:true})});await first.scrollIntoViewIfNeeded();await pause(7000);await first.locator('summary').click();await pause(8500);await first.locator('summary').click();
 const backlog=page.locator('.recovery-run').filter({has:page.getByRole('heading',{name:'Company backlog',exact:true})});await backlog.scrollIntoViewIfNeeded();await pause(7000);
 const curator=page.locator('.recovery-run').filter({has:page.getByRole('heading',{name:'Knowledge curator',exact:true})});await curator.scrollIntoViewIfNeeded();await pause(6500);
 const developer=page.locator('.recovery-run').filter({has:page.getByRole('heading',{name:'Template developer',exact:true})});await developer.scrollIntoViewIfNeeded();await pause(6500);
 await page.getByRole('link',{name:'Company knowledge',exact:true}).click();await page.getByRole('heading',{name:'Company knowledge',exact:true}).waitFor();await pause(5000);await page.getByRole('link',{name:'Fictional claims intake runbook',exact:true}).click();await page.getByLabel('Company information',{exact:true}).waitFor();await scroll('#knowledge-body');await pause(9500);
 await route(recovery+'/recovery.html','Watch a company repair its process');const retry=page.locator('.recovery-run').filter({has:page.getByRole('heading',{name:'Support · retry',exact:true})});await retry.scrollIntoViewIfNeeded();await mark('07','The same request now succeeds');await retry.locator('summary').click();await pause(9500);await retry.locator('summary').click();await scroll('.recovery-result','start');await pause(9500);
 const facts=await fetch(demo+'/api/workspace/local-demo').then(r=>r.json());assert.equal(facts.financialVersion,0);assert.equal(facts.providerOperations,0);assert.deepEqual(errors,[]);
 await writeFile(path.join(out,'capture-manifest.json'),JSON.stringify({at:new Date().toISOString(),kind:'actual product walkthrough screen capture',product:'CompanyOs',viewport:{width:1920,height:1080},audio:'silent; narration script supplied separately',demoCompanyId:facts.companyId,scenes,pageErrors:errors,recovery:{source:'existing completed live run',scenario:run.scenario.definitionId,question:run.scenario.question,beforeEscalated:run.scenario.before.escalate,afterEscalated:run.scenario.after.escalate},payment:{source:'prior recorded mainnet sale',saleId:payment.recordedReceipt.id,freshCompanyReceipts:0},newPaymentSubmitted:false,newModelCalls:0,localProviderOperations:facts.providerOperations},null,2)+'\n');
}finally{
 await context.close();await video.saveAs(path.join(out,'product-walkthrough-raw.webm'));await video.delete();await browser.close();console.log(JSON.stringify({recording:false,video:path.join(out,'product-walkthrough-raw.webm'),seconds:(Date.now()-start)/1000}));
}
