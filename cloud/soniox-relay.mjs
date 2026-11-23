const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
export function createSonioxRelay({getKey=()=>process.env.SONIOX_API_KEY,fetcher=fetch}={}){
 const configured=()=>!!getKey();
 const usageCache=new Map();
 async function usage(room){
  if(!configured())fail(503,'Soniox não configurada.');
  if(!room||typeof room.id!=='string'||!/^[a-f0-9]{48}$/.test(room.id))fail(400,'Sala inválida para consultar consumo.');
  const previous=usageCache.get(room.id);if(previous&&Date.now()-previous.at<30000)return previous.value;
  const now=Date.now(),deadline=Date.now()+12000,earliest=Math.max(now-30*86400000,new Date(room.started_at||now).getTime());
  if(!Number.isFinite(earliest))fail(400,'Horário da sala inválido.');
  const prefix='aula:'+room.id+':',seen=new Set();let cursor,costUsd=0,audioMs=0,sessions=0;
  for(let page=0;page<10;page++){if(Date.now()>deadline-250){cursor=cursor||'budget';break;}
   const url=new URL('https://api.soniox.com/v1/usage-logs');url.searchParams.set('start_time',new Date(Math.min(earliest,now-1000)).toISOString());url.searchParams.set('end_time',new Date(now+1000).toISOString());url.searchParams.set('limit','1000');url.searchParams.set('sort','end_time_desc');if(cursor)url.searchParams.set('cursor',cursor);
   let response;try{response=await fetcher(url.href,{headers:{Authorization:'Bearer '+getKey()},signal:AbortSignal.timeout(Math.max(1,Math.min(5000,deadline-Date.now())))});}catch{fail(503,'Não foi possível consultar o consumo. Tente novamente.');}
   if(!response.ok)fail(503,'Consumo indisponível. Confira se a chave Soniox permite consultar o uso.');
   const data=await response.json();if(!Array.isArray(data.usage_logs))fail(502,'Resposta de consumo inválida.');
   for(const entry of data.usage_logs){if(typeof entry.client_reference_id!=='string'||!entry.client_reference_id.startsWith(prefix)||!(/^[a-f0-9]{48}$/.test(entry.client_reference_id.slice(prefix.length)))||typeof entry.uuid!=='string'||seen.has(entry.uuid))continue;const cost=Number(entry.cost_usd),duration=Number(entry.input_audio_duration_ms);if(!Number.isFinite(cost)||cost<0||!Number.isFinite(duration)||duration<0)continue;seen.add(entry.uuid);costUsd+=cost;audioMs+=duration;sessions++;}
   cursor=typeof data.next_page_cursor==='string'&&data.next_page_cursor?data.next_page_cursor:null;if(!cursor)break;
  }
  const value={available:true,currency:'USD',costUsd:Math.round(costUsd*1e10)/1e10,audioMs,sessions,finalizedOnly:true,partial:!!cursor||new Date(room.started_at).getTime()<earliest,checkedAt:new Date(now).toISOString()};
  if(usageCache.size>=100)usageCache.delete(usageCache.keys().next().value);usageCache.set(room.id,{at:now,value});return value;
 }
 async function session(member,room){
  if(!configured())fail(503,'Soniox não configurada.');
  let response;try{response=await fetcher('https://api.soniox.com/v1/auth/temporary-api-key',{method:'POST',headers:{Authorization:'Bearer '+getKey(),'Content-Type':'application/json'},body:JSON.stringify({usage_type:'transcribe_websocket',expires_in_seconds:60,single_use:true,max_session_duration_seconds:7200,client_reference_id:'aula:'+room.id+':'+member.id}),signal:AbortSignal.timeout(10000)});}catch{fail(503,'Não foi possível conectar à Soniox. Tente novamente.');}
  if(!response.ok){if(response.status===402)fail(402,'Adicione créditos à conta Soniox para ativar as legendas.');fail(503,'A Soniox não autorizou o reconhecimento. Verifique a chave e suas permissões.');}
  const data=await response.json();if(typeof data.api_key!=='string')fail(502,'Credencial temporária inválida.');
  const target=member.role==='teacher'?room.student_language:room.teacher_language;
  return {apiKey:data.api_key,expiresAt:data.expires_at,url:'wss://stt-rt.soniox.com/transcribe-websocket',config:{model:'stt-rt-v6',audio_format:'pcm_s16le',sample_rate:16000,num_channels:1,language_hints:[member.language],enable_endpoint_detection:true,max_endpoint_delay_ms:1000,...(target&&target!==member.language?{translation:{type:'one_way',target_language:target}}:{})},target:target||member.language};
 }
 return {configured,session,usage};
}
