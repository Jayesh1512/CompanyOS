import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyBusinessRecords} from '../../src/business/evidence.mjs';

const proof=JSON.parse(await readFile('docs/evidence/business-cycle.json','utf8'));
test('the real retained business ledger verifies and rejects payload, signer, order, sequence and predecessor tampering',()=>{
 assert.equal(verifyBusinessRecords(proof.businessRecords).sequence,3);
 for(const change of [r=>r.payload+='tampered',r=>r.actorId='attacker.testnet',r=>r.orderId='different-order',r=>r.sequence++,r=>r.previousHash='f'.repeat(64),r=>r.payloadHash='f'.repeat(64)]){
  const records=structuredClone(proof.businessRecords);change(records[1]);assert.throws(()=>verifyBusinessRecords(records),/BUSINESS_LEDGER_TAMPERED/);
 }
 assert.throws(()=>verifyBusinessRecords([...proof.businessRecords].reverse()),/BUSINESS_LEDGER_TAMPERED/);
});
