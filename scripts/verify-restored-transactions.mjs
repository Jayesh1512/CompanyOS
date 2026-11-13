import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const endpoints={mainnet:'https://archival-rpc.mainnet.fastnear.com',testnet:'https://rpc.testnet.fastnear.com'};
export async function verifyRestoredTransactions({network,write=true}={}){
 const index=JSON.parse(await readFile('docs/evidence/restored-transactions.json','utf8'));
 const entries=index.transactions.filter(e=>!network||e.network===network),results=[];
 for(const entry of entries){
  let result,error;
  for(let attempt=0;attempt<3;attempt++){
   try{
    const response=await fetch(endpoints[entry.network],{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tx',params:{tx_hash:entry.txHash,sender_account_id:entry.signerId,wait_until:'FINAL'}}),signal:AbortSignal.timeout(25000)});
    const body=await response.json();if(!response.ok||body.error)throw Error(JSON.stringify(body.error??{httpStatus:response.status}));
    result=body.result;error=null;break;
   }catch(e){error=String(e.message);if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}
  }
  const final=result?.final_execution_status==='FINAL',outcome=result?.status?.Failure?'failure':Object.hasOwn(result?.status??{},'SuccessValue')?'success':'unknown';
  const ok=final&&result.transaction.hash===entry.txHash&&result.transaction.signer_id===entry.signerId&&result.transaction.receiver_id===entry.receiverId&&outcome===entry.expectedOutcome;
  results.push({...entry,ok,finalExecutionStatus:result?.final_execution_status??null,actualOutcome:outcome,...(error?{error}:{}),rpcResponse:result??null});
  console.log(`${ok?'PASS':'FAIL'} ${entry.network} FINAL ${outcome} ${entry.txHash}\n  ${entry.nearblocks}`);
 }
 const report={checkedAt:new Date().toISOString(),readOnly:true,newTransactions:0,networkIO:true,transactions:results,passed:results.filter(r=>r.ok).length,total:results.length};
 if(write)await writeFile(`docs/evidence/${network?network+'-':''}transactions-rpc.json`,JSON.stringify(report,null,2)+'\n');
 console.log(`${report.passed}/${report.total} original transaction references verified. Expected historical failures are checked as failures, not promoted to success.`);
 return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const report=await verifyRestoredTransactions({network:process.argv.includes('--mainnet')?'mainnet':undefined});
 if(report.passed!==report.total)process.exitCode=1;
}
