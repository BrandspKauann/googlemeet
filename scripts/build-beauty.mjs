import {build} from 'esbuild';
import fs from 'node:fs';
await build({entryPoints:['browser-beauty/openmakeup.js'],outfile:'dist/openmakeup/adapter.js',bundle:true,external:['/face-tracking/*'],format:'esm',platform:'browser',minify:true});
await build({entryPoints:['browser-beauty/worker.js'],outfile:'dist/openmakeup/worker.js',bundle:true,external:['/face-tracking/*','/gpupixel/*'],format:'iife',platform:'browser',minify:true});
fs.cpSync('node_modules/open-makeup-sdk/assets','dist/openmakeup/assets',{recursive:true});
fs.writeFileSync('dist/openmakeup/LICENSES.txt','OpenMakeupSDK 0.1.0 — MIT\n'+fs.readFileSync('node_modules/open-makeup-sdk/LICENSE','utf8')+'\nThree.js 0.184.0 — MIT\n'+fs.readFileSync('node_modules/three/LICENSE','utf8'));
console.log('OpenMakeupSDK, shaders, modelos e licenças preparados.');

