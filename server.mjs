import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
const id=()=>randomBytes(24).toString('hex');
export function createApp(dataDir=path.join(root,'data'),asrConfig={url:'http://127.0.0.1:4180',secret:process.env.ASR_SECRET||''}){
 fs.mkdirSync(dataDir,{recursive:true});const file=path.join(dataDir,'store.json');
 let db=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{users:[],rooms:[]};
 const sessions=new Map(),events=new Map(),rates=new Map();
 const save=()=>{fs.writeFileSync(file+'.tmp',JSON.stringify(db));fs.renameSync(file+'.tmp',file)};
 // A restart disconnects attendees; persisted transcripts remain available.
 for(const r of db.rooms){r.ending=false;for(const m of r.members){m.online=false;m.asrPending=0}}
 const fail=(code,message)=>{throw Object.assign(new Error(message),{code})};
 const emit=(r,type,data,to)=>{let list=events.get(r.id)||[];list.push({seq:(list.at(-1)?.seq||0)+1,type,data,to});events.set(r.id,list.slice(-2000))};
 const publicMember=m=>({id:m.id,generation:m.generation||0,name:m.name,language:m.language,role:m.role,status:m.status,online:m.online,media:m.media||{}});
 const state=(r,m)=>({id:r.id,cursor:(events.get(r.id)||[]).at(-1)?.seq||0,title:r.title,teacherLanguage:r.members.find(x=>x.role==='teacher')?.language||'pt',studentLanguage:r.studentLanguage||r.members.find(x=>x.role==='student')?.language||'en',ended:r.ended,ending:!!r.ending,startedAt:r.startedAt,you:publicMember(m),members:r.members.filter(x=>x.status==='accepted'||m.role==='teacher').map(publicMember),transcripts:m.status==='accepted'?r.transcripts:[],iceServers:[{urls:'stun:stun.l.google.com:19302'}],localOnly:true});
 const member=(req,r)=>{const token=req.headers.authorization?.replace(/^Bearer /,'');const m=r.members.find(m=>m.token===token);if(!m)fail(401,'Entrada não autorizada. Abra novamente o link da sala.');return m};
 const accepted=m=>{if(m.status!=='accepted')fail(403,'Aguarde a aprovação da professora.')};
 const teacher=m=>{accepted(m);if(m.role!=='teacher')fail(403,'Somente a professora pode realizar esta ação.')};
 const user=req=>{const cookie=req.headers.cookie?.match(/(?:^|;\s*)session=([a-f0-9]+)/)?.[1];const s=sessions.get(cookie);if(!s||s.expires<Date.now())fail(401,'Entre na sua conta de professora.');return db.users.find(u=>u.id===s.user)};
 async function body(req){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>100000)fail(413,'Conteúdo muito grande.');chunks.push(c)}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}')}catch{fail(400,'Dados inválidos.')}}
 const text=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
 const lang=v=>['pt','en','es','zh'].includes(v)?v:'pt';
 const server=http.createServer(async(req,res)=>{
  const json=(v,code=200)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(v))};
  try{
   const url=new URL(req.url,'http://localhost');const p=url.pathname;
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
   if(req.method==='POST'&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)fail(403,'Origem não autorizada.');
   if(p==='/api/auth'&&req.method==='POST'){
    const ip=req.socket.remoteAddress;const rate=rates.get(ip)||{n:0,t:Date.now()};if(Date.now()-rate.t>60000){rate.n=0;rate.t=Date.now()}rate.n++;rates.set(ip,rate);if(rate.n>20)fail(429,'Muitas tentativas. Aguarde um minuto.');
    const b=await body(req);const email=text(b.email,200).toLowerCase();const password=typeof b.password==='string'?b.password:'';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8||password.length>200)fail(400,'Informe um e-mail válido e senha de 8 a 200 caracteres.');
    let u=db.users.find(u=>u.email===email);
    if(b.mode==='register'){if(u)fail(409,'Esta conta já existe. Use Entrar.');const name=text(b.name,60);if(!name)fail(400,'Informe seu nome.');const salt=id();u={id:id(),name,email,salt,hash:scryptSync(password,salt,64).toString('hex')};db.users.push(u);save()}
    else if(!u||!timingSafeEqual(scryptSync(password,u.salt,64),Buffer.from(u.hash,'hex')))fail(401,'E-mail ou senha incorretos.');
    const token=id();sessions.set(token,{user:u.id,expires:Date.now()+86400000});res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);json({name:u.name});return;
   }
   if(p==='/api/me'){const u=user(req);json({name:u.name,email:u.email});return}
   if(p==='/api/config'){json({mode:'local',encrypted:false,localASR:true});return}
   if(p==='/api/asr/health'){
    if(!asrConfig.secret){json({ready:false,error:'Motor local não iniciado. Execute npm start após instalar o ambiente Python.'});return}
    try{const response=await fetch(asrConfig.url+'/health',{headers:{Authorization:'Bearer '+asrConfig.secret},signal:AbortSignal.timeout(2000)});if(!response.ok)throw new Error();const health=await response.json();json({...health,error:health.error?'Falha ao carregar o modelo local. Verifique o terminal.':null});}catch{json({ready:false,error:'Motor local iniciando ou indisponível. Aguarde e verifique novamente.'})}return;
   }
   if(p==='/api/rooms'&&req.method==='POST'){
    const u=user(req),b=await body(req);const m={id:id(),token:id(),name:text(b.name,60)||u.name,language:lang(b.language),role:'teacher',status:'accepted',online:true,lastSeen:Date.now()};
    if(b.targetLanguage!==undefined&&!['pt','en','es','zh'].includes(b.targetLanguage))fail(400,'Idioma de tradução inválido.');const r={studentLanguage:b.targetLanguage||null,id:id(),owner:u.id,title:text(b.title,100)||'Aula Global',startedAt:new Date().toISOString(),ended:false,members:[m],transcripts:[]};db.rooms.push(r);save();json({roomId:r.id,token:m.token,...state(r,m)});return;
   }
   const match=p.match(/^\/api\/rooms\/([a-f0-9]{48})(?:\/([a-z]+))?$/);
   if(match){const r=db.rooms.find(r=>r.id===match[1]);if(!r)fail(404,'Sala não encontrada.');const action=match[2]||'state';
    if(action==='info'){json({title:r.title,ended:r.ended,teacherLanguage:r.members.find(m=>m.role==='teacher')?.language||'pt',studentLanguage:r.studentLanguage||'en'});return}
    if(action==='join'&&req.method==='POST'){
     if(r.ended||r.ending)fail(409,'Esta reunião já foi encerrada ou está encerrando.');if(r.members.filter(m=>m.status!=='rejected'&&m.online).length>=6)fail(409,'Esta versão aceita até 6 participantes por sala.');const b=await body(req),name=text(b.name,60);if(!name)fail(400,'Informe seu nome.');
     const m={id:id(),token:id(),name,language:r.studentLanguage||lang(b.language),role:'student',status:'pending',online:true,lastSeen:Date.now()};r.members.push(m);emit(r,'members',{});save();json({roomId:r.id,token:m.token,...state(r,m)});return;
    }
    const m=member(req,r);m.lastSeen=Date.now();if(m.status==='accepted'&&!r.ended&&!m.online){m.online=true;emit(r,'members',{})}
    if(action==='resume'&&req.method==='POST'){m.generation=(m.generation||0)+1;m.media={};emit(r,'members',{});save();json(state(r,m));return}
    if(action==='state'){json(state(r,m));return}
    if(action==='events'){
     const since=Number(url.searchParams.get('since'))||0;const all=events.get(r.id)||[];const list=all.filter(e=>e.seq>since&&(!e.to||e.to===m.id)&& (m.status==='accepted'||e.type==='members'||e.type==='ended'));
     for(const other of r.members){if(other.online&&Date.now()-(other.lastSeen||0)>15000){other.online=false;emit(r,'members',{})}}
     json({events:list,cursor:all.at(-1)?.seq||since,state:state(r,m)});return;
    }
    if(req.method!=='POST')fail(405,'Método não permitido.');
    if(action==='asr'){
     accepted(m);if(r.ended)fail(409,'Reunião encerrada.');if(!asrConfig.secret)fail(503,'Motor local indisponível. Selecione o reconhecimento do navegador.');
     if((m.asrPending||0)>=2)fail(429,'Motor local atrasado para este participante.');
     m.asrPending=(m.asrPending||0)+1;
     try{let bytes=0,chunks=[];for await(const c of req){bytes+=c.length;if(bytes>2000000)fail(413,'Trecho de áudio muito grande.');chunks.push(c)}const audio=Buffer.concat(chunks);if(audio.length<44||audio.subarray(0,4).toString()!=='RIFF')fail(400,'Áudio WAV inválido.');
      let response;try{response=await fetch(asrConfig.url+'/transcribe',{method:'POST',headers:{Authorization:'Bearer '+asrConfig.secret,'X-Language':m.language,'Content-Type':'audio/wav'},body:audio,signal:AbortSignal.timeout(25000)})}catch{fail(503,'Motor local não respondeu. Tente o reconhecimento do navegador.');}
      const result=await response.json();json(result,response.status);return;
     }finally{m.asrPending=Math.max(0,m.asrPending-1)}
    }
    const b=await body(req);
    if(action==='admit'){
     teacher(m);if(r.ended)fail(409,'Reunião encerrada.');const target=r.members.find(x=>x.id===b.id&&x.status==='pending');if(!target)fail(404,'Pedido não encontrado.');target.status=b.accept?'accepted':'rejected';emit(r,'members',{});save();json({ok:true});return;
    }
    if(action==='leave'){m.online=false;emit(r,'members',{});save();json({ok:true});return}
    accepted(m);
    if(r.ended)fail(409,'Reunião encerrada.');
    if(action==='flush'){m.flushedEnd=r.endId;json({ok:true});return}
    if(action==='end'){teacher(m);if(r.ending)fail(409,'A reunião já está encerrando.');r.ending=true;r.endId=id();const waiting=r.members.filter(x=>x.id!==m.id&&x.status==='accepted'&&x.online&&x.media?.microphone);emit(r,'ending',{});const started=Date.now();await new Promise(resolve=>setTimeout(resolve,3000));while(waiting.some(x=>x.online&&x.flushedEnd!==r.endId)&&Date.now()-started<420000)await new Promise(resolve=>setTimeout(resolve,150));for(const x of waiting.filter(x=>x.flushedEnd!==r.endId)){r.transcripts.push({id:id(),memberId:x.id,name:x.name,language:x.language,text:'O encerramento não recebeu a confirmação dos últimos trechos deste participante.',kind:'gap',at:new Date().toISOString()})}r.ended=true;r.ending=false;r.endedAt=new Date().toISOString();emit(r,'ended',{});save();json(state(r,m));return}
    if(action==='signal'){
     const target=r.members.find(x=>x.id===b.to&&x.online&&x.status==='accepted');if(!target)fail(404,'Participante desconectado.');if(!['offer','answer','ice'].includes(b.type))fail(400,'Sinal inválido.');emit(r,'signal',{from:m.id,fromGeneration:m.generation||0,toGeneration:target.generation||0,type:b.type,payload:b.payload},target.id);json({ok:true});return;
    }
    if(action==='media'){m.media={camera:!!b.camera,microphone:!!b.microphone,screen:!!b.screen};emit(r,'members',{});json({ok:true});return}
    if(action==='transcript'){
     const original=text(b.text,2000);if(!original)fail(400,'Fala vazia.');const clientId=text(b.clientId,80);const existing=r.transcripts.find(t=>t.memberId===m.id&&clientId&&t.clientId===clientId);if(existing){json(existing);return}
     const kind=b.kind==='gap'?'gap':b.kind==='typed'?'typed':'speech';let displayed=original,punctuation=kind==='speech'?'off':'unchanged';const capturedAt=new Date().toISOString();
     if(kind==='speech'&&b.punctuation!==false){
      punctuation='unavailable';
      if(asrConfig.secret){try{const response=await fetch(asrConfig.url+'/punctuate',{method:'POST',headers:{Authorization:'Bearer '+asrConfig.secret,'Content-Type':'application/json'},body:JSON.stringify({text:original,language:m.language}),signal:AbortSignal.timeout(2000)});if(response.ok){const result=await response.json();const fingerprint=s=>s.normalize('NFC').replace(/[\p{P}\s]/gu,'').toLowerCase();if(typeof result.text==='string'&&fingerprint(result.text)===fingerprint(original)){displayed=result.text;punctuation=displayed===original?'preserved':'applied';}}}catch{}}
     }
     // Retrying while punctuation is running must not duplicate a phrase.
     const retried=r.transcripts.find(t=>t.memberId===m.id&&clientId&&t.clientId===clientId);if(retried){json(retried);return}
     if(r.ended)fail(409,'Reunião encerrada.');
     const t={id:id(),clientId,memberId:m.id,name:m.name,language:m.language,text:displayed,rawText:typeof b.rawText==='string'&&b.rawText.normalize('NFC').replace(/[\p{P}\s]/gu,'').toLowerCase()===original.normalize('NFC').replace(/[\p{P}\s]/gu,'').toLowerCase()?text(b.rawText,2000):original,punctuation,kind,at:capturedAt};r.transcripts.push(t);save();emit(r,'transcript',t);json(t);return;
    }
    fail(404,'Ação não encontrada.');
   }
   if(p.startsWith('/api/'))fail(404,'Rota não encontrada.');
   const safe=['/','/index.html','/style.css','/room.js','/presentation.js','/beauty-camera.js','/worker-beauty.js','/interface-language.js','/screen-zoom.js','/local-asr.js','/language-routing.js','/paraformer-asr.js','/paraformer-worker.js','/capture-processor.js','/durable.js','/security.js','/preflight.js','/educational-quotes.js','/asr-licenses.txt','/speech-engine.js','/asr-utils.js','/device-asr.js','/whisper-worker.js','/asr-fixture.wav','/asr-compare.html','/asr-compare.js'];if(!safe.includes(p)&&!/^\/openmakeup\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9._-]+\.(?:js|txt|glsl|png|PNG|glb|json)$/.test(p)&&!/^\/(?:gpupixel|face-tracking|paraformer-runtime)\/[a-zA-Z0-9._-]+\.(?:js|png|txt|wasm)$/.test(p)&&!/^\/asr-runtime\/[a-zA-Z0-9._-]+\.(?:mjs|wasm)$/.test(p))fail(404,'Arquivo não encontrado.');
   const f=path.join(root,'dist',p==='/'?'index.html':p.slice(1));res.writeHead(200,{'Content-Type':/\.png$/i.test(p)?'image/png':p.endsWith('.txt')?'text/plain; charset=utf-8':p.endsWith('.wasm')?'application/wasm':p.endsWith('.wav')?'audio/wav':/\.(js|mjs)$/.test(p)?'text/javascript; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(f));
  }catch(error){json({error:error.code?error.message:'Falha interna do servidor.'},error.code||500)}
 });return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||4178),python=path.join(root,'.venv','Scripts','python.exe');let engine;
 const secret=id(),asrPort=Number(process.env.ASR_PORT||4180);
 if(fs.existsSync(python)&&process.env.ASR_DISABLED!=='1'){
  engine=spawn(python,[path.join(root,'asr_server.py')],{cwd:root,windowsHide:true,env:{...process.env,ASR_SECRET:secret,ASR_PORT:String(asrPort),PYTHONUTF8:'1',HF_HUB_DISABLE_SYMLINKS_WARNING:'1'},stdio:['ignore','pipe','pipe']});
  engine.stdout.on('data',chunk=>process.stdout.write(chunk));engine.stderr.on('data',chunk=>process.stderr.write(chunk));engine.on('error',()=>console.log('Motor local indisponível; navegador continua disponível.'));
 }
 const server=createApp(process.env.AULA_DATA_DIR,{url:'http://127.0.0.1:'+asrPort,secret:engine?secret:''});server.listen(port,'127.0.0.1',()=>console.log(`Aula Global: http://localhost:${port}`));
 process.once('exit',()=>engine?.kill());for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{engine?.kill();server.close();process.exit(0)});
}

