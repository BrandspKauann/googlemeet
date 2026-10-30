import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

test('local capture encodes mono WAV, ignores silence and drains final audio before stopping',async()=>{
 const nodes=new Map();function element(){return {children:[],append(...v){this.children.push(...v);for(const n of v)if(n.id)nodes.set(n.id,n)},textContent:'',value:'browser',disabled:false,setAttribute(){},querySelector(){return null}}}
 const box=element();let capture,contextInstance;
 class AudioContext{constructor(){this.sampleRate=16000;this.closed=false;this.audioWorklet={async addModule(){}};contextInstance=this}async resume(){}createMediaStreamSource(){return {connect(){},disconnect(){}}}createGain(){return {gain:{value:1},connect(){},disconnect(){}}}async close(){this.closed=true}}
 class AudioWorkletNode{constructor(){capture=this;this.port={}}connect(){}disconnect(){}}
 const env={document:{querySelector:()=>box,createElement:element,createTextNode:t=>({textContent:t})},window:{},AudioContext,AudioWorkletNode,fetch:async()=>({json:async()=>({ready:true,model:'base',device:'cpu'})}),Float32Array,ArrayBuffer,DataView,Math,Promise};
 vm.runInNewContext(fs.readFileSync(new URL('./dist/local-asr.js',import.meta.url),'utf8'),env);
 const api=env.window.localASR;const chunks=[],texts=[],gaps=[];let release;
 await api.start({}, {phase(){},gap:t=>gaps.push(t),text:t=>texts.push(t),transcribe:audio=>{chunks.push(audio);return new Promise(resolve=>release=()=>resolve({text:'Fala final',model:'base',processingMs:100}))}});
 assert.equal(nodes.get('speechEngine').disabled,true);
 capture.port.onmessage({data:new Float32Array(16000).fill(0.1)});
 const stop=api.stop();let stopped=false;stop.then(()=>stopped=true);await new Promise(r=>setImmediate(r));assert.equal(contextInstance.closed,true);assert.equal(stopped,false);assert.equal(chunks.length,1);
 const wav=new DataView(chunks[0]);assert.equal(String.fromCharCode(...new Uint8Array(chunks[0],0,4)),'RIFF');assert.equal(wav.getUint32(24,true),16000);assert.equal(wav.getUint16(22,true),1);assert.equal(wav.getUint32(40,true),32000);assert.equal(wav.getInt16(44,true),3276);
 release();await stop;assert.deepEqual(texts,['Fala final']);assert.equal(nodes.get('speechEngine').disabled,false);
 await api.start({}, {phase(){},gap:t=>gaps.push(t),text:t=>texts.push(t),transcribe:async()=>{throw Error('silence should not be sent')}});
 capture.port.onmessage({data:new Float32Array(128000)});await api.stop();assert.equal(chunks.length,1);assert.deepEqual(gaps,[]);
});

test('device capture preserves order, reports overflow, drains queued work and never calls the audio API',async()=>{
 const nodes=new Map();function element(){return {children:[],append(...items){this.children.push(...items);for(const n of items)if(n.id)nodes.set(n.id,n)},textContent:'',value:'browser',disabled:false,setAttribute(){},querySelector(){return null}}}
 const box=element();let capture;let releases=[],calls=0;const texts=[],gaps=[];
 class AudioContext{constructor(){this.sampleRate=48000;this.audioWorklet={async addModule(){}}}async resume(){}createMediaStreamSource(){return {connect(){},disconnect(){}}}createGain(){return {gain:{value:1},connect(){},disconnect(){}}}async close(){}}
 class AudioWorkletNode{constructor(){capture=this;this.port={}}connect(){}disconnect(){}}
 const window={deviceASR:{ready:()=>true,onProgress(){},transcribe(audio,language){assert.ok([160000,8000].includes(audio.length));assert.equal(language,'pt');calls++;return new Promise(resolve=>releases.push(()=>resolve({text:'Trecho '+calls,model:'turbo',processingMs:100})))}}};
 const env={document:{querySelector:()=>box,createElement:element,createTextNode:t=>({textContent:t})},window,AudioContext,AudioWorkletNode,fetch:()=>{throw Error('Áudio do dispositivo não deve chamar a API')},Float32Array,ArrayBuffer,DataView,Math,Promise,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(new URL('./dist/asr-utils.js',import.meta.url),'utf8'),env);
 vm.runInNewContext(fs.readFileSync(new URL('./dist/local-asr.js',import.meta.url),'utf8'),env);
 nodes.get('speechEngine').value='device';const api=window.localASR;
 await api.start({}, {language:'pt',phase(){},gap:t=>gaps.push(t),text:t=>texts.push(t),transcribe(){throw Error('API local não deve ser chamada')}});
 for(let i=0;i<3;i++)capture.port.onmessage({data:new Float32Array(480000).fill(.1)});
 await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(gaps.length,1);assert.equal(nodes.get('speechEngine').disabled,true);
 const stop=api.stop();releases.shift()();await new Promise(r=>setImmediate(r));assert.equal(calls,2);releases.shift()();await stop;
 assert.deepEqual(texts,['Trecho 1','Trecho 2']);assert.equal(nodes.get('speechEngine').disabled,false);
 // A short final buffer must wait for capacity instead of being dropped during stop.
 await api.start({}, {language:'pt',phase(){},gap:t=>gaps.push(t),text:t=>texts.push(t)});
 for(let i=0;i<2;i++)capture.port.onmessage({data:new Float32Array(480000).fill(.1)});
 capture.port.onmessage({data:new Float32Array(24000).fill(.1)});
 await new Promise(r=>setImmediate(r));const finalStop=api.stop();
 for(let i=0;i<3;i++){releases.shift()();await new Promise(r=>setImmediate(r))}await finalStop;
 assert.deepEqual(texts,['Trecho 1','Trecho 2','Trecho 3','Trecho 4','Trecho 5']);assert.equal(gaps.length,1);
 // Aborting discards callbacks from in-flight recognition; it must not post stale text.
 await api.start({}, {language:'pt',phase(){},gap:t=>gaps.push(t),text:t=>texts.push(t)});
 capture.port.onmessage({data:new Float32Array(480000).fill(.1)});await new Promise(r=>setImmediate(r));api.abort();releases.shift()();await new Promise(r=>setImmediate(r));assert.equal(texts.length,5);
});





