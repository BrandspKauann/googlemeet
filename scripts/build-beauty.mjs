import {build} from 'esbuild';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
await build({entryPoints:['browser-beauty/openmakeup.js'],outfile:'dist/openmakeup/adapter.js',bundle:true,inject:['browser-beauty/cached-fetch.js'],external:['/face-tracking/*','/beauty-cache.js'],format:'esm',platform:'browser',minify:true});
await build({entryPoints:['browser-beauty/worker.js'],outfile:'dist/openmakeup/worker.js',bundle:true,external:['/face-tracking/*','/gpupixel/*','/beauty-cache.js'],format:'iife',platform:'browser',minify:true});
fs.cpSync('node_modules/open-makeup-sdk/assets','dist/openmakeup/assets',{recursive:true});
fs.writeFileSync('dist/openmakeup/LICENSES.txt','OpenMakeupSDK 0.1.0 — MIT\n'+fs.readFileSync('node_modules/open-makeup-sdk/LICENSE','utf8')+'\nThree.js 0.184.0 — MIT\n'+fs.readFileSync('node_modules/three/LICENSE','utf8'));
console.log('OpenMakeupSDK, shaders, modelos e licenças preparados.');


const faceModel='dist/openmakeup/assets/face_landmarker.task';
const faceSHA='64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
if(!fs.existsSync(faceModel)||createHash('sha256').update(fs.readFileSync(faceModel)).digest('hex')!==faceSHA){const response=await fetch('https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task');if(!response.ok)throw Error('Modelo facial indisponível.');const bytes=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==faceSHA)throw Error('Checksum facial inválido.');fs.writeFileSync(faceModel,bytes);}
fs.mkdirSync('dist/openmakeup/runtime/v1',{recursive:true});
fs.copyFileSync('node_modules/@mediapipe/tasks-vision/vision_bundle.mjs','dist/openmakeup/runtime/v1/vision_bundle.mjs');
fs.cpSync('node_modules/@mediapipe/tasks-vision/wasm','dist/openmakeup/runtime/v1/wasm',{recursive:true});
fs.copyFileSync('browser-beauty/BACKGROUND-LICENSE.txt','dist/openmakeup/runtime/v1/LICENSE.txt');
const files=fs.readdirSync('dist/openmakeup/assets',{recursive:true}).filter(file=>fs.statSync('dist/openmakeup/assets/'+file).isFile()).map(file=>'/openmakeup/assets/'+file.replaceAll('\\','/'));

files.push('/openmakeup/runtime/v1/vision_bundle.mjs');
for(const name of fs.readdirSync('dist/openmakeup/runtime/v1/wasm'))files.push('/openmakeup/runtime/v1/wasm/'+name);
for(const name of ['gray','origin','skin','light'])files.push('/gpupixel/lookup_'+name+'.png');
fs.writeFileSync('dist/openmakeup/download.json',JSON.stringify(files));
