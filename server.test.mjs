import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from './server.mjs';
import http from 'node:http';
test('accounts, approval, private signaling, transcript deduplication and final export survive restart',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'aula-test-'));let server=createApp(directory);await new Promise(r=>server.listen(0,'127.0.0.1',r));let base='http://127.0.0.1:'+server.address().port;let cookie='';
 async function request(p,b,token,withCookie=false){const res=await fetch(base+p,{method:b===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(withCookie?{Cookie:cookie}:{})},...(b===undefined?{}:{body:JSON.stringify(b)})});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')}}
 try{
  const auth=await request('/api/auth',{mode:'register',email:'teacher@example.test',name:'Professora',password:'test-password-2026'});assert.equal(auth.status,200);cookie=auth.cookie.split(';')[0];
  assert.equal((await request('/api/auth',{mode:'login',email:'teacher@example.test',password:'wrong-password'})).status,401);
  const created=await request('/api/rooms',{title:'Teste',language:'pt'},undefined,true);assert.equal(created.status,200);const teacher=created.data.token;const prefix='/api/rooms/'+created.data.id;
  const joined=await request(prefix+'/join',{name:'Aluno 李',language:'zh'});const student=joined.data.token;assert.equal(joined.data.you.status,'pending');
  assert.equal((await request(prefix+'/transcript',{text:'não permitido'},student)).status,403);
  assert.equal((await request(prefix+'/admit',{id:joined.data.you.id,accept:true},student)).status,403);
  assert.equal((await request(prefix+'/admit',{id:joined.data.you.id,accept:true},teacher)).status,200);
  const t=await request(prefix+'/transcript',{text:'Bom dia',clientId:'one'},teacher);assert.equal(t.status,200);assert.equal(t.data.name,'Professora');assert.equal(t.data.language,'pt');
  await request(prefix+'/transcript',{text:'Bom dia',clientId:'one'},teacher);
  await request(prefix+'/transcript',{text:'你好',kind:'typed'},student);
  assert.equal((await request(prefix+'/state',undefined,student)).data.transcripts.length,2);
  await request(prefix+'/signal',{to:joined.data.you.id,type:'offer',payload:{sdp:'test'}},teacher);
  const ownEvents=await request(prefix+'/events',undefined,teacher);const studentEvents=await request(prefix+'/events',undefined,student);assert.equal(ownEvents.data.events.some(e=>e.type==='signal'),false);assert.equal(studentEvents.data.events.some(e=>e.type==='signal'),true);
  assert.equal((await request(prefix+'/end',{},student)).status,403);assert.equal((await request(prefix+'/end',{},teacher)).status,200);
  assert.equal((await request(prefix+'/transcript',{text:'late'},teacher)).status,409);assert.equal((await request(prefix+'/join',{name:'late'},undefined)).status,409);
  assert.equal((await request(prefix+'/state',undefined,'bad-token')).status,401);
  await new Promise(r=>server.close(r));server=createApp(directory);await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
  const saved=await request(prefix+'/state',undefined,student);assert.equal(saved.data.transcripts.length,2);assert.equal(saved.data.ended,true);
  assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(directory,'store.json'),'utf8'))).includes('test-password-2026'),false);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(directory,{recursive:true,force:true})}
});
test('local ASR proxy enforces room approval, language and audio limits',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aula-asr-test-'));let seen;
 const backend=http.createServer(async(req,res)=>{if(req.url==='/health'){res.end(JSON.stringify({ready:true,model:'base',device:'cpu'}));return}let bytes=0;for await(const c of req)bytes+=c.length;seen={language:req.headers['x-language'],auth:req.headers.authorization,bytes};res.end(JSON.stringify({text:'Texto reconhecido',processingMs:15}))});
 await new Promise(r=>backend.listen(0,'127.0.0.1',r));const app=createApp(dir,{url:'http://127.0.0.1:'+backend.address().port,secret:'test-only-secret'});await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port;
 async function json(p,b,headers={}){const res=await fetch(base+p,{method:b===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},...(b===undefined?{}:{body:JSON.stringify(b)})});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')}}
 try{
  assert.equal((await json('/api/asr/health')).data.ready,true);
  const login=await json('/api/auth',{mode:'register',name:'Teste',email:'asr@example.test',password:'local-test-only'});const cookie=login.cookie.split(';')[0];const room=await json('/api/rooms',{language:'pt'},{Cookie:cookie});const prefix='/api/rooms/'+room.data.id;const joined=await json(prefix+'/join',{name:'Aluno',language:'zh'});
  const wav=Buffer.alloc(100);wav.write('RIFF');
  const post=async(token,data)=>fetch(base+prefix+'/asr',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'audio/wav','X-Language':'en'},body:data});
  assert.equal((await post(joined.data.token,wav)).status,403);assert.equal((await post('wrong',wav)).status,401);assert.equal((await post(room.data.token,Buffer.from('invalid'))).status,400);
  const response=await post(room.data.token,wav);assert.equal(response.status,200);assert.equal((await response.json()).text,'Texto reconhecido');assert.equal(seen.language,'pt');assert.equal(seen.auth,'Bearer test-only-secret');assert.equal(seen.bytes,100);
  assert.equal((await post(room.data.token,Buffer.alloc(2000001))).status,413);
  assert.equal((await json(prefix+'/state',undefined,{Authorization:'Bearer '+room.data.token})).data.transcripts.length,0);
 }finally{await new Promise(r=>app.close(r));await new Promise(r=>backend.close(r));fs.rmSync(dir,{recursive:true,force:true})}
});
test('speech punctuation preserves raw words, typed text and retry deduplication',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aula-punctuation-test-'));let responseText='Olá, tudo bem?';
 const backend=http.createServer(async(req,res)=>{for await(const _ of req){}await new Promise(r=>setTimeout(r,40));res.end(JSON.stringify({text:responseText}))});await new Promise(r=>backend.listen(0,'127.0.0.1',r));
 const app=createApp(dir,{url:'http://127.0.0.1:'+backend.address().port,secret:'test'});await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port;
 async function request(p,b,headers={}){const res=await fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(b)});return {data:await res.json(),cookie:res.headers.get('set-cookie')}}
 try{const login=await request('/api/auth',{mode:'register',name:'Teste',email:'punct@example.test',password:'test-password'});const room=await request('/api/rooms',{language:'pt'},{Cookie:login.cookie.split(';')[0]});const url='/api/rooms/'+room.data.id+'/transcript';const headers={Authorization:'Bearer '+room.data.token};
  const results=await Promise.all([request(url,{text:'olá tudo bem',clientId:'same'},headers),request(url,{text:'olá tudo bem',clientId:'same'},headers)]);assert.equal(results[0].data.id,results[1].data.id);assert.equal(results[0].data.text,'Olá, tudo bem?');assert.equal(results[0].data.rawText,'olá tudo bem');assert.equal(results[0].data.punctuation,'applied');
  assert.equal((await request(url,{text:'olá tudo bem',kind:'typed'},headers)).data.text,'olá tudo bem');
  assert.equal((await request(url,{text:'olá tudo bem',punctuation:false},headers)).data.text,'olá tudo bem');
  responseText='Eu não disse isso.';assert.equal((await request(url,{text:'olá tudo bem'},headers)).data.text,'olá tudo bem');
 }finally{await new Promise(r=>app.close(r));await new Promise(r=>backend.close(r));fs.rmSync(dir,{recursive:true,force:true})}
});
