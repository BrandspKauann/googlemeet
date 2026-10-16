import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup(){
  const videos=[],sent=[],listeners={};
  const doc={hidden:false,addEventListener:(name,fn)=>listeners[name]=fn,createElement:()=>{
    const callbacks=new Map();let id=0;
    const video={play:async()=>{},pause(){},requestVideoFrameCallback(fn){callbacks.set(++id,fn);return id},cancelVideoFrameCallback(id){callbacks.delete(id)},frame(){const batch=[...callbacks.values()];callbacks.clear();batch.forEach(fn=>fn())}};
    videos.push(video);return video;
  }};
  const context={window:{},setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync('dist/continuous-camera.js','utf8'),context);
  return {controller:new context.window.ContinuousCamera(doc),doc,videos,sent,publish:async stream=>sent.push(stream),change:hidden=>{doc.hidden=hidden;listeners.visibilitychange()}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('hidden camera bypasses canvas, restores only after fresh frames and preserves input tracks',async()=>{
  const s=setup();const preparing=s.controller.set('raw','filtered',s.publish);
  s.videos[0].frame();assert.deepEqual(s.sent,[]);s.videos[0].frame();await preparing;
  assert.deepEqual(s.sent,['filtered']);s.change(true);await tick();assert.equal(s.sent.at(-1),'raw');
  s.change(false);s.videos[1].frame();assert.equal(s.sent.at(-1),'raw');s.videos[1].frame();await tick();assert.equal(s.sent.at(-1),'filtered');s.controller.clear();
});
test('preparation completed in background sends raw and closing prevents restoration',async()=>{
  const s=setup();s.doc.hidden=true;await s.controller.set('raw','filtered',s.publish);assert.deepEqual(s.sent,['raw']);
  s.change(false);const video=s.videos[0];s.controller.clear();video.frame();video.frame();await tick();assert.deepEqual(s.sent,['raw']);assert.equal(video.srcObject,null);
});
test('hiding while waiting for fresh filtered frames cancels the pending switch',async()=>{
  const s=setup();const preparing=s.controller.set('raw','filtered',s.publish);s.change(true);await preparing;await tick();
  s.videos[0].frame();await tick();assert.deepEqual(s.sent,['raw']);s.controller.clear();
});
