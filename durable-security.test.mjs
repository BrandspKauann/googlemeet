import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {indexedDB} from 'fake-indexeddb';
const code=name=>fs.readFileSync(new URL('./dist/'+name,import.meta.url),'utf8');
test('IndexedDB queue remains after a script reload and removes only confirmed records',async()=>{
 const env=()=>({indexedDB,window:{},Promise,Error});const a=env();vm.runInNewContext(code('durable.js'),a);await a.window.durableQueue.put({id:'room:user:one',clientId:'one',roomId:'room',memberId:'user',body:{payload:{ciphertext:'opaque'}}});
 const b=env();vm.runInNewContext(code('durable.js'),b);const saved=await b.window.durableQueue.list('room','user');assert.equal(saved.length,1);assert.equal(saved[0].body.payload.ciphertext,'opaque');assert.equal((await b.window.durableQueue.list('room','another')).length,0);await b.window.durableQueue.remove('room:user:one');assert.equal((await a.window.durableQueue.list('room','user')).length,0);
});
test('browser room keys remain out of network requests and ciphertext detects tampering',async()=>{
 const nodes=new Map(),access=new Map();const el=()=>({hidden:false,append(){},setAttribute(){},showModal(){},close(){},click(){},value:'',textContent:''});const get=id=>{if(!nodes.has(id))nodes.set(id,el());return nodes.get(id)};
 const network=[];const environment={document:{createElement:el,createTextNode:t=>({textContent:t}),querySelector:el,getElementById:get,body:el()},window:{durableQueue:{async access(id){return access.get(id)},async saveAccess(row){access.set(row.roomId,row)}}},fetch:async(url,options)=>{network.push({url,options});return {ok:true,json:async()=>({encrypted:true})}},crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,URLSearchParams,location:{hash:''},btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),URL,Blob,setTimeout,sessionStorage:{setItem(){}}};
 vm.runInNewContext(code('security.js'),environment);const api=environment.window.roomSecurity;await api.init();await api.create();const room='a'.repeat(48),member='b'.repeat(48);await api.activate(room,member,'c'.repeat(48));const body=await api.encode({clientId:'one',capturedAt:new Date().toISOString(),text:'Olá professora, posso perguntar?',kind:'speech'});assert.equal(body.text,undefined);assert.equal(JSON.stringify(body).includes('professora'),false);
 const restored=await api.response({id:'test',memberId:member,clientId:'one',payload:body.payload});assert.equal(restored.text,'Olá professora, posso perguntar?');assert.equal(network.length,1);assert.equal(network[0].url,'/api/config');assert.match(api.invitation('https://example.test/?room='+room),/#k=/);
 const quoted=await api.encode({clientId:'quoted',text:'A palavra “carro” tem quantas letras?',rawText:'A palavra carro tem quantas letras?',kind:'speech'});const opened=await api.response({memberId:member,clientId:'quoted',payload:quoted.payload});assert.equal(opened.rawText,'A palavra carro tem quantas letras?');assert.equal(opened.text,'A palavra “carro” tem quantas letras?');assert.equal(JSON.stringify(quoted).includes('carro'),false);
 const altered={...body.payload,ciphertext:'AAAA'+body.payload.ciphertext.slice(4)};await assert.rejects(()=>api.response({memberId:member,clientId:'one',payload:altered}),/chave|alterados/);
 await assert.rejects(()=>api.response({memberId:'different',clientId:'one',payload:body.payload}),/chave|alterados/);
});
