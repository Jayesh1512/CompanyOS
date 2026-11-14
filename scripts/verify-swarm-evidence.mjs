import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {JsonRpcProvider} from 'near-api-js';
import {ledgerBatch} from '../src/onchain/direct-ledger.mjs';
import {fingerprint} from '../src/contracts.mjs';
import {createNearMcpReader} from '../src/onchain/near-mcp.mjs';

const manifest=JSON.parse(await readFile('docs/evidence/swarm-accounts.json','utf8'));
const proof=JSON.parse(await readFile('docs/evidence/swarm-live-run.json','utf8'));
if(manifest.transactionHashesWithheld||proof.transactionHashesWithheld)throw Error('TRANSACTION_HASHES_WITHHELD: original private receipts required for transaction verification');
const rpc=new JsonRpcProvider({url:'https://rpc.testnet.fastnear.com'}),lines=[];
const pass=s=>{lines.push('PASS '+s);console.log('PASS '+s);};
const reader=await createNearMcpReader({keyDirectory:'.runtime/mcp-empty'});
try{
 assert.equal(proof.run.scenario.state,'completed');assert.equal(proof.run.runs.length,6);
 assert.equal(proof.commits.length,6);pass('six original live recovery calls completed and each has an agent-signed commitment');
 const signers=new Set();
 for(const c of proof.commits){
  const role=c.events[0].data.role,identity=manifest.agents[role];assert.ok(identity);assert.equal(c.signerId,identity.accountId);
  const tx=await rpc.viewTransactionStatus({txHash:c.txHash,accountId:c.signerId,waitUntil:'FINAL'});
  assert.equal(tx.final_execution_status,'FINAL');assert.ok(Object.hasOwn(tx.status,'SuccessValue'));
  assert.ok(!tx.receipts_outcome.some(r=>r.outcome.status.Failure));
  assert.equal(tx.transaction.signer_id,identity.accountId);assert.equal(tx.transaction.receiver_id,manifest.contractId);
  const call=tx.transaction.actions[0].FunctionCall;assert.equal(call.method_name,'append');
  const args=JSON.parse(Buffer.from(call.args,'base64').toString());assert.deepEqual(args,c.args);
  const head={companyHash:args.company_hash,sequence:args.expected_sequence,hash:args.expected_hash};
  assert.deepEqual(args,ledgerBatch(manifest.companyId,head,c.events,args.records[0].at));
  assert.equal(args.records[0].actorHash,identity.actorHash);
  const run=proof.run.runs.find(r=>r.id===c.id);assert.ok(run);assert.equal(run.proof.status,'verified');
  assert.equal(c.events[0].data.outputHash,fingerprint(run.value));assert.equal(c.events[0].data.localActorId,run.actorId);
  signers.add(c.signerId);pass(`${role}: FINAL exact append by ${c.signerId}; ${c.txHash}\n  ${c.nearblocks}`);
 }
 assert.equal(signers.size,5);pass('all five recovery agents signed through distinct NEAR subaccounts');
 const head=await reader.view(manifest.contractId,'get_head'),records=await reader.view(manifest.contractId,'get_records',{from_sequence:1,limit:50});
 assert.ok(head.sequence>=6);assert.ok(records.length>=6);
 for(const c of proof.commits)assert.deepEqual(records[c.args.records[0].sequence-1],c.args.records[0]);
 assert.ok(proof.mcpReads.length>=18);pass('official NEAR MCP server readback matches all six stored records; original reads retained');
 lines.push('Scope: blockchain actions are testnet transactions. Original Cloud acceptance used the live SDK; this verifier rechecks retained model output hashes, not historical TEE plaintext.');
 await writeFile('docs/evidence/swarm-verification.txt',lines.join('\n')+'\n');
}finally{await reader.close();}
