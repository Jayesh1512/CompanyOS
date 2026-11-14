import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
export function verifyBusinessRecords(records) {
  if(!Array.isArray(records)||!records.length)throw Error('BUSINESS_LEDGER_REQUIRED');
  let previous='0'.repeat(64);
  for(const [i,r] of records.entries()){
    if(r.sequence!==i+1||r.previousHash!==previous||sha(r.payload)!==r.payloadHash)throw Error('BUSINESS_LEDGER_TAMPERED');
    const hash=sha(['companyos-business-record:v1',String(r.sequence),r.kind,r.actorId,r.orderId,r.payloadHash,r.previousHash].join('\n'));
    if(r.hash!==hash)throw Error('BUSINESS_LEDGER_TAMPERED');previous=hash;
  }
  return {sequence:records.length,hash:previous};
}
