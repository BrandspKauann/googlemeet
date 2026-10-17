import {build} from 'esbuild';
import fs from 'node:fs';
await build({entryPoints:['browser-beauty/openmakeup.js'],outfile:'dist/openmakeup/adapter.js',bundle:true,inject:['browser-beauty/cached-fetch.js'],external:['/face-tracking/*','/beauty-cache.js'],format:'esm',platform:'browser',minify:true});
await build({entryPoints:['browser-beauty/worker.js'],outfile:'dist/openmakeup/worker.js',bundle:true,external:['/face-tracking/*','/gpupixel/*','/beauty-cache.js'],format:'iife',platform:'browser',minify:true});
fs.cpSync('node_modules/open-makeup-sdk/assets','dist/openmakeup/assets',{recursive:true});
fs.writeFileSync('dist/openmakeup/LICENSES.txt','OpenMakeupSDK 0.1.0 — MIT\n'+fs.readFileSync('node_modules/open-makeup-sdk/LICENSE','utf8')+'\nThree.js 0.184.0 — MIT\n'+fs.readFileSync('node_modules/three/LICENSE','utf8'));
console.log('OpenMakeupSDK, shaders, modelos e licenças preparados.');


const files=fs.readdirSync('dist/openmakeup/assets',{recursive:true}).filter(file=>fs.statSync('dist/openmakeup/assets/'+file).isFile()).map(file=>'/openmakeup/assets/'+file.replaceAll('\\','/'));
files.push('https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task');
fs.writeFileSync('dist/openmakeup/download.json',JSON.stringify(files));
