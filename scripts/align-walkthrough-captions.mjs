import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),out=path.join(root,'artifacts/companyos-walkthrough');
const digest=x=>createHash('sha256').update(x).digest('hex');
const job=JSON.parse(await readFile(path.join(out,'elevenlabs-job.json'),'utf8'));
const audio=await readFile(path.join(out,'narration-elevenlabs.mp3')),text=job.scenes.map(s=>s.text).join('\n\n');
const id=digest(Buffer.concat([audio,Buffer.from(text)])),privateDir=path.join(root,'.runtime/elevenlabs-captions');await mkdir(privateDir,{recursive:true,mode:0o700});
const cache=path.join(privateDir,id+'.json');let state;
try{state=JSON.parse(await readFile(cache,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
async function save(value){state=value;await writeFile(cache,JSON.stringify(value,null,2)+'\n',{mode:0o600});}
const reused=!!state;
if(state&&state.status!=='completed')throw Error('The original alignment request is held. Check its provider outcome before submitting another request.');
if(!state){
 try{loadEnvFile(path.join(root,'.env.elevenlabs'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const key=process.env.ELEVENLABS_API_KEY;if(!key)throw Error('Save ELEVENLABS_API_KEY in the private .env.elevenlabs file.');
 const body=new FormData();body.set('file',new Blob([audio],{type:'audio/mpeg'}),'narration.mp3');body.set('text',text);
 await save({status:'dispatching',audioHash:digest(audio),textHash:digest(text),at:new Date().toISOString()});
 let response;try{response=await fetch('https://api.elevenlabs.io/v1/forced-alignment',{method:'POST',headers:{'xi-api-key':key},body,redirect:'error',signal:AbortSignal.timeout(120000)});}
 catch{await save({...state,status:'unknown'});throw Error('Alignment response unavailable; the original request is held without automatic retry.');}
 if(!response.ok){await save({...state,status:'http_'+response.status});throw Error(`ElevenLabs alignment returned HTTP ${response.status}. No automatic retry was sent.`);}
 const result=await response.json();await save({...state,status:'completed',requestId:response.headers.get('request-id'),result});
}
const words=state.result.words?.filter(w=>w.text.trim()).map(w=>({...w,text:w.text.trim()})),normalize=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
if(!Array.isArray(words)||normalize(words.map(w=>w.text).join(' '))!==normalize(text))throw Error('Alignment transcript differs from the narration.');
let end=0;
for(const w of words){if(!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<end-0.03||w.end<w.start)throw Error('Alignment timings are invalid.');end=w.end;}
const captions=[];
for(let i=0;i<words.length;i++){
 const w=words[i];let label=w.text,last=w;
 if(label==='Company'&&words[i+1]?.text==='O'&&/^S[.,]?$/.test(words[i+2]?.text??'')){last=words[i+2];label='CompanyOs'+last.text.slice(1);i+=2;}
 captions.push({text:(captions.length?' ':'')+label,startMs:Math.round(w.start*1000),endMs:Math.round(last.end*1000),timestampMs:null,confidence:null});
}
await writeFile(path.join(out,'captions-words.json'),JSON.stringify(captions,null,2)+'\n');
await writeFile(path.join(out,'caption-alignment.json'),JSON.stringify({provider:'ElevenLabs forced alignment',audioHash:digest(audio),transcriptHash:digest(text),wordCount:words.length,loss:state.result.loss,source:'narration-elevenlabs.mp3',timing:'relative to narration audio; add opening offset at export',apiCalls:1},null,2)+'\n');
console.log(JSON.stringify({alignedWords:words.length,lastWordEndSeconds:end,cached:reused,output:'artifacts/companyos-walkthrough/captions-words.json'}));
