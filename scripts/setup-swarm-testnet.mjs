import {readFile,writeFile} from 'node:fs/promises';
import {actions} from 'near-api-js';
import {createRun,credential,createChild,account,call,finalReceipt,near,RPC} from './lib/testnet.mjs';
import {ledgerCompanyHash} from '../src/rules/onchain-ledger.mjs';
import {hash} from '../src/rules/config.mjs';

const run=await createRun('swarm-setup'),parent=await credential('parent'),companyId='near-ai-recovery';
const ledger=await createChild(run,parent,'swarm',near(2));
const companyHash=ledgerCompanyHash(companyId),wasm=await readFile('artifacts/swarm-ledger/company-ledger.wasm');
const deployment=await run.once('deploy',async()=>finalReceipt(await account(ledger.cred).signAndSendTransaction({receiverId:ledger.cred.account_id,
  actions:[actions.deployContract(wasm),actions.functionCall('new',{company_hash:companyHash,writer_id:null},100_000_000_000_000n,0n)],waitUntil:'FINAL'})));
const agents={};
for(const role of ['manager','support','backlog','knowledge_curator','template_developer']){
  const {cred,receipt}=await createChild(run,parent,role,10n**23n);
  const actorHash=hash({domain:'company-ledger:actor:v1',companyHash,actor:cred.account_id});
  const registration=await run.once('register:'+role,()=>call(ledger.cred,ledger.cred.account_id,'set_agent_writer',{account_id:cred.account_id,actor_hash:actorHash}));
  agents[role]={accountId:cred.account_id,keyFile:`.runtime/hackathon-testnet/${role}.json`,actorHash,creation:receipt,registration};
}
await writeFile('docs/evidence/swarm-accounts.json',JSON.stringify({network:'testnet',rpc:RPC,companyId,parentId:parent.account_id,contractId:ledger.cred.account_id,
  creation:ledger.receipt,deployment,agents},null,2)+'\n');
console.log('Created and registered five independently keyed agent subaccounts on testnet.');
