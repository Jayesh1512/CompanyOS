import {readFile,writeFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile('docs/evidence/swarm-accounts.json','utf8'));
const proof=JSON.parse(await readFile('docs/evidence/swarm-live-run.json','utf8'));
if(proof.run.scenario.state!=='completed'||proof.commits.length!==6)throw Error('SWARM_RUN_INCOMPLETE');
const lines=[...((manifest.transactionHashesWithheld||proof.transactionHashesWithheld)?['Transaction references are withheld in the published records; transaction verification requires original private receipts.']:[]),'LIVE RECOVERY SWARM — NEAR testnet',`Company ledger: ${manifest.contractId}`,
 `Deployment: ${manifest.deployment.txHash??'[transaction hash removed]'}`,manifest.deployment.nearblocks??'[transaction link removed]',
 'Five independently keyed subaccounts; six real NEAR AI Cloud calls; six self-signed commitments.',
 'Cloud is funded from the existing owner-prepaid key. Blockchain writes and gas use testnet tokens.',
 'MCP: @nearai/near-mcp 0.0.35 plus @modelcontextprotocol/sdk 1.28.0. CompanyOS adds a public read tool using the current FastNEAR RPC.',
 'Original upstream read failures, the rejected gas prepayment, and resumes remain in the retained event history.',
 'Only chain publication/readback was resumed; no accepted model request was sent again.',''];
for(const [role,a] of Object.entries(manifest.agents))lines.push(`${role}: ${a.accountId}`,`  create ${a.creation.txHash??'[transaction hash removed]'}`,`  ${a.creation.nearblocks??'[transaction link removed]'}`,`  bind actor ${a.actorHash}`,`  ${a.registration.nearblocks??'[transaction link removed]'}`);
lines.push('','WORK IN EXECUTION ORDER');
for(const run of proof.run.runs){
 const c=proof.commits.find(c=>c.id===run.id);
 lines.push(`${run.role}: ${run.state}`,`  local profile ${run.actorId}; on-chain signer ${c.signerId}`,
  `  Cloud request ${run.providerRequestId}; inference ${run.inferenceId}`,
  `  Original SDK acceptance ${run.proof.status}, ${run.proof.signatureKind}, ${run.proof.acceptanceScope}`,
  `  Output ${JSON.stringify(run.value)}`,`  Exact output commitment ${c.events[0].data.outputHash}`,
  `  Transaction ${c.txHash??'[transaction hash removed]'}`,`  ${c.nearblocks??'[transaction link removed]'}`,`  Record ${c.args.records[0].sequence}: ${c.args.records[0].hash}`,
  `  Actual bill ${run.billing.actualCostNanoUsd} nanoUSD`);
}
lines.push('',`Total actual Cloud cost: ${proof.run.financial.actualNanoUsd} nanoUSD ($${Number(proof.run.financial.actualNanoUsd)/1e9}).`,
 `Pending reservation: ${proof.run.financial.reservedNanoUsd} nanoUSD.`,`Retained MCP exchanges: ${proof.mcpReads.length}.`,
 'Historical Cloud plaintext is not reverified by the public-chain verifier. The verifier checks FINAL signers, exact append arguments and all retained output hashes.');
await writeFile('docs/evidence/swarm-execution.txt',lines.join('\n')+'\n');
