import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('./dist/room.js',import.meta.url),'utf8');
function setup(remote=true){
  const elements=new Map(),requests=[],captions=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{hidden:false,textContent:''});return elements.get(id)};
  let unavailable=false,downloads=0;
  const window={captionUI:{set(...args){captions.push(args)}},languageRouting:{translation:()=>({provider:'browser',pivot:'en'})}};
  Object.defineProperty(window,'Translator',{get(){downloads++;throw new Error('Browser translation must not be accessed')}});
  const context={window,state:{teacherLanguage:'zh',studentLanguage:'pt'},profile:{remoteTranslation:remote},viewLang:'pt',names:{zh:'中文 — Mandarim',pt:'Português'},translators:new Map(),records:new Map(),translationLanes:new Map(),translationQueue:Promise.resolve(),$:element,
    recordRole:record=>record.data.role,latestRecord:role=>[...context.records.values()].filter(record=>record.data.role===role).at(-1),
    api:async(action,body)=>{requests.push({action,body});if(unavailable)throw new Error('Servidor de tradução indisponível.');return {text:'Olá. Quantas letras tem a palavra “carro”?' };}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function configureTranslationUI('),source.indexOf("$('prepareTranslate').onclick=")),context);
  vm.runInContext(source.slice(source.indexOf('function queueTranslation('),source.indexOf('async function exportTranscript(')),context);
  return {context,element,requests,captions,downloads:()=>downloads,setOffline:value=>unavailable=value};
}
function record(text='你好。“汽车”这个词有几个字？'){
  return {data:{id:'1',language:'zh',role:'teacher',name:'Teacher',text,kind:'speech'},node:{textContent:''},translations:{}};
}

test('remote translation starts without browser Translator or preparation',async()=>{
  const s=setup();s.context.configureTranslationUI();
  assert.equal(s.element('prepareTranslate').hidden,true);
  assert.equal(s.element('quickTranslate').hidden,true);
  assert.match(s.element('translationPrivacy').textContent,/conexão protegida.+criptografada/);
  const r=record();s.context.records.set(r.data.id,r);await s.context.queueTranslation(r);
  assert.equal(s.downloads(),0);assert.equal(s.requests.length,1);
  assert.equal(s.requests[0].action,'translate');
  assert.equal(s.requests[0].body.text,r.data.text);assert.equal(s.requests[0].body.source,'zh');assert.equal(s.requests[0].body.target,'pt');
  assert.equal(r.translations.pt,'Olá. Quantas letras tem a palavra “carro”?');
  assert.equal(r.node.textContent,r.translations.pt);assert.equal(s.captions.at(-1)[1],r.translations.pt);
});

test('server failure preserves original and exposes retry without downloading fallback',async()=>{
  const s=setup(),r=record();s.context.records.set(r.data.id,r);s.setOffline(true);
  await s.context.queueTranslation(r);
  assert.equal(s.downloads(),0);assert.match(r.node.textContent,/original preservado/);
  assert.equal(s.captions.at(-1)[1],r.data.text);assert.equal(s.element('quickTranslate').hidden,false);
  assert.equal(r.translations.pt,undefined);
  s.setOffline(false);await s.context.queueTranslation(r);
  assert.equal(s.requests.length,2);assert.equal(s.downloads(),0);assert.equal(s.element('quickTranslate').hidden,true);
  assert.equal(r.translations.pt,'Olá. Quantas letras tem a palavra “carro”?');
});

test('same-language text stays local and remote translator is reused',async()=>{
  const s=setup();const identity=await s.context.getTranslator('pt','pt');
  assert.equal(await identity.translate('Texto original.'),'Texto original.');assert.equal(s.requests.length,0);
  const first=await s.context.getTranslator('zh','pt'),second=await s.context.getTranslator('zh','pt');
  assert.equal(first,second);assert.equal(s.downloads(),0);
});

test('empty server response is rejected without replacing original text',async()=>{
  const s=setup(),r=record();s.context.records.set(r.data.id,r);s.context.api=async()=>({text:'  '});
  await s.context.queueTranslation(r);
  assert.equal(r.translations.pt,undefined);assert.equal(s.captions.at(-1)[1],r.data.text);
  assert.match(s.element('translationStatus').textContent,/não retornou a tradução/);
});


test('speaker sees their original first and the other assigned language underneath',async()=>{
 const s=setup();s.context.viewLang='zh';const r=record();s.context.records.set(r.data.id,r);await s.context.queueTranslation(r);
 const shown=s.captions.at(-1);assert.equal(shown[1],r.data.text);assert.equal(shown[2],r.translations.pt);assert.equal(shown[6].primary,'zh');assert.equal(shown[6].secondary,'pt');assert.equal(s.requests[0].body.target,'pt');
});
test('listener sees translation first and unchanged source underneath',async()=>{
 const s=setup();const r=record();s.context.records.set(r.data.id,r);await s.context.queueTranslation(r);
 const shown=s.captions.at(-1);assert.equal(shown[1],r.translations.pt);assert.equal(shown[2],r.data.text);assert.equal(shown[6].primary,'pt');assert.equal(shown[6].secondary,'zh');
});
