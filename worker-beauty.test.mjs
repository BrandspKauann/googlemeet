import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(){
  const workers=[],clones=[],outputs=[],statuses=[],errors=[];
  const raw={stopped:false,clone(){const track={stopped:false,stop(){this.stopped=true}};clones.push(track);return track;}};
  class Worker{constructor(){workers.push(this)}postMessage(message,transfer){(this.messages||=[]).push({message,transfer})}terminate(){this.terminated=true}reply(data){this.onmessage({data})}}
  class Generator{constructor(){this.writable={};outputs.push(this)}stop(){this.stopped=true}}
  class Processor{constructor(options){this.readable={};this.options=options}}
  class Stream{constructor(tracks){this.tracks=tracks}}
  const window={createCompatibleBeauty:async()=>{throw Error('GPU unavailable')},MediaStreamTrackProcessor:Processor,MediaStreamTrackGenerator:Generator,OffscreenCanvas:{}};
  vm.runInNewContext(fs.readFileSync('dist/worker-beauty.js','utf8'),{window,Worker,MediaStreamTrackProcessor:Processor,MediaStreamTrackGenerator:Generator,MediaStream:Stream,Error,setTimeout,clearTimeout});
  const start=signal=>window.createWorkerBeauty({getVideoTracks:()=>[raw]},{smooth:68},m=>statuses.push(m),e=>errors.push(e.message),()=>false,signal);
  return {start,raw,workers,clones,outputs,statuses,errors,window};
}
test('beauty transfers bounded frame streams, publishes only prepared output and retains source camera',async()=>{
  const s=setup(),pending=s.start();const worker=s.workers[0],init=worker.messages[0];
  assert.equal(init.message.type,'start');assert.equal(init.transfer[0],init.message.readable);assert.equal(init.transfer[1],init.message.writable);
  worker.reply({type:'ready'});const fx=await pending;assert.equal(fx.stream.tracks[0],s.outputs[0]);
  fx.setValues({smooth:12});assert.equal(worker.messages[1].message.values.smooth,12);
  worker.reply({type:'status',message:'active'});assert.deepEqual(s.statuses,['active']);
  fx.stop();assert.equal(worker.terminated,true);assert.equal(s.clones[0].stopped,true);assert.equal(s.outputs[0].stopped,true);assert.equal(s.raw.stopped,false);
});
test('closing during model preparation cancels worker without stopping original camera',async()=>{
  const s=setup(),controller=new AbortController(),pending=s.start(controller.signal);controller.abort();
  await assert.rejects(pending,/cancelada/);assert.equal(s.workers[0].terminated,true);assert.equal(s.clones[0].stopped,true);assert.equal(s.raw.stopped,false);
});
test('initial and running worker failures are surfaced to the camera controller',async()=>{
  const s=setup(),pending=s.start();s.workers[0].reply({type:'error',message:'GPU unavailable'});await assert.rejects(pending,/GPU/);assert.equal(s.workers[0].terminated,true);
  const next=s.start();s.workers[1].reply({type:'ready'});const fx=await next;s.workers[1].reply({type:'error',message:'GPU lost'});assert.deepEqual(s.errors,['GPU lost']);fx.stop();
});

test('missing background-video API selects the combined compatible pipeline',async()=>{
 const s=setup();s.window.MediaStreamTrackGenerator=undefined;let called=0;
 const compatible={stream:{compatible:true},stop(){}};
 s.window.createCompatibleBeauty=async()=>{called++;return compatible};
 assert.equal(await s.start(),compatible);assert.equal(called,1);assert.equal(s.workers.length,0);assert.equal(s.raw.stopped,false);
});
