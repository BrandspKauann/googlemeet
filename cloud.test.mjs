import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {webcrypto,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createCloudHandler} from './cloud/handler.mjs';
import {createASRRelay} from './cloud/asr-relay.mjs';
import {createTranslationRelay} from './cloud/translation-relay.mjs';

test('cloud translation uses assigned viewer language, authorizes membership and does not persist plaintext',async()=>{
 const db=new PGlite();await db.exec(fs.readFileSync(new URL('./db/schema.sql',import.meta.url),'utf8'));const calls=[];
 const translationRelay=createTranslationRelay({getConfig:()=>({enabled:'1',url:'https://voice.example.test',secret:'translation-private-secret'}),fetcher:async(url,options)=>{calls.push({url,options});return Response.json(url.endsWith('/health')?{ready:true,model:'opus-mt',languages:['pt','zh'],secret:'translation-private-secret'}:{text:'你好，老师。',source:'es',target:'en',model:'opus-mt',processingMs:12,secret:'translation-private-secret'})}});
 const handler=createCloudHandler(()=>db,{translationRelay}),server=http.createServer((q,s)=>handler(q,s));await new Promise(r=>server.listen(0,'127.0.0.1',r));const root='http://127.0.0.1:'+server.address().port;
 async function json(path,data,headers={}){return fetch(root+'/api/'+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)});}
 try{
  const config=await(await json('config')).json();assert.equal(config.remoteTranslation,true);assert.ok(!JSON.stringify(config).includes('secret'));
  const health=await(await json('translation/health')).json();assert.equal(health.ready,true);assert.ok(!JSON.stringify(health).includes('secret'));assert.equal((await json('translation/health',{})).status,405);calls.length=0;
  const auth=await json('auth',{mode:'register',name:'Teacher',email:'translation-cloud@example.test',password:'test-password'}),cookie=auth.headers.get('set-cookie').split(';')[0];
  const room=await(await json('rooms',{title:'Translation test',language:'pt',targetLanguage:'zh'},{Cookie:cookie})).json(),route='rooms/'+room.id;
  const student=await(await json(route+'/join',{name:'Student',language:'en'})).json(),authStudent={Authorization:'Bearer '+student.token},authTeacher={Authorization:'Bearer '+room.token};
  const phrase='Frase de aula sem armazenamento.';
  assert.equal((await json(route+'/translate',{text:phrase,source:'pt'})).status,401);assert.equal((await json(route+'/translate',{text:phrase,source:'pt'},authStudent)).status,403);assert.equal(calls.length,0);
  const other=await(await json('rooms',{language:'pt'}, {Cookie:cookie})).json();assert.equal((await json(route+'/translate',{text:phrase,source:'pt'},{Authorization:'Bearer '+other.token})).status,401);
  await json(route+'/admit',{id:student.you.id,accept:true},authTeacher);
  assert.equal((await json(route+'/translate',undefined,authStudent)).status,405);
  for(const input of [{text:phrase,source:'en'},{text:phrase,source:'ru'},{text:' ',source:'pt'}])assert.equal((await json(route+'/translate',input,authStudent)).status,400);
  assert.equal((await json(route+'/translate',{text:'x'.repeat(2001),source:'pt'},authStudent)).status,413);assert.equal(calls.length,0);
  const result=await json(route+'/translate',{text:phrase,source:'pt',target:'es'},authStudent);assert.equal(result.status,200);assert.deepEqual(await result.json(),{text:'你好，老师。',source:'pt',target:'zh',model:'opus-mt',processingMs:12});
  assert.deepEqual(JSON.parse(calls[0].options.body),{text:phrase,source:'pt',target:'zh'});assert.equal(calls[0].options.headers.Authorization,'Bearer translation-private-secret');
  await json(route+'/translate',{text:'你好',source:'zh',target:'en'},authTeacher);assert.deepEqual(JSON.parse(calls[1].options.body),{text:'你好',source:'zh',target:'pt'});
  await json(route+'/translate',{text:phrase,source:'pt',target:'es'},authTeacher);assert.deepEqual(JSON.parse(calls[2].options.body),{text:phrase,source:'pt',target:'zh'});
  await json(route+'/translate',{text:'你好',source:'zh',target:'es'},authStudent);assert.deepEqual(JSON.parse(calls[3].options.body),{text:'你好',source:'zh',target:'pt'});
  await db.query('UPDATE ag_rooms SET ended_at=now() WHERE id=$1',[room.id]);assert.equal((await json(route+'/translate',{text:phrase,source:'pt'},authStudent)).status,200);
  assert.equal((await db.query('SELECT count(*)::int AS total FROM ag_transcripts')).rows[0].total,0);assert.ok(!JSON.stringify((await db.query('SELECT data FROM ag_events')).rows).includes(phrase));
  // The student's valid translations are counted separately from the teacher's request.
  await db.query('UPDATE ag_rate_limits SET count=90 WHERE key=$1',[createHash('sha256').update('translate:'+student.you.id).digest('hex')]);
  const count=calls.length;assert.equal((await json(route+'/translate',{text:phrase,source:'pt'},authStudent)).status,429);assert.equal(calls.length,count);
  const offlineHandler=createCloudHandler(()=>db,{translationRelay:createTranslationRelay({getConfig:()=>({enabled:'1',url:'https://voice.example.test',secret:'private'}),fetcher:async()=>{throw Error('private')}})});
  const offline=http.createServer((q,s)=>offlineHandler(q,s));await new Promise(r=>offline.listen(0,'127.0.0.1',r));
  try{const response=await fetch('http://127.0.0.1:'+offline.address().port+'/api/'+route+'/translate',{method:'POST',headers:{'Content-Type':'application/json',...authTeacher},body:JSON.stringify({text:'你好',source:'zh'})});assert.equal(response.status,503);assert.ok(!(await response.text()).includes('private'));}finally{await new Promise(r=>offline.close(r));}
 }finally{await new Promise(r=>server.close(r));await db.close();}
});

