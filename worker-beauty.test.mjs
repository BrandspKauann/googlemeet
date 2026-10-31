import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup(){
 let now=0,sequence=0,stopped=0,argumentsUsed;const intervals=new Map(),errors=[];
 const source={videoWidth:640,videoHeight:480,currentTime:0,getVideoPlaybackQuality:()=>({totalVideoFrames:12})};
 const track={stopped:false,getSettings:()=>({width:1280,height:720,frameRate:60,deviceId:'private-device',groupId:'private-group'})};
 const input={getVideoTracks:()=>[track]},output={stream:{native:true},stop(){stopped++},setValues(next){this.values=next}};
 const window={createCompatibleBeauty:async(...args)=>{argumentsUsed=args;args[6]('skin',source);args[6]('makeup',source);return output}};
 vm.runInNewContext(fs.readFileSync('dist/beauty-runtime.js','utf8'),{window,structuredClone,Date:{now:()=>now},Error,setInterval:fn=>{const id=++sequence;intervals.set(id,fn);return id},clearInterval:id=>intervals.delete(id)});
 return {window,input,track,output,source,errors,intervals,start:signal=>window.createBeauty(input,{smooth:68},()=>{},e=>errors.push(e.message),()=>false,signal),get args(){return argumentsUsed},get stopped(){return stopped},tick(ms){now+=ms;for(const fn of [...intervals.values()])fn()},frame(stage){argumentsUsed[6](stage,source)}};
}

test('restored runtime selects native combined renderer and preserves controls and original camera',async()=>{
 const s=setup(),fx=await s.start();assert.equal(s.args[0],s.input);assert.equal(s.args[1]().smooth,68);assert.equal(fx.stream.native,true);
 fx.setValues({smooth:55});assert.equal(s.output.values.smooth,55);fx.stop();fx.stop();assert.equal(s.stopped,1);assert.equal(s.track.stopped,false);assert.equal(s.intervals.size,0);
 const diagnostic=s.window.beautyDiagnostics();assert.equal(diagnostic.renderer,'native-dom');assert.equal(diagnostic.stages.skin.frames,1);assert.equal(diagnostic.camera.frameRate,60);assert.equal(diagnostic.camera.deviceId,undefined);assert.equal(diagnostic.camera.groupId,undefined);
});

test('abort after preparation stops the filter exactly once and removes its watchdog',async()=>{
 const s=setup(),controller=new AbortController(),fx=await s.start(controller.signal);controller.abort();fx.stop();assert.equal(s.stopped,1);assert.equal(s.intervals.size,0);assert.equal(s.track.stopped,false);
});

test('late completion after cancellation releases prepared filter without publishing it',async()=>{
 const s=setup(),controller=new AbortController();let resolve;s.window.createCompatibleBeauty=()=>new Promise(r=>resolve=r);
 const pending=s.start(controller.signal);controller.abort();resolve(s.output);assert.equal(await pending,null);assert.equal(s.stopped,1);assert.equal(s.intervals.size,0);
});

test('a stuck stage recovers even while the other native rendering stage is advancing',async()=>{
 const s=setup();await s.start();s.tick(2000);assert.equal(s.errors.length,0);s.frame('skin');s.frame('makeup');s.tick(2000);s.frame('skin');s.tick(1500);
 assert.equal(s.errors.length,1);assert.match(s.errors[0],/parou de atualizar/);assert.equal(s.stopped,1);assert.equal(s.track.stopped,false);assert.equal(s.intervals.size,0);
});

function scheduler(){
 const window={},videoCallbacks=new Map(),animations=new Map(),listeners=new Map(),workers=[];let id=0,now=0,drawn=0;
 const source={readyState:2,currentTime:0,requestVideoFrameCallback(fn){videoCallbacks.set(++id,fn);return id},cancelVideoFrameCallback(key){videoCallbacks.delete(key)}};
 const document={hidden:false,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 class Worker{constructor(){workers.push(this);this.messages=[]}postMessage(message){this.messages.push(message)}terminate(){this.terminated=true}}
 vm.runInNewContext(fs.readFileSync('dist/compatible-beauty.js','utf8'),{window,document,Worker,performance:{now:()=>now},requestAnimationFrame:fn=>{animations.set(++id,fn);return id},cancelAnimationFrame:key=>animations.delete(key)});
 const stop=window.followBeautyVideoFrames(source,()=>drawn++,error=>{throw error});
 const run=map=>{const [key,fn]=map.entries().next().value;map.delete(key);now++;fn()};
 return {stop,source,document,videoCallbacks,animations,listeners,workers,get drawn(){return drawn},video:()=>run(videoCallbacks),repaint:()=>run(animations)};
}

test('every camera callback renders even when currentTime stays zero, without an FPS quota',()=>{
 const s=scheduler();for(let i=0;i<120;i++)s.video();assert.equal(s.drawn,120);assert.equal(s.source.currentTime,0);s.stop();assert.equal(s.videoCallbacks.size,0);assert.equal(s.animations.size,0);assert.equal(s.listeners.size,0);assert.equal(s.workers[0].terminated,true);
});

test('display repaint provides recovery when native video callbacks never arrive',()=>{
 const s=scheduler();for(let i=0;i<10;i++)s.repaint();assert.equal(s.drawn,10);s.stop();
});

test('hidden-page clock requests drawing with one acknowledged tick and no video data',()=>{
 const s=scheduler();s.document.hidden=true;s.listeners.get('visibilitychange')();const worker=s.workers[0];assert.equal(worker.messages.at(-1).value,true);worker.onmessage();assert.equal(s.drawn,1);assert.equal(worker.messages.at(-1).type,'consumed');s.stop();
});
