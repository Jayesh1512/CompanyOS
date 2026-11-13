import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const directory=process.argv[2]??'artifacts/companyos';
const proof=JSON.parse(await readFile(path.join(directory,'browser-proof.json'),'utf8'));
const source=JSON.parse(await readFile(path.join(directory,'source-manifest.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(!proof.allScreenshotsFromThisRun||!proof.screenshotsCaptured||proof.functionalOnly||proof.screenshotsFromPriorVisualPass)throw Error('FRESH_SCREENSHOTS_REQUIRED');
if(proof.sourceCommit!==source.sourceCommit||proof.sourceCommitScope!==source.sourceCommitScope)throw Error('SOURCE_BINDING_MISMATCH');
const seen=new Set();
for(const scan of proof.scans){
 if(scan.runId!==proof.runId||!scan.image||seen.has(scan.image)||path.basename(scan.image)!==scan.image||Date.parse(scan.capturedAt)<Date.parse(proof.startedAt)||Date.parse(scan.capturedAt)>Date.parse(proof.checkedAt))throw Error('IMAGE_RUN_MISMATCH');
 seen.add(scan.image);const bytes=await readFile(path.join(directory,scan.image));
 if(bytes.length!==scan.bytes||sha(bytes)!==scan.sha256)throw Error('IMAGE_BYTES_CHANGED');
 if(!scan.focus?.checked||scan.focus.failures.length||scan.documentWidth>scan.viewport+1)throw Error('BROWSER_CHECK_FAILED');
 console.log(`PASS ${scan.image}: same run, capture time, SHA-256, layout and ${scan.focus.checked} visible focus checks`);
}
let count=0;
for(const [name,digest]of Object.entries(source.sourceFiles)){
 if(!/^(public|src)\//.test(name)&&!['server.mjs','scripts/check-autonomy-browser.mjs'].includes(name)||name.split('/').includes('..'))throw Error('UNSAFE_SOURCE_PATH');
 if(sha(await readFile(name))!==digest)throw Error('BROWSER_SOURCE_CHANGED:'+name);count++;
}
if(proof.consoleExceptions.length||!proof.reducedMotion.requested||proof.reducedMotion.transition!=='0s'||proof.reducedMotion.animation!=='none'||proof.reducedMotion.scroll!=='auto')throw Error('BROWSER_STATE_CHECK_FAILED');
console.log(`Verified ${seen.size} fresh screenshots, ${count} source files and ${proof.viewCoverage.length} navigated views. No browser, provider or chain call was made by this verifier.`);
