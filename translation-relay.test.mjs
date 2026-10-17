import test from 'node:test';
import assert from 'node:assert/strict';
import {createTranslationRelay} from './cloud/translation-relay.mjs';
const getConfig=()=>({url:'https://voice.example.test/',secret:'private-key',enabled:'1'});
test('translation relay is disabled unless explicitly enabled, and health never exposes upstream details',async()=>{
 for(const enabled of [undefined,false,'0','false']){
  const relay=createTranslationRelay({getConfig:()=>({...getConfig(),enabled}),fetcher:async()=>{throw Error('must not call')}});
  assert.equal(relay.configured(),false);assert.equal((await relay.health()).ready,false);await assert.rejects(relay.translate('Olá','pt','zh'),e=>e.status===503);
 }
 const relay=createTranslationRelay({getConfig,fetcher:async(url,options)=>{assert.equal(url,'https://voice.example.test/translation/health');assert.equal(options.headers.Authorization,'Bearer private-key');return Response.json({ready:true,model:'opus-mt',languages:['pt','zh','invalid'],secret:'private-key',private:'details'})}});
 assert.deepEqual(await relay.health(),{ready:true,cloud:true,model:'opus-mt',languages:['pt','zh'],error:null});
});
test('translation relay authenticates only upstream and preserves assigned languages in its response',async()=>{
 let called=0;const relay=createTranslationRelay({getConfig,fetcher:async(url,options)=>{
  called++;assert.equal(url,'https://voice.example.test/translate');assert.equal(options.headers.Authorization,'Bearer private-key');assert.equal(options.headers['Content-Type'],'application/json');assert.deepEqual(JSON.parse(options.body),{text:'你好，老师。',source:'zh',target:'pt'});assert.ok(options.signal instanceof AbortSignal);
  return Response.json({text:'Olá, professora.',source:'en',target:'es',model:'opus-mt',processingMs:123,private:'private-key'});
 }});
 assert.deepEqual(await relay.translate('你好，老师。','zh','pt'),{text:'Olá, professora.',source:'zh',target:'pt',model:'opus-mt',processingMs:123});assert.equal(called,1);
 assert.deepEqual(await relay.translate('Texto original.','pt','pt'),{text:'Texto original.',source:'pt',target:'pt',model:'identity',processingMs:0});assert.equal(called,1);
});
test('translation relay validates text and languages before contacting server',async()=>{
 let called=0;const relay=createTranslationRelay({getConfig,fetcher:async()=>{called++;return Response.json({text:'x'})}});
 for(const [text,source,target,status] of [[' ','pt','zh',400],[null,'pt','zh',400],['x'.repeat(2001),'pt','zh',413],['x','ru','zh',400],['x','zh','ru',400]])await assert.rejects(relay.translate(text,source,target),e=>e.status===status);
 assert.equal(called,0);
});
test('translation relay reports offline and busy service without revealing private errors',async()=>{
 const relay=createTranslationRelay({getConfig,fetcher:async()=>{throw Error('private-key and upstream details')}});assert.equal((await relay.health()).ready,false);await assert.rejects(relay.translate('Olá','pt','zh'),e=>e.status===503&&!e.message.includes('private'));
 const busy=createTranslationRelay({getConfig,fetcher:async()=>new Response('private-key',{status:429})});await assert.rejects(busy.translate('Olá','pt','zh'),e=>e.status===429&&!e.message.includes('private'));
 for(const output of [{text:''},{text:'x'.repeat(12001)},{text:123}]){const invalid=createTranslationRelay({getConfig,fetcher:async()=>Response.json(output)});await assert.rejects(invalid.translate('Olá','pt','zh'),e=>e.status===502);}
});
