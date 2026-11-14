import {readFile,writeFile,mkdir,rename,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {spawnSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const {values}=parseArgs({options:{plan:{type:'boolean'},voices:{type:'boolean'},'assemble-only':{type:'boolean'},job:{type:'string',default:'artifacts/companyos-walkthrough/elevenlabs-job.json'},output:{type:'string',default:'artifacts/companyos-walkthrough'}}});
const out=path.resolve(root,values.output),stateDir=path.join(root,'.runtime/elevenlabs-narration'),stateFile=path.join(stateDir,'state.json');
try{loadEnvFile(path.join(root,'.env.elevenlabs'));}catch(e){if(e.code!=='ENOENT')throw e;}
const fail=message=>{throw Error(message);};
const hash=x=>createHash('sha256').update(x).digest('hex');
async function exists(file){try{await access(file);return true;}catch{return false;}}
function command(bin,args){const r=spawnSync(bin,args,{encoding:'utf8',maxBuffer:1024*1024});if(r.error||r.status!==0)fail(`${bin} failed. Check that it is installed and the input audio is valid.`);return r.stdout;}
const duration=file=>Number(command('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file]).trim());
async function saveState(state){await mkdir(stateDir,{recursive:true,mode:0o700});await writeFile(stateFile+'.tmp',JSON.stringify(state,null,2)+'\n',{mode:0o600});await rename(stateFile+'.tmp',stateFile);}
async function main(){
 const job=JSON.parse(await readFile(path.resolve(root,values.job),'utf8'));
 if(!Array.isArray(job.scenes)||!job.scenes.length||job.scenes.some(s=>!/^\d{2}$/.test(s.id)||typeof s.text!=='string'||!s.text.trim()||!(s.endSeconds>s.startSeconds)))fail('Invalid narration job.');
 const voiceId=process.env.ELEVENLABS_VOICE_ID||job.voiceId;
 if(!/^[a-zA-Z0-9]{15,64}$/.test(voiceId))fail('Set a valid ELEVENLABS_VOICE_ID in .env.elevenlabs.');
 if(values.plan){console.log(JSON.stringify({provider:'ElevenLabs',voiceId,modelId:job.modelId,sceneCount:job.scenes.length,characters:job.scenes.reduce((n,s)=>n+s.text.length,0),credentialFile:'.env.elevenlabs',output:path.relative(root,path.join(out,'narration-elevenlabs.mp3')),apiCallsMade:0},null,2));return;}
 const key=process.env.ELEVENLABS_API_KEY;
 if(!values['assemble-only']&&!key)fail('Add ELEVENLABS_API_KEY to the ignored .env.elevenlabs file, then run this script again. Do not paste the key into chat.');
 if(values.voices){
  const response=await fetch('https://api.elevenlabs.io/v2/voices?page_size=100',{headers:{'xi-api-key':key},redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)fail(`Voice listing failed (HTTP ${response.status}). Check your key and its Voices read permission.`);
  const data=await response.json();console.log(JSON.stringify((data.voices??[]).map(v=>({id:v.voice_id,name:v.name,category:v.category})),null,2));return;
 }
 await mkdir(out,{recursive:true});await mkdir(path.join(out,'audio-scenes'),{recursive:true});
 let state;try{state=JSON.parse(await readFile(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={scenes:{}};}
 const clips=[];
 for(const scene of job.scenes){
  const body={text:scene.text,model_id:job.modelId,voice_settings:job.voiceSettings};
  const fingerprint=hash(JSON.stringify({voiceId,format:job.outputFormat,body})),file=path.join(out,'audio-scenes',`${scene.id}-${fingerprint.slice(0,12)}.mp3`),previous=state.scenes[fingerprint];
  if(previous?.status==='completed'&&await exists(file)){
   if(hash(await readFile(file))!==previous.audioHash)fail(`Scene ${scene.id} audio changed on disk. Inspect it before generating another paid request.`);
   clips.push({scene,file});console.log(`Scene ${scene.id}: using saved audio.`);continue;
  }
  if(values['assemble-only'])fail(`Scene ${scene.id} has no saved audio. Generate it first.`);
  if(previous)fail(`Scene ${scene.id} has an unresolved original request (${previous.status}). Inspect ElevenLabs history before deciding whether to regenerate; this script will not resend it automatically.`);
  state.scenes[fingerprint]={sceneId:scene.id,status:'dispatching',at:new Date().toISOString()};await saveState(state);
  let response;
  try{response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(job.outputFormat)}`,{method:'POST',headers:{'xi-api-key':key,'content-type':'application/json',accept:'audio/mpeg'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(120000)});}
  catch{state.scenes[fingerprint].status='unknown';await saveState(state);fail(`Scene ${scene.id}: no complete provider response. The original request is held; check ElevenLabs history before retrying.`);}
  if(!response.ok){state.scenes[fingerprint].status=`http_${response.status}`;await saveState(state);fail(`Scene ${scene.id}: ElevenLabs returned HTTP ${response.status}. Check key permissions, voice access and credits. No automatic retry was sent.`);}
  if(!(response.headers.get('content-type')??'').startsWith('audio/')){state.scenes[fingerprint].status='unexpected_response';await saveState(state);fail(`Scene ${scene.id}: expected audio from ElevenLabs. Original request held.`);}
  const audio=Buffer.from(await response.arrayBuffer());if(audio.length<100)fail(`Scene ${scene.id}: incomplete audio. Original request held.`);
  await writeFile(file,audio,{flag:'wx'});
  state.scenes[fingerprint]={...state.scenes[fingerprint],status:'completed',audioHash:hash(audio),requestId:response.headers.get('request-id')??null,characters:scene.text.length};await saveState(state);clips.push({scene,file});console.log(`Scene ${scene.id}: audio saved.`);
 }
 // Align each scene to the actual screen capture. No clipping or aggressive speed-up.
 const fitted=[],timeline=[];
 for(const {scene,file} of clips){
  const seconds=duration(file),slot=scene.endSeconds-scene.startSeconds,speed=Math.max(1,seconds/(slot-0.25));
  if(!Number.isFinite(seconds)||seconds<=0)fail(`Scene ${scene.id}: invalid audio duration.`);
  if(speed>1.2)fail(`Scene ${scene.id}: narration is ${seconds.toFixed(1)}s for a ${slot.toFixed(1)}s scene. Shorten that scene's text or extend the video, then generate only the revised scene. Saved audio is retained.`);
  const target=path.join(out,'audio-scenes',`${scene.id}-aligned.wav`);
  command('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',file,'-af',`atempo=${speed.toFixed(6)},apad,atrim=duration=${slot}`,'-ar','44100','-ac','1',target]);fitted.push(target);timeline.push({id:scene.id,startSeconds:scene.startSeconds,endSeconds:scene.endSeconds,originalDuration:seconds,speed:Number(speed.toFixed(6)),file:path.relative(out,file)});
 }
 const args=['-hide_banner','-loglevel','error','-y',...fitted.flatMap(f=>['-i',f]),'-filter_complex',`${fitted.map((_,i)=>`[${i}:a]`).join('')}concat=n=${fitted.length}:v=0:a=1[a]`,'-map','[a]','-c:a','libmp3lame','-b:a','192k',path.join(out,'narration-elevenlabs.mp3')];command('ffmpeg',args);
 await writeFile(path.join(out,'narration-elevenlabs.json'),JSON.stringify({provider:'ElevenLabs',voiceId,modelId:job.modelId,durationSeconds:duration(path.join(out,'narration-elevenlabs.mp3')),scenes:timeline},null,2)+'\n');
 console.log('Audio ready: '+path.join(out,'narration-elevenlabs.mp3'));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
