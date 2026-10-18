import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup(){
 const elements=new Map(),workers=[],clones=[],outputs=[],published=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',attributes:{},setAttribute(k,v){this.attributes[k]=v},after(){}});return elements.get(id)};
 class Worker{constructor(){workers.push(this);this.messages=[]}postMessage(message,transfer){this.messages.push(message);if(message.type==='start'){this.message=message;this.transfer=transfer}}terminate(){this.terminated=true}reply(data){this.onmessage({data})}}
 class Processor{constructor(options){this.options=options;this.readable={}}}
 class Generator{constructor(){outputs.push(this);this.writable={}}stop(){this.stopped=true}}
 class Stream{constructor(tracks){this.tracks=tracks}}
 const raw={getVideoTracks:()=>[{clone(){const track={stopped:false,stop(){this.stopped=true}};clones.push(track);return track}}]};
 const document={createElement:()=>({hidden:false,textContent:'',attributes:{},set id(value){elements.set(value,this)},setAttribute(k,v){this.attributes[k]=v},after(){},append(){}}),querySelector:()=>({prepend(){}}),getElementById:element};
 const window={MediaStreamTrackProcessor:Processor,MediaStreamTrackGenerator:Generator,OffscreenCanvas:{}};
 vm.runInNewContext(fs.readFileSync('dist/background-blur.js','utf8'),{document,window,Worker,MediaStreamTrackProcessor:Processor,MediaStreamTrackGenerator:Generator,MediaStream:Stream,AbortController,Error,setTimeout,clearTimeout});
 return {window,raw,workers,clones,outputs,published,slider:element('backgroundBlurIntensity'),controls:element('backgroundBlurControls'),button:element('backgroundBlur'),status:element('backgroundBlurStatus'),publish:async stream=>published.push(stream)};
}

test('blur publishes only prepared output and owns cloned/output tracks, not the camera',async()=>{
 const s=setup();await s.window.backgroundBlur.attach(s.raw,s.publish);assert.equal(s.published.at(-1),s.raw);
 const starting=s.button.onclick();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(s.published.at(-1),null);
 const worker=s.workers[0];assert.equal(worker.transfer.length,2);worker.reply({type:'ready'});await starting;
 assert.equal(s.published.at(-1).tracks[0],s.outputs[0]);assert.equal(s.button.attributes['aria-pressed'],'true');
 s.window.backgroundBlur.detach();assert.equal(s.clones[0].stopped,true);assert.equal(s.outputs[0].stopped,true);assert.equal(worker.terminated,true);
});

test('turning blur off cancels preparation and restores the current beauty/input stream',async()=>{
 const s=setup();await s.window.backgroundBlur.attach(s.raw,s.publish);const starting=s.button.onclick();await new Promise(resolve=>setTimeout(resolve,0));
 await s.button.onclick();await starting;assert.equal(s.published.at(-1),s.raw);assert.equal(s.clones[0].stopped,true);assert.equal(s.workers[0].terminated,true);assert.equal(s.button.attributes['aria-pressed'],'false');
});

test('blur failure never silently sends the unblurred background',async()=>{
 const s=setup();await s.window.backgroundBlur.attach(s.raw,s.publish);const starting=s.button.onclick();await new Promise(resolve=>setTimeout(resolve,0));s.workers[0].reply({type:'error',message:'Model unavailable'});await starting;
 assert.equal(s.published.at(-1),null);assert.match(s.status.textContent,/Não foi possível/);assert.equal(s.window.backgroundBlur.enabled(),true);
 await s.button.onclick();assert.equal(s.published.at(-1),s.raw);
});


test('intensity changes live without replacing the output track or restarting preparation',async()=>{
 const s=setup();s.window.backgroundBlur.configure({you:{status:'accepted'}});await s.window.backgroundBlur.attach(s.raw,s.publish);
 const starting=s.button.onclick();await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(s.workers[0].message.intensity,50);
 s.slider.value='23';s.slider.oninput(); // Adjustment during preparation must survive readiness.
 s.workers[0].reply({type:'ready'});await starting;
 assert.equal(s.workers[0].messages.at(-1).value,23);
 const sent=s.published.at(-1),count=s.published.length;
 for(const value of ['1','100']){s.slider.value=value;s.slider.oninput();assert.equal(s.workers[0].messages.at(-1).value,Number(value));}
 assert.equal(s.workers.length,1);assert.equal(s.published.length,count);assert.equal(s.published.at(-1),sent);
 assert.equal(s.outputs[0].stopped,undefined);assert.equal(s.controls.hidden,false);
 await s.button.onclick();assert.equal(s.controls.hidden,true);
 s.window.backgroundBlur.detach();
});
