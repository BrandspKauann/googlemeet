import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createFrameChannel} from './browser-beauty/frame-channel.js';
function setup(){
  const workers=[],clones=[],outputs=[],statuses=[],errors=[],intervals=new Map();let now=0,sequence=0,pendingRead;const inputs=[],written=[],captureCalls=[];let pendingCapture;const captureReader={read:()=>new Promise(resolve=>pendingCapture=resolve),cancel:async()=>{pendingCapture?.({done:true});pendingCapture=null;}};
  const reader={read:()=>inputs.length?Promise.resolve({done:false,value:inputs.shift()}):new Promise(resolve=>pendingRead=resolve),cancel:async()=>{for(const frame of inputs.splice(0))frame.close();pendingRead?.({done:true});pendingRead=null;}};
  const raw={stopped:false,clone(){const track={stopped:false,stop(){this.stopped=true}};clones.push(track);return track;}};
  class Worker{constructor(){workers.push(this)}postMessage(message,transfer){(this.messages||=[]).push({message,transfer});if(message.type==='stop')this.reply({type:'stopped'})}terminate(){this.terminated=true}reply(data){this.onmessage({data})}}
  class Processor{constructor(options){this.readable={getReader:()=>options.track.monitor?captureReader:reader};this.options=options}}
  class Stream{constructor(tracks){this.tracks=tracks}getVideoTracks(){return this.tracks}}
  const document={createElement:()=>({getContext:()=>({putImageData:frame=>written.push(frame)}),captureStream(...args){captureCalls.push(args);const track={stop(){this.stopped=true},requestFrame(){},clone(){return {monitor:true,stop(){this.stopped=true}}}};outputs.push(track);return new Stream([track])}})};
  const window={createCompatibleBeauty:async()=>{throw Error('GPU unavailable')},MediaStreamTrackProcessor:Processor,OffscreenCanvas:{}};
  class ImageData{constructor(pixels,width,height){Object.assign(this,{data:pixels,width,height})}}
  vm.runInNewContext(fs.readFileSync('dist/worker-beauty.js','utf8'),{window,document,ImageData,Worker,MediaStreamTrackProcessor:Processor,MediaStream:Stream,Error,setTimeout,clearTimeout,Date:{now:()=>now},setInterval:fn=>{const id=++sequence;intervals.set(id,fn);return id},clearInterval:id=>intervals.delete(id)});
  const start=signal=>window.createWorkerBeauty({getVideoTracks:()=>[raw]},{smooth:68},m=>statuses.push(m),e=>errors.push(e.message),()=>false,signal);
  return {start,raw,workers,clones,outputs,statuses,errors,window,written,captureCalls,capture(){pendingCapture?.({done:false,value:{close(){}}});pendingCapture=null;},push(frame){if(pendingRead){const resolve=pendingRead;pendingRead=null;resolve({done:false,value:frame})}else inputs.push(frame)},tick(ms){now+=ms;for(const fn of [...intervals.values()])fn()},intervals};
}
test('beauty starts bounded frame transport, publishes prepared output and retains source camera',async()=>{
  const s=setup(),pending=s.start();const worker=s.workers[0],init=worker.messages[0];
  assert.equal(init.message.type,'start');assert.equal(init.transfer,undefined);assert.equal(init.message.readable,undefined);
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
 const s=setup();s.window.MediaStreamTrackProcessor=undefined;let called=0;
 const compatible={stream:{compatible:true},stop(){}};
 s.window.createCompatibleBeauty=async()=>{called++;return compatible};
 assert.equal(await s.start(),compatible);assert.equal(called,1);assert.equal(s.workers.length,0);assert.equal(s.raw.stopped,false);
});


