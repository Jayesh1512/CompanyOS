import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const source='artifacts/recovery-missing-address/live-run.json';
const bytes=await readFile(source),j=JSON.parse(bytes),r=j.run;
const anchor=JSON.parse(await readFile('docs/evidence/recovery-anchor.json','utf8'));
const sha=createHash('sha256').update(bytes).digest('hex');
if(sha!==anchor.artifactSha256)throw Error('RECOVERY_SOURCE_CHANGED');
const lines=['SECOND RECOVERY: missing-address',`Source: ${source}`,`Source SHA-256: ${sha}`,
 `Original recorded time: ${j.recordedAt}`,`Scenario result: ${r.scenario.state}`,
 'The original recovery ran off-chain: real Cloud inference, native JBrain and local fixed evaluation.',
 'The original run did not submit a blockchain transaction; the retained anchor metadata is retrospective.',
 'An anchor proves the committed bytes; it does not independently reverify the historical model responses.', '',
 'CHAIN EVIDENCE (testnet, collected after the original run)'];
if(anchor.transactionHashesWithheld)lines.push('Transaction hashes and explorer links are withheld; committed files cannot reproduce transaction verification.');
for(const [name,tx] of Object.entries({creation:anchor.creation,deployment:anchor.deployment,anchor:anchor.append}))lines.push(`${name}: ${tx.txHash??'[transaction hash removed]'}`,`  ${tx.nearblocks??'[transaction link removed]'}`,`  signer=${tx.signerId} receiver=${tx.receiverId}`);
lines.push('','CHRONOLOGICAL EXECUTION');
for(const e of r.events)lines.push(`${e.sequence}. ${e.at} ${e.type}`,`   ${JSON.stringify(e.data)}`);
lines.push('','ORIGINAL MODEL CALLS (provider IDs and original-process verification scope)');
for(const call of r.runs)lines.push(`${call.role}: ${call.state}; actor=${call.actorId}`,
 `  providerRequestId=${call.providerRequestId}; inferenceId=${call.inferenceId}`,
 `  created=${call.createdAt}; completed=${call.completedAt}`,
 `  verification=${JSON.stringify(call.proof)}`,
 `  bill=${call.billing?.actualCostNanoUsd} nanoUSD; reference=${call.billing?.reference}`,
 `  documents=${JSON.stringify(call.documents)}`,`  output=${JSON.stringify(call.value)}`);
lines.push('','FIXED EVALUATIONS',JSON.stringify(r.evaluations,null,2),'','FINAL SCENARIO',JSON.stringify(r.scenario,null,2),
 '','ACCOUNTING',JSON.stringify(r.financial,null,2),'Total recorded cost: $0.00776905; pending reservations: 0.',
 'Historical evaluations say local-fallback because OutLayer was unconfigured. Current recovery uses local-fixed-evaluator directly.');
await writeFile('docs/evidence/recovery-missing-address.txt',lines.join('\n')+'\n');
console.log('Wrote the complete retained recovery timeline and retrospective chain references.');
