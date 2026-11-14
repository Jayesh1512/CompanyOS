import {ledgerCompanyHash,ledgerRecordHash} from '../rules/onchain-ledger.mjs';
import {hash} from '../rules/config.mjs';

// Same commitment format as the Agent API writer, with the caller's own account.
export function ledgerBatch(companyId,head,events,at=new Date().toISOString()) {
  const companyHash=ledgerCompanyHash(companyId);
  if(head.companyHash!==companyHash)throw Error('LEDGER_COMPANY_MISMATCH');
  if(!Array.isArray(events)||events.length<1||events.length>50)throw Error('LEDGER_EVENTS_REQUIRED');
  let previousHash=head.hash;
  const records=events.map((event,i)=>{
    const r={sequence:head.sequence+i+1,type:event.type,at,
      actorHash:hash({domain:'company-ledger:actor:v1',companyHash,actor:event.data?.actorId??null}),
      payloadHash:hash({domain:'company-ledger:payload:v1',companyHash,data:event.data??null}),previousHash};
    r.hash=ledgerRecordHash(companyHash,r);previousHash=r.hash;return r;
  });
  return {company_hash:companyHash,expected_sequence:head.sequence,expected_hash:head.hash,records};
}
