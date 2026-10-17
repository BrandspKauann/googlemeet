import {createASRRelay} from './asr-relay.mjs';
import {createTranslationRelay} from './translation-relay.mjs';
import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback),id=()=>randomBytes(24).toString('hex'),hash=s=>createHash('sha256').update(s).digest('hex');
const fail=(code,message)=>{throw Object.assign(new Error(message),{status:code})};
const clean=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const language=v=>['pt','en','es','zh'].includes(v)?v:'pt';
const cursor=v=>typeof v==='string'&&/^\d{1,19}$/.test(v)?v:'0';
const iso=v=>v?new Date(v).toISOString():null;
async function body(req){if(req.body&&typeof req.body==='object'){if(JSON.stringify(req.body).length>100000)fail(413,'Dados muito grandes.');return req.body}if(typeof req.body==='string'){if(req.body.length>100000)fail(413,'Dados muito grandes.');return JSON.parse(req.body)}let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>100000)fail(413,'Dados muito grandes.');chunks.push(c)}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}')}catch{fail(400,'Dados inválidos.')}}
export function createCloudHandler(dbProvider,{configured=true,asrRelay=createASRRelay(),translationRelay=createTranslationRelay()}={}){
 return async(req,res)=>{
  const send=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value))};
  try{
   const url=new URL(req.url,'http://localhost'),route=url.searchParams.get('route')||url.pathname.replace(/^\/api\/?/,'');
   if(req.method==='POST'&&req.headers.origin&&!['http://'+req.headers.host,'https://'+req.headers.host].includes(req.headers.origin))fail(403,'Origem não autorizada.');
   if(route==='config'){send({mode:'cloud',encrypted:true,databaseConfigured:typeof configured==='function'?configured():configured,localASR:false,remoteASR:asrRelay.configured(),remoteTranslation:translationRelay.configured()});return}
   if(route==='asr/health'){send(await asrRelay.health());return}
   if(route==='translation/health'){if(req.method!=='GET')fail(405,'Método não permitido.');send(await translationRelay.health());return}
   const db=await dbProvider();const query=async(sql,params=[])=> (await db.query(sql,params)).rows;
   const event=(room,type,data={},recipient=null)=>query('INSERT INTO ag_events(room_id,type,data,recipient_id) VALUES($1,$2,$3::jsonb,$4)',[room,type,JSON.stringify(data),recipient]);
   const authUser=async()=>{const token=req.headers.cookie?.match(/(?:^|;\s*)session=([a-f0-9]{48})/)?.[1];if(!token)fail(401,'Entre na conta da professora.');const rows=await query('SELECT u.* FROM ag_users u JOIN ag_sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()',[hash(token)]);if(!rows[0])fail(401,'Sua sessão expirou. Entre novamente.');return rows[0]};
   if(route==='auth'&&req.method==='POST'){
    const b=await body(req);const email=clean(b.email,200).toLowerCase(),password=typeof b.password==='string'?b.password:'';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8||password.length>200)fail(400,'Use e-mail válido e senha de 8 a 200 caracteres.');
    const ip=(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'local').toString().split(',')[0];const rate=(await query("INSERT INTO ag_rate_limits(key,window_start,count) VALUES($1,now(),1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN ag_rate_limits.window_start<now()-interval '1 minute' THEN 1 ELSE ag_rate_limits.count+1 END,window_start=CASE WHEN ag_rate_limits.window_start<now()-interval '1 minute' THEN now() ELSE ag_rate_limits.window_start END RETURNING count",[hash(ip)]))[0];if(rate.count>20)fail(429,'Muitas tentativas. Aguarde um minuto.');
    let u=(await query('SELECT * FROM ag_users WHERE email=$1',[email]))[0];
    if(b.mode==='register'){if(u)fail(409,'Esta conta já existe. Use Entrar.');const name=clean(b.name,60);if(!name)fail(400,'Informe seu nome.');const salt=id(),passwordHash=(await scrypt(password,salt,64)).toString('hex');try{u=(await query('INSERT INTO ag_users(id,email,name,salt,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING *',[id(),email,name,salt,passwordHash]))[0]}catch(e){if(e.code==='23505')fail(409,'Esta conta já existe.');throw e}}
    else if(!u||!timingSafeEqual(await scrypt(password,u.salt,64),Buffer.from(u.password_hash,'hex')))fail(401,'E-mail ou senha incorretos.');
    const token=id();await query("INSERT INTO ag_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '24 hours')",[hash(token),u.id]);const secure=!!process.env.VERCEL||req.headers['x-forwarded-proto']==='https'||req.headers.origin?.startsWith('https:');res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secure?'; Secure':''}`);send({name:u.name});return;
   }
   if(route==='me'){const u=await authUser();send({name:u.name,email:u.email});return}
   if(route==='rooms'&&req.method==='POST'){
    const u=await authUser(),b=await body(req),roomId=id(),memberId=id(),token=id();
    if(b.targetLanguage!==undefined&&!['pt','en','es','zh'].includes(b.targetLanguage))fail(400,'Idioma de tradução inválido.');
    await query("WITH r AS (INSERT INTO ag_rooms(id,owner_id,title,student_language) VALUES($1,$2,$3,$8) RETURNING id),p AS (INSERT INTO ag_participants(id,room_id,name,language,role,status,token_hash) SELECT $4,r.id,$5,$6,'teacher','accepted',$7 FROM r RETURNING room_id) INSERT INTO ag_events(room_id,type) SELECT room_id,'members' FROM p",[roomId,u.id,clean(b.title,100)||'Aula Global',memberId,clean(b.name,60)||u.name,language(b.language),hash(token),b.targetLanguage||null]);
    const state=await roomState(roomId,memberId);send({roomId,token,...state});return;
   }
   const match=route.match(/^rooms\/([a-f0-9]{48})(?:\/([a-z]+))?$/);if(!match)fail(404,'Rota não encontrada.');const roomId=match[1],action=match[2]||'state';
   let room=(await query('SELECT * FROM ag_rooms WHERE id=$1',[roomId]))[0];if(!room)fail(404,'Sala não encontrada.');
   async function finalize(){await query("UPDATE ag_rooms r SET ended_at=now() WHERE r.id=$1 AND ended_at IS NULL AND end_requested_at IS NOT NULL AND (end_deadline<=now() OR (end_requested_at<now()-interval '3 seconds' AND NOT EXISTS(SELECT 1 FROM ag_participants p WHERE p.room_id=r.id AND p.status='accepted' AND p.online AND p.last_seen>now()-interval '45 seconds' AND NOT p.flushed)))",[roomId]);room=(await query('SELECT * FROM ag_rooms WHERE id=$1',[roomId]))[0]}
   if(action==='info'){const host=(await query("SELECT language FROM ag_participants WHERE room_id=$1 AND role='teacher' LIMIT 1",[roomId]))[0];send({title:room.title,ended:!!room.ended_at,encrypted:true,teacherLanguage:host?.language||'pt',studentLanguage:room.student_language||'en'});return}
   if(action==='join'&&req.method==='POST'){
    if(room.ended_at||room.end_requested_at)fail(409,'Esta reunião já foi encerrada ou está encerrando.');const b=await body(req),name=clean(b.name,60);if(!name)fail(400,'Informe seu nome.');
    const memberId=id(),token=id();await query("INSERT INTO ag_participants(id,room_id,name,language,role,status,token_hash) VALUES($1,$2,$3,$4,'student','pending',$5)",[memberId,roomId,name,room.student_language||language(b.language),hash(token)]);await event(roomId,'members');send({roomId,token,...await roomState(roomId,memberId)});return;
   }
   const token=req.headers.authorization?.replace(/^Bearer /,'');if(!token)fail(401,'Entrada não autorizada.');let member=(await query('SELECT * FROM ag_participants WHERE room_id=$1 AND token_hash=$2',[roomId,hash(token)]))[0];if(!member)fail(401,'Entrada não autorizada.');
   const accepted=()=>{if(member.status!=='accepted')fail(403,'Aguarde a aprovação da professora.')};const teacher=()=>{accepted();if(member.role!=='teacher')fail(403,'Somente a professora pode realizar esta ação.')};
   await query("UPDATE ag_participants SET last_seen=now(),online=CASE WHEN status='accepted' THEN true ELSE online END WHERE id=$1",[member.id]);await finalize();
   async function roomState(rid,mid){
    const r=(await query('SELECT * FROM ag_rooms WHERE id=$1',[rid]))[0];const all=await query("SELECT *, (online AND last_seen>now()-interval '45 seconds') AS connected FROM ag_participants WHERE room_id=$1 ORDER BY CASE WHEN role='teacher' THEN 0 ELSE 1 END,id",[rid]);const self=all.find(m=>m.id===mid);const publicMember=m=>({id:m.id,name:m.name,language:m.language,role:m.role,status:m.status,online:!!m.connected,generation:m.generation,media:m.media});
    const seq=(await query('SELECT COALESCE(max(seq),0)::text AS cursor FROM ag_events WHERE room_id=$1',[rid]))[0].cursor;
    const iceServers=[{urls:'stun:stun.l.google.com:19302'}];if(process.env.TURN_URL&&process.env.TURN_USERNAME&&process.env.TURN_CREDENTIAL)iceServers.push({urls:process.env.TURN_URL,username:process.env.TURN_USERNAME,credential:process.env.TURN_CREDENTIAL});
    return {id:rid,title:r.title,teacherLanguage:all.find(m=>m.role==='teacher')?.language||'pt',studentLanguage:r.student_language||all.find(m=>m.role==='student')?.language||'en',startedAt:iso(r.started_at),ended:!!r.ended_at,ending:!!r.end_requested_at&&!r.ended_at,you:publicMember(self),members:all.filter(x=>x.status==='accepted'||self.role==='teacher').map(publicMember),cursor:seq,iceServers,localOnly:false,encrypted:true,incremental:true};
   }
   const transcriptRow=t=>({id:t.id,seq:String(t.seq),memberId:t.member_id,name:t.name,language:t.language,payload:t.payload,clientId:t.client_id,at:iso(t.captured_at)});
   if(action==='state'){send(await roomState(roomId,member.id));return}
   if(action==='events'){
    const since=cursor(url.searchParams.get('since'));const rows=await query('SELECT seq::text,type,data,recipient_id FROM ag_events WHERE room_id=$1 AND seq>$2::bigint ORDER BY seq LIMIT 100',[roomId,since]);const visible=rows.filter(e=>(!e.recipient_id||e.recipient_id===member.id)&&(member.status==='accepted'||['members','ending','ended'].includes(e.type)));
    send({events:visible.map(e=>({seq:e.seq,type:e.type,data:e.data})),cursor:rows.at(-1)?.seq||since,more:rows.length===100,state:await roomState(roomId,member.id)});return;
   }
   if(action==='transcripts'){
    accepted();let rows;const after=cursor(url.searchParams.get('after')),before=url.searchParams.get('before');
    if(before||url.searchParams.get('latest')==='true'){rows=await query('SELECT t.*,p.name,p.language FROM ag_transcripts t JOIN ag_participants p ON p.id=t.member_id WHERE t.room_id=$1 AND ($2::bigint=0 OR t.seq<$2::bigint) ORDER BY t.seq DESC LIMIT 100',[roomId,before?cursor(before):'0']);rows.reverse()}
    else rows=await query('SELECT t.*,p.name,p.language FROM ag_transcripts t JOIN ag_participants p ON p.id=t.member_id WHERE t.room_id=$1 AND t.seq>$2::bigint ORDER BY t.seq LIMIT 100',[roomId,after]);
    send({records:rows.map(transcriptRow),cursor:rows.at(-1)?String(rows.at(-1).seq):after,more:rows.length===100});return;
   }
   if(action==='asr'){
    if(req.method!=='POST')fail(405,'Método não permitido.');accepted();if(room.ended_at)fail(409,'Reunião encerrada.');
    if(!asrRelay.configured())fail(503,'Servidor de voz não configurado.');
    const rate=(await query("INSERT INTO ag_rate_limits(key,window_start,count) VALUES($1,now(),1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN ag_rate_limits.window_start<now()-interval '1 minute' THEN 1 ELSE ag_rate_limits.count+1 END,window_start=CASE WHEN ag_rate_limits.window_start<now()-interval '1 minute' THEN now() ELSE ag_rate_limits.window_start END RETURNING count",[hash('asr:'+member.id)]))[0];
    if(rate.count>45)fail(429,'Muitos trechos de voz. Aguarde um momento.');
    send(await asrRelay.transcribe(req,member.language));return;
   }
   if(action==='translate'){
    if(req.method!=='POST')fail(405,'Método não permitido.');accepted();
    if(!translationRelay.configured())fail(503,'Tradução no servidor não configurada.');
    const b=await body(req);if(typeof b.text!=='string'||!b.text.trim())fail(400,'Informe um texto para traduzir.');if(b.text.length>2000)fail(413,'Texto muito grande para traduzir.');
    const assigned=await query("SELECT language,role FROM ag_participants WHERE room_id=$1 AND status='accepted' ORDER BY id",[roomId]);
    const teacherLanguage=assigned.find(p=>p.role==='teacher')?.language||'pt',studentLanguage=room.student_language||assigned.find(p=>p.role==='student')?.language||'en';
    if(!['pt','en','es','zh'].includes(b.source)||![teacherLanguage,studentLanguage].includes(b.source))fail(400,'Idioma de origem incompatível com a aula.');
    const rate=(await query("INSERT INTO ag_rate_limits(key,window_start,count) VALUES($1,now(),1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN ag_rate_limits.window_start<now()-interval '1 minute' THEN 1 ELSE ag_rate_limits.count+1 END,window_start=CASE WHEN ag_rate_limits.window_start<now()-interval '1 minute' THEN now() ELSE ag_rate_limits.window_start END RETURNING count",[hash('translate:'+member.id)]))[0];
    if(rate.count>90)fail(429,'Muitos pedidos de tradução. Aguarde um momento.');
    send(await translationRelay.translate(b.text,b.source,member.language));return;
   }
   if(req.method!=='POST')fail(405,'Método não permitido.');const b=await body(req);
   if(action==='resume'){await query('UPDATE ag_participants SET generation=generation+1,media=$2::jsonb,online=true WHERE id=$1',[member.id,'{}']);await event(roomId,'members');send(await roomState(roomId,member.id));return}
   if(action==='leave'){await query('UPDATE ag_participants SET online=false WHERE id=$1',[member.id]);await event(roomId,'members');send({ok:true});return}
   if(action==='admit'){teacher();if(room.ended_at||room.end_requested_at)fail(409,'Reunião encerrada.');const updated=await query("UPDATE ag_participants SET status=$3 WHERE room_id=$1 AND id=$2 AND status='pending' RETURNING id",[roomId,b.id,b.accept?'accepted':'rejected']);if(!updated.length)fail(404,'Pedido não encontrado.');await event(roomId,'members');send({ok:true});return}
   accepted();
   if(action==='transcript'){
    const clientId=clean(b.clientId,80),payload=b.payload,at=new Date(b.capturedAt);
    if(b.text||b.rawText||!clientId||!payload||Object.keys(payload).some(k=>!['v','algorithm','iv','ciphertext'].includes(k))||payload.v!==1||payload.algorithm!=='AES-GCM'||!(/^[A-Za-z0-9+/]{16}$/.test(payload.iv||''))||typeof payload.ciphertext!=='string'||payload.ciphertext.length<24||payload.ciphertext.length>30000||!/^[A-Za-z0-9+/]+={0,2}$/.test(payload.ciphertext)||!Number.isFinite(at.getTime()))fail(400,'Envie uma fala criptografada válida.');
    if(at.getTime()>Date.now()+300000||at.getTime()<new Date(room.started_at).getTime()-300000||(room.ended_at&&at.getTime()>new Date(room.ended_at).getTime()+300000))fail(400,'Horário da fala incompatível com a reunião.');
    const rows=await query('INSERT INTO ag_transcripts(id,room_id,member_id,client_id,payload,captured_at) VALUES($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT(room_id,member_id,client_id) DO UPDATE SET payload=ag_transcripts.payload RETURNING *',[id(),roomId,member.id,clientId,JSON.stringify(payload),at.toISOString()]);send(transcriptRow({...rows[0],name:member.name,language:member.language}));return;
   }
   if(room.ended_at)fail(409,'Reunião encerrada.');
   if(action==='media'){await query('UPDATE ag_participants SET media=$2::jsonb WHERE id=$1',[member.id,JSON.stringify({camera:!!b.camera,microphone:!!b.microphone,screen:!!b.screen})]);send({ok:true});return}
   if(action==='flush'){await query('UPDATE ag_participants SET flushed=true WHERE id=$1',[member.id]);send({ok:true});return}
   if(action==='end'){teacher();if(room.end_requested_at){send(await roomState(roomId,member.id));return}await query('UPDATE ag_participants SET flushed=CASE WHEN id=$2 THEN true ELSE NOT COALESCE((media->>\'microphone\')::boolean,false) END WHERE room_id=$1',[roomId,member.id]);await query("UPDATE ag_rooms SET end_requested_at=COALESCE(end_requested_at,now()),end_deadline=COALESCE(end_deadline,now()+interval '7 minutes') WHERE id=$1",[roomId]);await event(roomId,'ending');send(await roomState(roomId,member.id));return}
   if(action==='signal'){const target=(await query("SELECT * FROM ag_participants WHERE room_id=$1 AND id=$2 AND status='accepted' AND online AND last_seen>now()-interval '45 seconds'",[roomId,b.to]))[0];if(!target)fail(404,'Participante desconectado.');if(!['offer','answer','ice'].includes(b.type)||JSON.stringify(b.payload).length>30000)fail(400,'Sinal inválido.');await event(roomId,'signal',{from:member.id,fromGeneration:member.generation,toGeneration:target.generation,type:b.type,payload:b.payload},target.id);send({ok:true});return}
   fail(404,'Ação não encontrada.');
  }catch(error){send({error:error.status?error.message:'Não foi possível acessar o banco. Verifique a configuração e a migração.'},error.status||503)}
 };
}
