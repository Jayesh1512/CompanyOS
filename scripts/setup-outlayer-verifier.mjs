import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,readFile,writeFile,copyFile,chmod,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {OUTLAYER_VERIFIER_REVISION,OUTLAYER_VERIFIER_ROOT_HASH} from '../src/integrations/outlayer-verifier.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),directory=path.join(root,'.runtime/dependencies/outlayer-verify');
const source=await mkdtemp(path.join(tmpdir(),'outlayer-verifier-build-')),exec=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
 await exec('git',['init',source]);
 await exec('git',['-C',source,'fetch','--depth','1','https://github.com/out-layer/outlayer-verify',OUTLAYER_VERIFIER_REVISION],{timeout:60000});
 await exec('git',['-C',source,'checkout','--detach','FETCH_HEAD']);
 const actual=(await exec('git',['-C',source,'rev-parse','HEAD'])).stdout.trim();if(actual!==OUTLAYER_VERIFIER_REVISION)throw Error('Verifier source revision mismatch');
 const rootHash=sha(await readFile(path.join(source,'crates/verify-core/src/Intel_SGX_Provisioning_Certification_RootCA.der')));if(rootHash!==OUTLAYER_VERIFIER_ROOT_HASH)throw Error('Verifier Intel root mismatch');
 console.log('Building pinned OutLayer verifier '+actual+' (locked dependencies).');
 await exec('cargo',['build','--locked','--release','--manifest-path',path.join(source,'Cargo.toml'),'-p','outlayer-verify'],{timeout:600000,maxBuffer:4*1024*1024});
 await mkdir(directory,{recursive:true});const binary=path.join(directory,'outlayer-verify');await copyFile(path.join(source,'target/release/outlayer-verify'),binary);await chmod(binary,0o755);
 const manifest={source:'https://github.com/out-layer/outlayer-verify',revision:actual,intelRootSha256:rootHash,binaryHash:sha(await readFile(binary)),lockHash:sha(await readFile(path.join(source,'Cargo.lock'))),rustc:(await exec('rustc',['--version'])).stdout.trim()};
 await writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({binary,...manifest}));
}finally{await rm(source,{recursive:true,force:true});}
