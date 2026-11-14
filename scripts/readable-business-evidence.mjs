import {readFile,writeFile} from 'node:fs/promises';
const p=JSON.parse(await readFile('docs/evidence/business-cycle.json','utf8'));
if(p.finalOrder.state!=='completed')throw Error('BUSINESS_CYCLE_INCOMPLETE');
const lines=[...((p.transactionHashesWithheld)?['Transaction references are withheld in the published record; transaction verification requires the original private receipt.']:[]),'LIVE PAID AUDIT CYCLE — NEAR testnet',p.scope,'',
 `Company: ${p.setup.companyId}`,`Customer: ${p.setup.customerId}`,`Agent: ${p.setup.agentId}`,`Notary: ${p.setup.vendorId}`,
 `Task: SHA-256 of ${p.source} = ${p.taskHash}`,'',
 '1. Revenue received: exactly 2 test NEAR for audit-cycle-1.',`   ${p.sale.txHash??'[transaction hash removed]'}`,`   ${p.sale.nearblocks??'[transaction link removed]'}`,
 '2. The real NEAR AI Cloud agent chose the purchase. Original SDK E2EE response verification passed.',
 `   Provider request: ${p.decision.providerRequestId}`,`   Model: ${p.decision.model}`,
 `   Command: ${JSON.stringify(p.decision.command)}`,`   Decision hash: ${p.decision.decisionHash}`,
 '   The first separate decision attempt returned empty content and sent no vendor spend; see business-decision-failure.txt.',
 '3. The manager signed fulfill under the on-chain grant: exact agent, exact vendor, 1 test NEAR cap, one-day expiry.',
 `   Grant: ${p.setup.grant.id}`,`   Expiry (Unix nanoseconds): ${p.setup.grant.expiresAtNs}`,
 `   ${p.spend.txHash??'[transaction hash removed]'}`,`   ${p.spend.nearblocks??'[transaction link removed]'}`,
 '4. The business contract called the deployed notary with exactly 1 test NEAR. The notary stored and returned the exact digest.',
 `   Stored digest: ${p.notarization}`,`   Order state: ${p.finalOrder.state}`,`   Remaining grant allowance: ${p.grantAfter.remainingYocto} yoctoNEAR`,
 '5. On-chain hash-chain records (recomputed and compared against public RPC by verify-business-cycle.mjs):'];
for(const r of p.businessRecords)lines.push(`   ${r.sequence}. ${r.kind}: ${r.hash}`,`      actor=${r.actorId}; payload=${r.payload}`);
for(const r of p.vendorRecords)lines.push(`   Vendor ${r.sequence}. ${r.kind}: ${r.hash}`,`      payload=${r.payload}`);
lines.push('','Gross remainder before gas: 1 test NEAR. Contract deployment/storage and agent gas were separately owner-funded with test tokens.',
 'Cloud inference remains owner-prepaid; it is not paid by this native testnet sale. The first failed decision cost was not retained or reconciled.',
 'The customer and vendor are maintainer-controlled. This demonstrates a real testnet service cycle, not independent customer revenue, USD profit or a self-funded mainnet business.');
await writeFile('docs/evidence/business-execution.txt',lines.join('\n')+'\n');
