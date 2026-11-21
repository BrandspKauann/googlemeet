const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
export function createSonioxRelay({getKey=()=>process.env.SONIOX_API_KEY,fetcher=fetch}={}){
 const configured=()=>!!getKey();
 async function session(member,room){
  if(!configured())fail(503,'Soniox não configurada.');
  let response;try{response=await fetcher('https://api.soniox.com/v1/auth/temporary-api-key',{method:'POST',headers:{Authorization:'Bearer '+getKey(),'Content-Type':'application/json'},body:JSON.stringify({usage_type:'transcribe_websocket',expires_in_seconds:60,single_use:true,max_session_duration_seconds:7200,client_reference_id:'aula:'+room.id+':'+member.id}),signal:AbortSignal.timeout(10000)});}catch{fail(503,'Não foi possível conectar à Soniox. Tente novamente.');}
  if(!response.ok){if(response.status===402)fail(402,'Adicione créditos à conta Soniox para ativar as legendas.');fail(503,'A Soniox não autorizou o reconhecimento. Verifique a chave e suas permissões.');}
  const data=await response.json();if(typeof data.api_key!=='string')fail(502,'Credencial temporária inválida.');
  const target=member.role==='teacher'?room.student_language:room.teacher_language;
  return {apiKey:data.api_key,expiresAt:data.expires_at,url:'wss://stt-rt.soniox.com/transcribe-websocket',config:{model:'stt-rt-v6',audio_format:'pcm_s16le',sample_rate:16000,num_channels:1,language_hints:[member.language],enable_endpoint_detection:true,max_endpoint_delay_ms:1000,...(target&&target!==member.language?{translation:{type:'one_way',target_language:target}}:{})},target:target||member.language};
 }
 return {configured,session};
}
