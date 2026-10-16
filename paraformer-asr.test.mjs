import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup(){
  const workers=[];
  class Worker{
    constructor(){this.messages=[];workers.push(this);}
    postMessage(message,transfer){this.messages.push({message,transfer});}
    terminate(){this.terminated=true;}
    reply(data){this.onmessage({data});}
  }
  const context={window:{},Worker,Map,Set,Promise,Error,setTimeout,clearTimeout};
  vm.runInNewContext(fs.readFileSync('dist/paraformer-asr.js','utf8'),context);
  return {engine:context.window.paraformerASR,workers};
}

test('Paraformer requires preparation, shares one preparation and transfers PCM without HTTP',async()=>{
  const {engine,workers}=setup();
  await assert.rejects(engine.transcribe(new Float32Array(16),'zh'),/Preparar/);
  assert.equal(workers.length,0);
  const a=engine.prepare(),b=engine.prepare();assert.equal(a,b);
  const worker=workers[0];assert.equal(worker.messages.length,1);assert.equal(engine.ready(),false);
  const messages=[];engine.onProgress(message=>messages.push(message));worker.reply({type:'progress',message:'encoder: 50%'});assert.deepEqual(messages,['encoder: 50%']);assert.equal(engine.ready(),false);
  worker.reply({id:worker.messages[0].message.id,result:{ready:true}});await a;assert.equal(engine.ready(),true);
  const audio=new Float32Array(160),result=engine.transcribe(audio,'zh');const sent=worker.messages[1];assert.equal(sent.message.audio,audio.buffer);assert.equal(sent.transfer[0],audio.buffer);
  worker.reply({id:sent.message.id,result:{text:'你好',processingMs:20}});assert.equal((await result).text,'你好');engine.abort();
});

test('Paraformer abort and Worker failure reject pending jobs and ignore old replies',async()=>{
  const {engine,workers}=setup();
  const preparation=engine.prepare();const rejected=assert.rejects(preparation,/cancelada/);const old=workers[0];engine.abort('Preparação cancelada');await rejected;assert.equal(old.terminated,true);assert.equal(engine.ready(),false);
  old.reply({id:1,result:{ready:true}});assert.equal(engine.ready(),false);
  const retry=engine.prepare(),current=workers[1];current.reply({id:current.messages[0].message.id,result:{ready:true}});await retry;
  const job=engine.transcribe(new Float32Array(160),'zh'),failed=assert.rejects(job,/Falha no Paraformer/);current.onerror();await failed;assert.equal(engine.ready(),false);assert.equal(current.terminated,true);
});