test('server capture waits six seconds of silence and sends complete turns as bounded 16kHz audio',async()=>{
 const nodes=new Map();function element(){return {children:[],append(...v){this.children.push(...v);for(const n of v)if(n.id)nodes.set(n.id,n)},textContent:'',value:'browser',disabled:false,setAttribute(){},querySelector(){return null}}}
 let capture;const chunks=[],texts=[],gaps=[];let failAt=Infinity;
 class AudioContext{constructor(){this.sampleRate=48000;this.audioWorklet={async addModule(){}}}async resume(){}createMediaStreamSource(){return {connect(){},disconnect(){}}}createGain(){return {gain:{value:1},connect(){},disconnect(){}}}async close(){}}
 class AudioWorkletNode{constructor(){capture=this;this.port={}}connect(){}disconnect(){}}
 const env={document:{querySelector:()=>element(),createElement:element,createTextNode:t=>({textContent:t})},window:{},AudioContext,AudioWorkletNode,fetch:async()=>({json:async()=>({ready:true})}),Float32Array,ArrayBuffer,DataView,Math,Promise,setTimeout,clearTimeout};
 for(const file of ['asr-utils.js','local-asr.js'])vm.runInNewContext(fs.readFileSync(new URL('./dist/'+file,import.meta.url),'utf8'),env);
 nodes.get('speechEngine').value='server';const config={phase(){},gap:t=>gaps.push(t),text:t=>texts.push(t),transcribe:async wav=>{chunks.push(wav);if(chunks.length===failAt)throw Error('network');return {text:'Teste.',model:'large-v3',processingMs:100}}};await env.window.localASR.start({},config);
 capture.port.onmessage({data:new Float32Array(48000).fill(.1)});
 capture.port.onmessage({data:new Float32Array(276000)});await new Promise(r=>setImmediate(r));assert.equal(chunks.length,0);
 capture.port.onmessage({data:new Float32Array(12000)});await new Promise(r=>setImmediate(r));assert.equal(chunks.length,1);assert.equal(chunks[0].byteLength,32044);assert.equal(new DataView(chunks[0]).getUint32(24,true),16000);
 for(let i=0;i<12;i++)capture.port.onmessage({data:new Float32Array(48000).fill(.1)});
 await new Promise(r=>setImmediate(r));assert.equal(chunks.length,1,'continuous speech must not be submitted early');
 capture.port.onmessage({data:new Float32Array(288000)});await new Promise(r=>setImmediate(r));assert.equal(chunks.length,3);assert.equal(chunks[1].byteLength,320044);assert.equal(chunks[2].byteLength,64044);assert.equal(texts.at(-1),'Teste. Teste.');
 capture.port.onmessage({data:new Float32Array(24000).fill(.1)});await env.window.localASR.stop();assert.equal(chunks.length,4,'explicit microphone stop drains the final speech');assert.equal(gaps.length,0);
 await env.window.localASR.start({},config);failAt=6;
 for(let i=0;i<12;i++)capture.port.onmessage({data:new Float32Array(48000).fill(.1)});
 capture.port.onmessage({data:new Float32Array(288000)});await new Promise(r=>setImmediate(r));assert.equal(chunks.length,6);assert.equal(texts.at(-1),'Teste.','successful portion survives a later chunk failing');assert.equal(gaps.length,1);await env.window.localASR.stop();
});
