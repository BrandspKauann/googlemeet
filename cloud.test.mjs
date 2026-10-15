import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createCloudHandler} from './cloud/handler.mjs';

test('PostgreSQL cloud API isolates rooms, persists sessions, pages encrypted speech and deduplicates retries',async()=>{
 const db=new PGlite();await db.exec(fs.readFileSync(new URL('./db/schema.sql',import.meta.url),'utf8'));let handler=createCloudHandler(()=>db);const app=http.createServer((q,s)=>handler(q,s));await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port;
 async function req(p,b,token,cookie){const res=await fetch(base+'/api/'+p,{method:b===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{})},...(b===undefined?{}:{body:JSON.stringify(b)})});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]}}
 try{
  const login=await req('auth',{mode:'register',name:'Professora',email:'cloud@example.test',password:'test-password'});assert.equal(login.status,200);const cookie=login.cookie;
  const r=(await req('rooms',{title:'Aula privada',language:'pt',targetLanguage:'zh',name:'Nome escolhido na aula'},null,cookie)).data;assert.equal(r.encrypted,true);assert.equal(r.transcripts,undefined);assert.equal(r.you.name,'Nome escolhido na aula');assert.equal(r.teacherLanguage,'pt');assert.equal(r.studentLanguage,'zh');const route='rooms/'+r.id;
  assert.equal((await req('rooms',{language:'pt',targetLanguage:'invalid'},null,cookie)).status,400);
  const info=(await req(route+'/info')).data;assert.equal(info.studentLanguage,'zh');
  // Even a modified client cannot override the teacher's selected student language.
  const joined=(await req(route+'/join',{name:'Aluno',language:'en'})).data;assert.equal(joined.you.language,'zh');assert.equal((await req(route+'/transcripts',undefined,joined.token)).status,403);
  assert.equal((await req(route+'/admit',{id:joined.you.id,accept:true},joined.token)).status,403);await req(route+'/admit',{id:joined.you.id,accept:true},r.token);
  const second=(await req('rooms',{title:'Outra professora'},null,cookie)).data;assert.equal((await req(route+'/state',undefined,second.token)).status,401);
  assert.equal((await req(route+'/transcript',{text:'Nunca salvar em claro'},r.token)).status,400);
  const raw=webcrypto.getRandomValues(new Uint8Array(32)),key=await webcrypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
  const phrase='Olá, tudo bem? Minha aula deve ficar privada.';
  async function speech(clientId){const iv=webcrypto.getRandomValues(new Uint8Array(12));const encrypted=await webcrypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(r.id+':'+r.you.id+':'+clientId)},key,new TextEncoder().encode(JSON.stringify({text:phrase,kind:'speech'})));return {clientId,capturedAt:new Date().toISOString(),payload:{v:1,algorithm:'AES-GCM',iv:Buffer.from(iv).toString('base64'),ciphertext:Buffer.from(encrypted).toString('base64')}}}
  const b=await speech('unique-one');const replies=await Promise.all([req(route+'/transcript',b,r.token),req(route+'/transcript',b,r.token)]);assert.equal(replies[0].status,200);assert.equal(replies[0].data.id,replies[1].data.id);assert.equal(replies[0].data.text,undefined);
  const stored=(await db.query('SELECT payload FROM ag_transcripts')).rows;assert.equal(stored.length,1);assert.equal(JSON.stringify(stored).includes(phrase),false);
  const decoder=new TextDecoder();const opened=await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(stored[0].payload.iv,'base64'),additionalData:new TextEncoder().encode(r.id+':'+r.you.id+':unique-one')},key,Buffer.from(stored[0].payload.ciphertext,'base64'));assert.equal(JSON.parse(decoder.decode(opened)).text,phrase);
  const nextSeq=replies[0].data.seq;assert.equal((await req(route+'/transcripts?after='+nextSeq,undefined,joined.token)).data.records.length,0);
  for(let i=0;i<105;i++)await req(route+'/transcript',await speech('speech-'+i),r.token);
  const page=(await req(route+'/transcripts?after=0',undefined,joined.token)).data;assert.equal(page.records.length,100);assert.equal(page.more,true);const tail=(await req(route+'/transcripts?after='+page.cursor,undefined,joined.token)).data;assert.equal(tail.records.length,6);assert.equal(tail.more,false);
  const latest=(await req(route+'/transcripts?latest=true',undefined,joined.token)).data;assert.equal(latest.records.length,100);assert.equal(latest.more,true);
  const polling=(await req(route+'/events?since=0',undefined,joined.token)).data;assert.equal(polling.state.transcripts,undefined);assert.equal(JSON.stringify(polling).includes(phrase),false);
  handler=createCloudHandler(()=>db);assert.equal((await req('me',undefined,null,cookie)).status,200);assert.equal((await req(route+'/state',undefined,joined.token)).data.studentLanguage,'zh');
  await req(route+'/media',{microphone:true},joined.token);
  assert.equal((await req(route+'/end',{},joined.token)).status,403);const ending=(await req(route+'/end',{},r.token)).data;assert.equal(ending.ending,true);
  // A slower Whisper job may still be draining after the previous 30-second deadline.
  await db.query("UPDATE ag_rooms SET end_requested_at=end_requested_at-interval '1 minute',end_deadline=end_deadline-interval '1 minute' WHERE id=$1",[r.id]);
  await req(route+'/state',undefined,joined.token);assert.equal((await req(route+'/state',undefined,r.token)).data.ended,false);
  await req(route+'/flush',{},joined.token);assert.equal((await req(route+'/state',undefined,r.token)).data.ended,true);
  const late=await req(route+'/transcript',await speech('recognized-before-close'),r.token);assert.equal(late.status,200);assert.equal((await req(route+'/join',{name:'late'})).status,409);
 }finally{await new Promise(r=>app.close(r));await db.close()}
});
