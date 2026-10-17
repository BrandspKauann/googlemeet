import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createASRRelay} from './cloud/asr-relay.mjs';
function wav(seconds=1){const b=Buffer.alloc(44+16000*seconds*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;}
function req(audio,headers={}){return Object.assign(Readable.from([audio]),{headers:{'content-type':'audio/wav',...headers}})}
test('Whisper relay authenticates upstream, preserves language and returns only transcript metadata',async()=>{
 const calls=[];const relay=createASRRelay({getConfig:()=>({url:'https://voice.example.test',secret:'private-key'}),fetcher:async(url,options)=>{calls.push({url,options});return Response.json(url.endsWith('/health')?{ready:true,model:'base',device:'cpu',private:'never expose'}:{text:'你好',model:'base',processingMs:100,private:'never expose'});}});
 assert.equal(relay.configured(),true);assert.equal((await relay.health()).private,undefined);
 const audio=wav(),result=await relay.transcribe(req(audio),'zh');assert.equal(result.text,'你好');assert.equal(result.language,'zh');assert.equal(result.private,undefined);assert.equal(calls[1].options.headers.Authorization,'Bearer private-key');assert.equal(calls[1].options.headers['X-Language'],'zh');assert.deepEqual(calls[1].options.body,audio);assert.ok(!JSON.stringify(result).includes('private-key'));
});
test('Whisper relay rejects non-WAV, oversized and overlong audio before contacting server',async()=>{
 let calls=0;const relay=createASRRelay({getConfig:()=>({url:'https://voice.example.test',secret:'private'}),fetcher:async()=>{calls++;return Response.json({text:''})}});
 for(const input of [req(Buffer.from('bad')),req(wav(),{'content-type':'application/json'}),req(wav(),{'content-length':'2000001'}),req(wav(13))])await assert.rejects(relay.transcribe(input,'pt'),error=>[400,413,415].includes(error.status));assert.equal(calls,0);
});
test('Whisper relay reports offline computer and busy engine without disclosing upstream details',async()=>{
 const relay=createASRRelay({getConfig:()=>({url:'https://voice.example.test',secret:'private'}),fetcher:async()=>{throw Error('private upstream details')}});assert.equal((await relay.health()).ready,false);await assert.rejects(relay.transcribe(req(wav()),'pt'),error=>error.status===503&&!error.message.includes('private'));
 const busy=createASRRelay({getConfig:()=>({url:'https://voice.example.test',secret:'private'}),fetcher:async()=>new Response('private',{status:429})});await assert.rejects(busy.transcribe(req(wav()),'pt'),error=>error.status===429&&!error.message.includes('private'));
});
