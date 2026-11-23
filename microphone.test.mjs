import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
function setup(){
  const elements=new Map(),listeners={},sent=[],gaps=[],track={stopped:false,stop(){this.stopped=true}};
  const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};let ready=false,calls=0,failure;
  const element=id=>{if(!elements.has(id))elements.set(id,{attrs:{},setAttribute(k,v){this.attrs[k]=v},classList:{add(){},remove(){}}});return elements.get(id)};
  const localASR={engine:()=> 'device',setActive(active,allow){this.active=active;this.allow=allow}};
  const context={profile:{},crypto:webcrypto,window:{localASR,deviceASR:{ready:()=>ready},speechEngine:{abort(){},async start(){calls++;if(failure)throw failure}},meetingUI:{controlLabel(id,text){element(id).label=text}},addEventListener:(name,fn)=>listeners[name]=fn},navigator:{mediaDevices:{getUserMedia:async()=>stream}},document:{querySelector:()=>({})},state:{you:{status:'accepted',language:'pt'}},audioStream:null,finished:false,closing:false,$:element,updateTracks:async()=>sent.push(context.audioStream),postText:async text=>gaps.push(text),mediaError:error=>error.message,Error};
  const source=fs.readFileSync('dist/room.js','utf8');vm.runInNewContext(source.slice(source.indexOf('async function startRecognition('),source.indexOf('async function stopMic(')),context);
  return {context,element,localASR,stream,track,sent,gaps,listeners,setReady:()=>ready=true,setFailure:error=>failure=error,calls:()=>calls};
}
test('unprepared model does not block microphone capture or sending audio',async()=>{
  const s=setup();await s.context.startMic();assert.equal(s.context.audioStream,s.stream);assert.equal(s.track.stopped,false);assert.equal(s.sent[0],s.stream);assert.equal(s.element('mic').attrs['aria-pressed'],'true');assert.equal(s.calls(),0);assert.equal(s.localASR.allow,true);assert.match(s.element('mediaStatus').textContent,/Microfone ligado, sem transcrição/);assert.equal(s.gaps.length,1);
  s.setReady();await s.listeners['aula-recognition-ready']();assert.equal(s.calls(),1);assert.equal(s.context.audioStream,s.stream);assert.equal(s.track.stopped,false);
});
test('recognition startup failure leaves microphone connected',async()=>{
  const s=setup();s.setReady();s.setFailure(Error('recognizer failed'));await s.context.startMic();assert.equal(s.context.audioStream,s.stream);assert.equal(s.track.stopped,false);assert.equal(s.element('mic').attrs['aria-pressed'],'true');assert.match(s.element('mediaStatus').textContent,/recognizer failed/);
});
test('capture permission failure is reported and microphone stays off',async()=>{
  const s=setup();s.context.navigator.mediaDevices.getUserMedia=async()=>{throw Error('permission denied')};await assert.rejects(s.context.startMic(),/permission denied/);assert.equal(s.context.audioStream,null);assert.equal(s.calls(),0);assert.match(s.element('mediaStatus').textContent,/Não foi possível ligar o microfone/);
});

test('Soniox primes caption audio before waiting for microphone permission and exposes retry on startup failure',async()=>{
 const s=setup();let prepared=false;s.context.profile.speechProvider='soniox';s.localASR.engine=()=> 'server';s.context.window.sonioxASR={prepareCapture(){prepared=true},abort(){}};s.context.navigator.mediaDevices.getUserMedia=async()=>{assert.equal(prepared,true);return s.stream};s.setFailure(Error('captura pausada'));await s.context.startMic();assert.equal(s.context.audioStream,s.stream);assert.equal(s.element('retryCaptions').hidden,false);assert.equal(s.track.stopped,false);assert.match(s.element('mediaStatus').textContent,/captura pausada/);
});


test('a microphone permission arriving after room closure is released instead of published',async()=>{
 const s=setup();let finish;s.context.navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>finish=resolve);const pending=s.context.startMic();s.context.finished=true;finish(s.stream);await pending;assert.equal(s.track.stopped,true);assert.equal(s.context.audioStream,null);assert.equal(s.calls(),0);assert.equal(s.sent.length,0);
});
test('concurrent caption starts for one microphone coalesce and stale failures cannot abort a new stream',async()=>{
 const s=setup();s.setReady();s.context.audioStream=s.stream;let calls=0,finish;let aborts=0;s.context.window.speechEngine.abort=()=>aborts++;s.context.window.speechEngine.start=()=>{calls++;return new Promise(resolve=>finish=resolve);};const a=s.context.startRecognition(s.stream),b=s.context.startRecognition(s.stream);await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);finish({});await Promise.all([a,b]);assert.equal(aborts,0);
 let rejectOld;s.context.window.speechEngine.start=()=>new Promise((resolve,reject)=>rejectOld=reject);const old=s.context.startRecognition(s.stream);await new Promise(resolve=>setImmediate(resolve));s.context.cancelRecognitionStart();const next={getTracks:()=>[]};s.context.audioStream=next;s.context.window.speechEngine.start=async()=>({});await s.context.startRecognition(next);rejectOld(Error('cancelled older request'));await old;assert.equal(aborts,0);
});
test('disabling caption services never blocks the microphone or requests a recognizer',async()=>{
 const s=setup();s.context.state.lesson={captionsEnabled:false};s.context.profile.speechProvider='soniox';let preparations=0;s.context.window.sonioxASR={prepareCapture(){preparations++;},abort(){}};await s.context.startMic();assert.equal(s.track.stopped,false);assert.equal(s.context.audioStream,s.stream);assert.equal(s.calls(),0);assert.equal(preparations,0);assert.match(s.element('mediaStatus').textContent,/desligadas pela professora/);
});