test('cloud Whisper requires approved room membership, uses assigned language and never stores audio',async()=>{
 const db=new PGlite();await db.exec(fs.readFileSync(new URL('./db/schema.sql',import.meta.url),'utf8'));
 const calls=[];const asrRelay=createASRRelay({getConfig:()=>({url:'https://voice.example.test',secret:'server-private-secret'}),fetcher:async(url,options)=>{calls.push({url,options});return Response.json({text:'你好',model:'base',processingMs:10})}});
 const handler=createCloudHandler(()=>db,{asrRelay}),server=http.createServer((q,s)=>handler(q,s));await new Promise(r=>server.listen(0,'127.0.0.1',r));const root='http://127.0.0.1:'+server.address().port;
 async function json(path,data,headers={}){return fetch(root+'/api/'+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)});}
 try{
  const config=await(await json('config')).json();assert.equal(config.remoteASR,true);assert.ok(!JSON.stringify(config).includes('secret'));
  const auth=await json('auth',{mode:'register',name:'Teacher',email:'whisper-cloud@example.test',password:'test-password'}),cookie=auth.headers.get('set-cookie').split(';')[0];
  const room=await(await json('rooms',{title:'Voice test',language:'pt',targetLanguage:'zh'},{Cookie:cookie})).json(),route='rooms/'+room.id;
  const student=await(await json(route+'/join',{name:'Student',language:'en'})).json();
  const wav=Buffer.alloc(32044);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(32000,40);
  const speech=token=>fetch(root+'/api/'+route+'/asr',{method:'POST',headers:{'Content-Type':'audio/wav',...(token?{Authorization:'Bearer '+token}:{})},body:wav});
  assert.equal((await speech()).status,401);assert.equal((await speech(student.token)).status,403);assert.equal(calls.length,0);
  await json(route+'/admit',{id:student.you.id,accept:true},{Authorization:'Bearer '+room.token});const result=await speech(student.token);assert.equal(result.status,200);assert.equal((await result.json()).text,'你好');
  assert.equal(calls.length,1);assert.equal(calls[0].options.headers['X-Language'],'zh');assert.equal(calls[0].options.headers.Authorization,'Bearer server-private-secret');assert.equal((await db.query('SELECT count(*)::int AS total FROM ag_transcripts')).rows[0].total,0);
  await db.query('UPDATE ag_rooms SET ended_at=now() WHERE id=$1',[room.id]);assert.equal((await speech(room.token)).status,409);assert.equal(calls.length,1);
 }finally{await new Promise(r=>server.close(r));await db.close();}
});

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
