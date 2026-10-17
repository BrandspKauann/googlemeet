import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(){
  const elements=new Map(),listeners={},sent=[],gaps=[],track={stopped:false,stop(){this.stopped=true}};
  const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};let ready=false,calls=0,failure;
  const element=id=>{if(!elements.has(id))elements.set(id,{attrs:{},setAttribute(k,v){this.attrs[k]=v},classList:{add(){},remove(){}}});return elements.get(id)};
  const localASR={engine:()=> 'device',setActive(active,allow){this.active=active;this.allow=allow}};
  const context={window:{localASR,deviceASR:{ready:()=>ready},speechEngine:{abort(){},async start(){calls++;if(failure)throw failure}},meetingUI:{controlLabel(id,text){element(id).label=text}},addEventListener:(name,fn)=>listeners[name]=fn},navigator:{mediaDevices:{getUserMedia:async()=>stream}},document:{querySelector:()=>({})},state:{you:{status:'accepted',language:'pt'}},audioStream:null,finished:false,closing:false,$:element,updateTracks:async()=>sent.push(context.audioStream),postText:async text=>gaps.push(text),mediaError:error=>error.message,Error};
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
