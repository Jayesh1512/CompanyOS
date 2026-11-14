import {readFile} from 'node:fs/promises';
import {saleFromSettlement} from './funded-loop.mjs';

const USDC='nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
const reference=value=>typeof value==='string'&&value.length<=200?value:null;
// Presentation of saved receipts only. This path never submits or reconciles a payment.
// Private customer identities, deposit addresses, run outputs and credentials stay private.
export function paymentReceipt(entry){
 const sale=entry?.sale;
 if(!sale||!reference(sale.id)||sale.asset!==USDC||typeof sale.priceAtomic!=='string'||['pending','failed','unknown'].includes(sale.status??entry.status)||!/^\d{1,30}$/.test(sale.priceAtomic??'')||BigInt(sale.priceAtomic)<=0n)return null;
 const depositTxs=(Array.isArray(sale.depositTxs)?sale.depositTxs:[]).filter(tx=>typeof tx==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(tx));
 const ledgerTx=typeof sale.saleLedgerTx==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(sale.saleLedgerTx)?sale.saleLedgerTx:null;
 if(!(depositTxs.length&&ledgerTx)&&!(reference(sale.depositCorrelationId)&&sale.receivedInto==='agent-wallet (confidential Intents balance)'))return null;
 return {id:sale.id,status:'received',amount:{amount:sale.priceAtomic,decimals:6,asset:'USDC',network:'NEAR mainnet'},receivedAt:reference(sale.settledAt),depositTxs,ledgerTx,correlationId:reference(sale.depositCorrelationId),assurance:reference(sale.assurance),serviceName:reference(sale.serviceName),orderId:reference(sale.orderId)};
}
async function recordedReceipt(){
 try{
  const [entry,settlement]=await Promise.all(['funded-loop.json','live-checkout-settlement.json'].map(async file=>JSON.parse(await readFile(new URL('../../artifacts/mainnet-proof/'+file,import.meta.url),'utf8'))));
  const confirmed=saleFromSettlement(settlement);
  if(entry.sale?.id!==confirmed.id||entry.sale?.priceAtomic!==confirmed.priceAtomic||entry.sale?.asset!==confirmed.asset||entry.sale?.saleLedgerTx!==confirmed.saleLedgerTx||entry.sale?.depositTxs?.[0]!==confirmed.depositTxs[0])return null;
  return paymentReceipt(entry);
 }catch{return null;}
}
export async function customerPaymentView({fundedLoop,companyId,localDemo=false}){
 const state=!localDemo&&fundedLoop?await fundedLoop.view():{sales:{}};
 const receipts=Object.values(state.sales??{}).map(paymentReceipt).filter(Boolean).sort((a,b)=>(b.receivedAt??'').localeCompare(a.receivedAt??''));
 const recorded=await recordedReceipt();
 return {companyId,receipts,recordedReceipt:recorded&&!receipts.some(r=>r.id===recorded.id)?recorded:null,verification:'saved-receipts; not reverified on page load',canReceivePayments:!localDemo&&!!fundedLoop};
}
