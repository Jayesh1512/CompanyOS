import {readFile,writeFile} from 'node:fs/promises';
import {KeyPair,actions} from 'near-api-js';
import {createHash} from 'node:crypto';
import {createRun,credential,createChild,account,finalReceipt,near,provider,call,view,RPC,DIRECTORY} from './lib/testnet.mjs';
const run=await createRun('business-setup'),parent=await credential('parent');
const company=await createChild(run,parent,'business',near(2));
const vendor=await createChild(run,parent,'notary',near(2));
const wasm=await readFile('artifacts/audit-business/audit-business.wasm'),deployments={};
for(const [name,{cred}] of Object.entries({company,vendor}))deployments[name]=await run.once('deploy:'+name,async()=>finalReceipt(await account(cred).signAndSendTransaction({receiverId:cred.account_id,
 actions:[actions.deployContract(wasm),actions.functionCall('new',{},100_000_000_000_000n,0n)],waitUntil:'FINAL'})));
const upgrades={};
if(process.argv.includes('--upgrade'))for(const [name,{cred}] of Object.entries({company,vendor}))upgrades[name]=await run.once('upgrade:'+name+':'+createHash('sha256').update(wasm).digest('hex'),async()=>finalReceipt(await account(cred).signAndSendTransaction({receiverId:cred.account_id,actions:[actions.deployContract(wasm)],waitUntil:'FINAL'})));
let customer;
try{customer=await credential('customer');}catch(e){if(e.code!=='ENOENT')throw e;const k=KeyPair.fromRandom('ed25519');customer={account_id:'companyos-customer-'+Date.now().toString(36)+'.testnet',public_key:k.getPublicKey().toString(),private_key:k.toString()};await writeFile(DIRECTORY+'/customer.json',JSON.stringify(customer)+'\n',{mode:0o600,flag:'wx'});}
const faucet=await run.once('customer-faucet',async()=>{
 const r=await fetch('https://helper.testnet.near.org/account',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({newAccountId:customer.account_id,newAccountPublicKey:customer.public_key}),signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('CUSTOMER_FAUCET_FAILED');const tx=await r.json();
 return finalReceipt(await provider.viewTransactionStatus({txHash:tx.transaction.hash,accountId:tx.transaction.signer_id,waitUntil:'FINAL'}));
});
const manager=await credential('manager');
const grantReceipt=await run.once('grant',()=>call(company.cred,company.cred.account_id,'issue_grant',{agent_id:manager.account_id,vendor_id:vendor.cred.account_id,
 max_spend:near(1).toString(),expires_at_ns:(BigInt(Date.now()+24*3600000)*1_000_000n).toString()}));
const grant=await view(company.cred.account_id,'get_grant');
await writeFile('docs/evidence/business-setup.json',JSON.stringify({network:'testnet',rpc:RPC,companyId:company.cred.account_id,vendorId:vendor.cred.account_id,
 customerId:customer.account_id,agentId:manager.account_id,companyCreation:company.receipt,vendorCreation:vendor.receipt,deployments,upgrades,customerFaucet:faucet,grantReceipt,grant,
 scope:'All accounts are maintainer-controlled. Customer test tokens came from the real testnet faucet. No mainnet funds or independent customer revenue.'},null,2)+'\n');
console.log('Testnet business, real paid notary, funded customer and bounded agent grant are ready.');
