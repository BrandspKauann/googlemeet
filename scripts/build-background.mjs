import {build} from 'esbuild';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const output='dist/background-runtime/v1',model=output+'/selfie-segmenter.tflite';
const url='https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/1/selfie_segmenter_landscape.tflite';
const sha='490e9ea734313e0de10fa0cd9e3c6133e36ea4db2b7a49bde9ef019f72796b8e';
fs.mkdirSync(output,{recursive:true});
if(!fs.existsSync(model)||createHash('sha256').update(fs.readFileSync(model)).digest('hex')!==sha){const response=await fetch(url);if(!response.ok)throw Error('Não foi possível baixar o modelo de fundo.');const bytes=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==sha)throw Error('Modelo de fundo com checksum inválido.');fs.writeFileSync(model,bytes);}
fs.cpSync('node_modules/@mediapipe/tasks-vision/wasm',output+'/wasm',{recursive:true});
await build({entryPoints:['browser-beauty/background-worker.js'],outfile:output+'/worker.js',bundle:true,format:'iife',platform:'browser',minify:true});
fs.copyFileSync('browser-beauty/BACKGROUND-LICENSE.txt',output+'/LICENSE.txt');
console.log('Desfoque de fundo: runtime 1.0.1 e modelo verificado preparados.');