test('stalled beauty frames trigger one recovery and release the failed output, not the camera',async()=>{
 const s=setup(),pending=s.start();s.workers[0].reply({type:'ready'});await pending;
 s.tick(2000);assert.equal(s.errors.length,0);
 const frame={pixels:new Uint8ClampedArray(16),width:2,height:2};s.workers[0].reply({type:'output',frame});s.capture();await new Promise(r=>setImmediate(r));
 s.tick(2000);assert.equal(s.errors.length,0);
 // Even new pixels from the Worker do not prove native capture is advancing.
 s.workers[0].reply({type:'output',frame});s.tick(1000);
 assert.equal(s.errors.length,1);assert.match(s.errors[0],/parou de atualizar/);
 assert.equal(s.workers[0].terminated,true);assert.equal(s.outputs[0].stopped,true);assert.equal(s.raw.stopped,false);
 s.tick(10000);assert.equal(s.errors.length,1);assert.equal(s.intervals.size,0);
});

test('compatible rendering follows every video callback without a fixed-FPS timer',()=>{
 const window={},callbacks=new Map();let id=0,drawn=0;
 const source={requestVideoFrameCallback(fn){callbacks.set(++id,fn);return id},cancelVideoFrameCallback(key){callbacks.delete(key)}};
 vm.runInNewContext(fs.readFileSync('dist/compatible-beauty.js','utf8'),{window});
 const stop=window.followBeautyVideoFrames(source,()=>drawn++,error=>{throw error});
 for(let i=0;i<120;i++){const [key,fn]=callbacks.entries().next().value;callbacks.delete(key);fn();}
 assert.equal(drawn,120);assert.equal(callbacks.size,1);stop();assert.equal(callbacks.size,0);
});


test('native canvas output has no frame-rate cap and does not require TrackGenerator',async()=>{
 const s=setup(),pending=s.start(),worker=s.workers[0];worker.reply({type:'ready'});const fx=await pending;
 assert.deepEqual(s.captureCalls,[[]]);
 for(let i=0;i<120;i++)worker.reply({type:'output',frame:{pixels:new Uint8ClampedArray(16),width:2,height:2}});
 assert.equal(s.written.length,120);assert.equal(worker.messages.filter(x=>x.message.type==='output-consumed').length,120);
 fx.stop();assert.equal(s.raw.stopped,false);
});

test('input ownership transfers one frame at a time and output uses independent pixels',async()=>{
 const s=setup(),pending=s.start(),worker=s.workers[0];
 const first={close(){this.closed=true}},second={close(){this.closed=true}};s.push(first);await new Promise(r=>setImmediate(r));
 assert.equal(worker.messages.at(-1).transfer[0],first);assert.equal(first.closed,undefined);
 s.push(second);await new Promise(r=>setImmediate(r));assert.equal(worker.messages.filter(x=>x.message.type==='input').length,1);
 worker.reply({type:'input-consumed'});await new Promise(r=>setImmediate(r));assert.equal(worker.messages.at(-1).message.frame,second);
 const result={pixels:new Uint8ClampedArray(16),width:2,height:2};worker.reply({type:'output',frame:result});await new Promise(r=>setImmediate(r));assert.equal(s.written[0].data,result.pixels);assert.equal(worker.messages.at(-1).message.type,'output-consumed');
 worker.reply({type:'ready'});const pipeline=await pending;pipeline.stop();
});

test('worker channel waits for output consumption and releases pending frames on cancel',async()=>{
 const messages=[],channel=createFrameChannel({postMessage:(message,transfer)=>messages.push({message,transfer})});
 const input={close(){this.closed=true}};channel.push(input);assert.equal((await channel.readable.getReader().read()).value,input);
 const output={pixels:new Uint8ClampedArray(16),width:2,height:2};let completed=false;const pending=channel.writable.getWriter().write(output).then(()=>completed=true);await new Promise(r=>setImmediate(r));assert.equal(completed,false);assert.equal(messages[0].transfer[0],output.pixels.buffer);channel.consumed();await pending;assert.equal(completed,true);
 const queued={close(){this.closed=true}};channel.push(queued);await channel.readable.getReader().cancel();assert.equal(queued.closed,true);
});
