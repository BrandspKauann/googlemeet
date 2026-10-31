import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createFrameClock} from './browser-beauty/frame-clock.js';
import {createFrameChannel} from './browser-beauty/frame-channel.js';
function setup(){
  const workers=[],clones=[],outputs=[],statuses=[],errors=[],intervals=new Map();let now=0,sequence=0,pendingRead;const inputs=[],written=[];
  const reader={read:()=>inputs.length?Promise.resolve({done:false,value:inputs.shift()}):new Promise(resolve=>pendingRead=resolve),cancel:async()=>{for(const frame of inputs.splice(0))frame.close();pendingRead?.({done:true});pendingRead=null;}};
  const raw={stopped:false,clone(){const track={stopped:false,stop(){this.stopped=true}};clones.push(track);return track;}};
  class Worker{constructor(){workers.push(this)}postMessage(message,transfer){(this.messages||=[]).push({message,transfer});if(message.type==='stop')this.reply({type:'stopped'})}terminate(){this.terminated=true}reply(data){this.onmessage({data})}}
  class Generator{constructor(){this.writable={getWriter:()=>({write:async frame=>written.push(frame),abort:async()=>{}})};outputs.push(this)}stop(){this.stopped=true}}
  class Processor{constructor(options){this.readable={getReader:()=>reader};this.options=options}}
  class Stream{constructor(tracks){this.tracks=tracks}}
  const window={createCompatibleBeauty:async()=>{throw Error('GPU unavailable')},MediaStreamTrackProcessor:Processor,MediaStreamTrackGenerator:Generator,OffscreenCanvas:{}};
  vm.runInNewContext(fs.readFileSync('dist/worker-beauty.js','utf8'),{window,Worker,MediaStreamTrackProcessor:Processor,MediaStreamTrackGenerator:Generator,MediaStream:Stream,Error,setTimeout,clearTimeout,Date:{now:()=>now},setInterval:fn=>{const id=++sequence;intervals.set(id,fn);return id},clearInterval:id=>intervals.delete(id)});
  const start=signal=>window.createWorkerBeauty({getVideoTracks:()=>[raw]},{smooth:68},m=>statuses.push(m),e=>errors.push(e.message),()=>false,signal);
  return {start,raw,workers,clones,outputs,statuses,errors,window,written,push(frame){if(pendingRead){const resolve=pendingRead;pendingRead=null;resolve({done:false,value:frame})}else inputs.push(frame)},tick(ms){now+=ms;for(const fn of [...intervals.values()])fn()},intervals};
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
 const s=setup();s.window.MediaStreamTrackGenerator=undefined;let called=0;
 const compatible={stream:{compatible:true},stop(){}};
 s.window.createCompatibleBeauty=async()=>{called++;return compatible};
 assert.equal(await s.start(),compatible);assert.equal(called,1);assert.equal(s.workers.length,0);assert.equal(s.raw.stopped,false);
});


test('stalled beauty frames trigger one recovery and release the failed output, not the camera',async()=>{
 const s=setup(),pending=s.start();s.workers[0].reply({type:'ready'});await pending;
 s.tick(2000);assert.equal(s.errors.length,0);
 const frame={close(){}};s.workers[0].reply({type:'output',frame});await new Promise(r=>setImmediate(r));
 s.tick(2000);assert.equal(s.errors.length,0);
 // A live Worker alone is not evidence of frames reaching the camera output.
 s.workers[0].reply({type:'frame'});s.tick(1000);
 assert.equal(s.errors.length,1);assert.match(s.errors[0],/parou de atualizar/);
 assert.equal(s.workers[0].terminated,true);assert.equal(s.outputs[0].stopped,true);assert.equal(s.raw.stopped,false);
 s.tick(10000);assert.equal(s.errors.length,1);assert.equal(s.intervals.size,0);
});


test('beauty keeps advancing when camera timestamps repeat or reset',()=>{
 const clock=createFrameClock();
 const cameraTimes=[0,0,0,-100,900000,20,20];
 const output=cameraTimes.map((cameraTimestamp,i)=>({cameraTimestamp,timestamp:clock(i*55)}));
 assert.equal(output.filter(f=>f.timestamp!==null).length,cameraTimes.length);
 assert.ok(output.every((f,i)=>i===0||f.timestamp>output[i-1].timestamp));
});

test('frame clock bounds work using arrival time and rejects invalid arrivals',()=>{
 const clock=createFrameClock(20);
 assert.equal(clock(NaN),null);assert.equal(clock(0),0);assert.equal(clock(10),null);assert.equal(clock(49),null);assert.equal(clock(50),50000);assert.equal(clock(100),100000);
});

test('24 and 30 fps sources retain a 20 fps cadence instead of dropping every other frame',()=>{
 for(const inputRate of [24,30]){
  const clock=createFrameClock(20),timestamps=[];
  for(let i=0;i<inputRate*5;i++){const timestamp=clock(i*1000/inputRate);if(timestamp!==null)timestamps.push(timestamp);}
  assert.ok(timestamps.length>=99&&timestamps.length<=101,`${inputRate} fps source produced ${timestamps.length} frames in five seconds`);
  assert.ok(timestamps.every((t,i)=>!i||t>timestamps[i-1]));
 }
});


test('input ownership transfers one frame at a time and received output is closed after writing',async()=>{
 const s=setup(),pending=s.start(),worker=s.workers[0];
 const first={close(){this.closed=true}},second={close(){this.closed=true}};s.push(first);await new Promise(r=>setImmediate(r));
 assert.equal(worker.messages.at(-1).transfer[0],first);assert.equal(first.closed,undefined);
 s.push(second);await new Promise(r=>setImmediate(r));assert.equal(worker.messages.filter(x=>x.message.type==='input').length,1);
 worker.reply({type:'input-consumed'});await new Promise(r=>setImmediate(r));assert.equal(worker.messages.at(-1).message.frame,second);
 const result={close(){this.closed=true}};worker.reply({type:'output',frame:result});await new Promise(r=>setImmediate(r));assert.equal(s.written[0],result);assert.equal(result.closed,true);assert.equal(worker.messages.at(-1).message.type,'output-consumed');
 worker.reply({type:'ready'});const pipeline=await pending;pipeline.stop();
});

test('worker channel waits for output consumption and releases pending frames on cancel',async()=>{
 const messages=[],channel=createFrameChannel({postMessage:(message,transfer)=>messages.push({message,transfer})});
 const input={close(){this.closed=true}};channel.push(input);assert.equal((await channel.readable.getReader().read()).value,input);
 const output={};let completed=false;const pending=channel.writable.getWriter().write(output).then(()=>completed=true);await new Promise(r=>setImmediate(r));assert.equal(completed,false);assert.equal(messages[0].transfer[0],output);channel.consumed();await pending;assert.equal(completed,true);
 const queued={close(){this.closed=true}};channel.push(queued);await channel.readable.getReader().cancel();assert.equal(queued.closed,true);
});
