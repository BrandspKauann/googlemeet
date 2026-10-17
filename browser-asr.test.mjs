import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRangeFetch} from './browser-asr/range-fetch.js';
const source=name=>fs.readFileSync(new URL('./dist/'+name,import.meta.url),'utf8');
function utilities(){const env={window:{},setTimeout,clearTimeout,Float32Array};vm.runInNewContext(source('asr-utils.js'),env);return env.window.asrUtils}
test('mono reamostragem preserva duração, silêncio e média em 48/44.1 kHz',()=>{
 const {resample}=utilities();for(const rate of [48000,44100,16000]){const input=new Float32Array(rate).fill(.25);const output=resample(input,rate);assert.equal(output.length,16000);assert.ok(output.every(x=>Math.abs(x-.25)<1e-6));assert.ok(resample(new Float32Array(rate),rate).every(x=>x===0))}
 const alternating=new Float32Array(48000).map((_,i)=>i%2?1:-1);assert.ok(utilities().resample(alternating,48000).every(x=>Math.abs(x)<=.334));
});
test('agrupamento mantém ordem, limite de espera, mudança de participante e fala final',async()=>{
 const timers=new Map();let sequence=0;const outputs=[];
 const grouper=utilities().createGrouper(t=>outputs.push(t),{setTimer:(fn,delay)=>{const id=++sequence;timers.set(id,{fn,delay});return id},clearTimer:id=>timers.delete(id)});
 await grouper.push('A palavra carro','teacher:pt');assert.equal(outputs.length,0);
 await grouper.push('tem quantas letras?','teacher:pt');assert.deepEqual(outputs,['A palavra carro tem quantas letras?']);
 await grouper.push('Primeiro trecho','teacher:pt');await grouper.push('Outro participante','student:pt');await grouper.flush();assert.deepEqual(outputs.slice(1),['Primeiro trecho','Outro participante']);
 await grouper.push('Sem pontuação','teacher:pt');assert.ok([...timers.values()].some(t=>t.delay===10000));await [...timers.values()].find(t=>t.delay===2000).fn();assert.equal(outputs.at(-1),'Sem pontuação');
 await grouper.push('Descartar','teacher:pt');grouper.abort();await grouper.flush();assert.notEqual(outputs.at(-1),'Descartar');
});
test('medidas WER/CER são distintas e a comparação ignora pontuação',()=>{
 const {errorRate}=utilities();assert.equal(errorRate('Olá, professora!','olá professora'),0);assert.equal(errorRate('老师你好','老师好','zh'),.25);assert.equal(errorRate('carro tem letras','carro tem portas'),1/3);
});
test('pergunta dividida recebe aspas após agrupamento e preserva reconhecimento bruto',async()=>{
 const env={window:{},setTimeout,clearTimeout,Float32Array};for(const name of ['asr-utils.js','educational-quotes.js'])vm.runInNewContext(source(name),env);
 const received=[];const group=env.window.asrUtils.createGrouper(rawText=>received.push({rawText,text:env.window.educationalQuotes.format(rawText,'pt')}));
 await group.push('A palavra carro','teacher:pt');await group.push('tem quantas letras?','teacher:pt');
 assert.deepEqual(received,[{rawText:'A palavra carro tem quantas letras?',text:'A palavra “carro” tem quantas letras?'}]);await group.flush();assert.equal(received.length,1);
});
function deviceEnvironment({webgpu=true,validation='Olá, tudo bem? Hoje vamos aprender português. Você pode compartilhar sua tela e acompanhar a tradução da aula.'}={}){
 const network=[],instances=[];let called=0;
 class Worker{constructor(){instances.push(this)}postMessage(data,transfer){this.last=data;this.transfer=transfer;queueMicrotask(()=>this.onmessage?.({data:{id:data.id,type:'result',result:data.type==='prepare'?{}:{text:called++? 'A palavra carro tem quantas letras?':validation,model:'turbo',processingMs:100}}}))}terminate(){this.terminated=true}}
 class AudioContext{async decodeAudioData(){return {length:16000,numberOfChannels:1,sampleRate:16000,getChannelData:()=>new Float32Array(16000)}}async close(){}}
 const env={window:{asrUtils:utilities()},navigator:webgpu?{gpu:{}}:{},Worker,AudioContext,Float32Array,Uint8Array,Error,Promise,setTimeout,clearTimeout,fetch:async url=>{network.push(url);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(4)}}};
 vm.runInNewContext(source('device-asr.js'),env);return {api:env.window.deviceASR,network,instances};
}
test('Whisper exige preparação/validação, transfere PCM e não envia áudio por HTTP',async()=>{
 const {api,network,instances}=deviceEnvironment();await assert.rejects(()=>api.transcribe(new Float32Array(16),'pt'),/Prepare/);
 await api.prepare();assert.equal(api.ready(),true);assert.deepEqual(network,['/asr-fixture.wav']);
 const audio=new Float32Array(16000);await api.transcribe(audio,'pt');assert.equal(instances[0].transfer[0],audio.buffer);assert.equal(instances[0].last.language,'pt');
 instances[0].onerror();assert.equal(api.ready(),false);assert.equal(instances[0].terminated,true);await assert.rejects(()=>api.transcribe(audio,'pt'),/Prepare/);
});
test('WebGPU ausente ou saída corrompida não libera o modelo para aulas',async()=>{
 for(const settings of [{webgpu:false},{validation:'Texto diferente e corrompido'}]){const {api}=deviceEnvironment(settings);await assert.rejects(()=>api.prepare(),/WebGPU|validação/);assert.equal(api.ready(),false)}
});
test('interface comum aguarda o último resultado nativo e cancela reconexão ao parar',async()=>{
 const timers=new Map();let id=0,instance;const texts=[];
 class Recognition{constructor(){instance=this;this.starts=0}start(){this.starts++;this.onstart?.()}stop(){const final=[{transcript:'Última fala.'}];final.isFinal=true;this.onresult({resultIndex:0,results:[final]});this.onend()}abort(){}}
 const window={SpeechRecognition:Recognition,localASR:{engine:()=> 'browser',prepare:async()=>{},abort(){}}};
 const env={window,setTimeout:(fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key},clearTimeout:key=>timers.delete(key)};
 vm.runInNewContext(source('speech-engine.js'),env);const engine=window.speechEngine;
 await engine.prepare();await engine.start({}, {language:'pt',text:t=>texts.push(t),status(){},phase(){},gap(){}});assert.equal(instance.lang,'pt-BR');
 instance.onend();const restart=[...timers.values()][0].fn;await engine.stop();restart();assert.equal(instance.starts,1);assert.deepEqual(texts,['Última fala.']);assert.equal(timers.size,0);
 const late=[{transcript:'Resultado obsoleto.'}];late.isFinal=true;instance.onresult({resultIndex:0,results:[late]});assert.equal(texts.length,1);
});
test('download em partes retoma falha e monta pesos na ordem mesmo com respostas fora de ordem',async()=>{
 const url='https://models.example.test/weights.onnx',original=new Uint8Array([1,2,3,4,5,6,7,8,9,10]),attempts=new Map();let retries=0;
 const fetcher=async(input,init)=>{const [start,end]=new Headers(init.headers).get('Range').match(/\d+/g).map(Number);attempts.set(start,(attempts.get(start)||0)+1);if(start===3&&attempts.get(start)===1)throw Error('network error');await new Promise(r=>setTimeout(r,start===3?10:1));return new Response(original.slice(start,end+1),{status:206,headers:{'Content-Range':`bytes ${start}-${end}/10`}})};
 const response=await createRangeFetch(fetcher,{[url]:10},()=>retries++,{chunkSize:3,concurrency:2,retryMs:1})(url);
 assert.equal(response.headers.get('Content-Length'),'10');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),original);assert.equal(attempts.get(3),2);assert.equal(retries,1);
});
test('download rejeita partes incorretas e não interfere nos demais arquivos',async()=>{
 const url='https://models.example.test/weights.onnx';let unknown=false;
 const fetcher=async(input,init)=>{if(input!==url){unknown=true;return new Response('config')}const start=Number(new Headers(init.headers).get('Range').match(/\d+/)[0]);return new Response(new Uint8Array(start===0?3:1),{status:206})};
 const download=createRangeFetch(fetcher,{[url]:6},()=>{},{chunkSize:3,retryMs:1});const result=await download(url);await assert.rejects(()=>result.arrayBuffer(),/baixar o modelo/);assert.equal(await (await download('https://models.example.test/config.json')).text(),'config');assert.equal(unknown,true);
});
function nativeHarness({available}={}){
 const timers=new Map(),instances=[],gaps=[],statuses=[],reconnects=[];let id=0;
 class Recognition{
  constructor(){instances.push(this)}start(){this.started=true;this.onstart?.()}abort(){this.aborted=true;this.onend?.()}stop(){this.onend?.()}
 }
 if(available)Recognition.available=available;
 const window={SpeechRecognition:Recognition,localASR:{engine:()=> 'browser',abort(){}}};
 vm.runInNewContext(source('speech-engine.js'),{window,setTimeout:(fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key},clearTimeout:key=>timers.delete(key)});
 const start=()=>window.speechEngine.start({}, {language:'zh',text(){},status:t=>statuses.push(t),phase(){},gap:t=>gaps.push(t),reconnect:v=>reconnects.push(v)});
 const runRetry=()=>{const entry=[...timers.entries()].find(([,timer])=>timer.ms!==2000);assert.ok(entry);timers.delete(entry[0]);entry[1].fn()};
 return {engine:window.speechEngine,start,timers,instances,gaps,statuses,reconnects,runRetry};
}
test('network failures use fresh recognizers, deduplicate gaps and stop after three retries',async()=>{
 const s=nativeHarness();await s.start();
 for(let i=0;i<4;i++){const current=s.instances.at(-1);current.onerror({error:'network'});current.onerror({error:'network'});current.onend?.();if(i<3)s.runRetry();}
 assert.equal(s.instances.length,4);assert.equal(s.gaps.length,1);assert.equal(s.timers.size,0);assert.equal(s.reconnects.at(-1),true);assert.match(s.statuses.at(-1),/VPN/);
 await s.engine.retry();assert.equal(s.instances.length,5);assert.equal(s.reconnects.at(-1),false);
 const stale=s.instances[0];stale.onerror({error:'network'});assert.equal(s.gaps.length,1);s.engine.abort();assert.equal(s.timers.size,0);
});
test('installed local speech is preferred without any model installation',async()=>{
 const calls=[];const s=nativeHarness({available:async options=>{calls.push(options);return 'available'}});await s.start();
 assert.equal(s.instances[0].processLocally,true);assert.equal(calls[0].langs[0],'zh-CN');assert.equal(calls[0].processLocally,true);assert.equal(s.timers.size,0);s.engine.abort();
});
test('uninstalled local speech uses remote recognition and permission errors do not retry endlessly',async()=>{
 const s=nativeHarness({available:async()=> 'downloadable'});await s.start();assert.notEqual(s.instances[0].processLocally,true);
 s.instances[0].onerror({error:'not-allowed'});assert.equal(s.reconnects.at(-1),true);assert.equal(s.timers.size,0);assert.equal(s.instances.length,1);s.engine.abort();
});
