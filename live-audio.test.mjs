import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){
 const window={},calls=[],previews=[];const env={window,Float32Array,Promise,Math,setTimeout,clearTimeout};
 for(const f of ['asr-utils.js','live-audio.js'])vm.runInNewContext(fs.readFileSync('dist/'+f,'utf8'),env);
 const live=window.liveAudio.create(16000,{transcribe:pcm=>new Promise((resolve,reject)=>calls.push({pcm,resolve,reject})),preview:p=>previews.push(p)});
 const voice=s=>live.push(new Float32Array(s*16000).fill(.1)),quiet=s=>live.push(new Float32Array(s*16000));return {live,calls,previews,voice,quiet};
}
test('incremental recognition starts during speech, limits pending work and reuses an exact final snapshot',async()=>{
 const s=setup();s.quiet(10);await tick();assert.equal(s.calls.length,0);s.voice(1);await tick();assert.equal(s.calls.length,0);s.voice(.6);await tick();assert.equal(s.calls.length,1);
 s.quiet(.35);await tick();assert.equal(s.calls.length,1);s.calls[0].resolve({text:'你好'});await tick();assert.equal(s.previews[0].text,'你好');
 const final=s.live.finish();assert.equal((await final.match).text,'你好');await final.wait;s.live.abort();
});
test('sliding snapshots remain bounded, and a newer voice tail prevents reusing an incomplete result',async()=>{
 const s=setup();s.voice(2);await tick();for(let i=0;i<10;i++)s.voice(1);assert.equal(s.calls.length,1);s.calls[0].resolve({text:'old'});await tick();s.voice(.1);await tick();assert.equal(s.calls.length,2);assert.equal(s.calls[1].pcm.length,128000);
 s.calls[1].resolve({text:'new'});await tick();assert.equal(s.previews.at(-1).rolling,true);assert.equal(s.live.finish().match,null);s.live.abort();
});
test('turn completion waits for recognition and suppresses stale preview callbacks after finish or abort',async()=>{
 const s=setup();s.voice(2);await tick();s.voice(.5);const final=s.live.finish();assert.equal(final.match,null);let completed=false;final.wait.then(()=>completed=true);await tick();assert.equal(completed,false);s.calls[0].resolve({text:'late'});await final.wait;assert.equal(s.previews.length,0);
 s.voice(2);await tick();s.live.abort();s.calls[1].resolve({text:'aborted'});await tick();assert.equal(s.previews.length,0);
});
test('preview request failure remains recoverable and a fresh request can follow a short pause',async()=>{
 const s=setup();s.voice(2);await tick();s.calls[0].reject(Error('busy'));await tick();s.voice(.1);s.quiet(.35);await tick();assert.equal(s.calls.length,2);s.calls[1].resolve({text:'recovered'});await tick();assert.equal(s.previews.at(-1).text,'recovered');s.live.abort();
});
