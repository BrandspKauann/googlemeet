const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
export function createASRRelay({getConfig=()=>({url:process.env.ASR_URL,secret:process.env.ASR_SECRET}),fetcher=fetch}={}){
 const configured=()=>{const c=getConfig();return !!(c.url&&c.secret)};
 function config(){const c=getConfig();if(!configured())fail(503,'O servidor de voz ainda não está conectado.');return {...c,url:c.url.replace(/\/$/,'')};}
 async function health(){
  if(!configured())return {ready:false,cloud:true,punctuationReady:false,error:'Servidor de voz não configurado.'};
  const c=config();try{const response=await fetcher(c.url+'/health',{headers:{Authorization:'Bearer '+c.secret},signal:AbortSignal.timeout(4000)});if(!response.ok)throw Error();const data=await response.json();return {ready:data.ready===true,model:data.model,device:data.device,cloud:true,punctuationReady:false,error:data.ready?null:'O computador da aula está preparando o reconhecimento.'};}catch{return {ready:false,cloud:true,punctuationReady:false,error:'O servidor de voz da aula está offline. Verifique se o computador e o Docker estão ligados.'};}
 }
 async function transcribe(req,language){
  const c=config();if(!/^audio\/wav(?:;|$)/i.test(req.headers['content-type']||''))fail(415,'Envie áudio WAV.');
  const declared=Number(req.headers['content-length']);if(declared>2_000_000)fail(413,'Trecho de áudio muito grande.');
  let audio;
  if(Buffer.isBuffer(req.body))audio=req.body;
  else{const parts=[];let size=0;for await(const part of req){const buffer=Buffer.from(part);size+=buffer.length;if(size>2_000_000)fail(413,'Trecho de áudio muito grande.');parts.push(buffer);}audio=Buffer.concat(parts);}
  if(audio.length<44||audio.length>2_000_000||audio.toString('ascii',0,4)!=='RIFF'||audio.toString('ascii',8,12)!=='WAVE'||audio.toString('ascii',12,16)!=='fmt '||audio.readUInt32LE(16)!==16||audio.readUInt16LE(20)!==1||audio.toString('ascii',36,40)!=='data')fail(400,'Envie um trecho WAV PCM válido.');
  const channels=audio.readUInt16LE(22),rate=audio.readUInt32LE(24),bytes=audio.readUInt32LE(28),size=audio.readUInt32LE(40);
  if(![1,2].includes(channels)||![16000,44100,48000].includes(rate)||audio.readUInt16LE(34)!==16||bytes!==rate*channels*2||size!==audio.length-44||size/bytes>12||audio.readUInt32LE(4)!==audio.length-8)fail(400,'Trecho WAV fora dos limites da aula.');
  let response;try{response=await fetcher(c.url+'/transcribe',{method:'POST',headers:{Authorization:'Bearer '+c.secret,'Content-Type':'audio/wav','X-Language':language},body:audio,signal:AbortSignal.timeout(23000)});}catch{fail(503,'O servidor de voz não respondeu. Verifique o computador da aula.');}
  if(!response.ok)fail(response.status===429?429:503,response.status===429?'Reconhecimento ocupado. Aguarde o processamento.':'O servidor está preparando o modelo ou não conseguiu reconhecer este trecho.');
  let result;try{result=await response.json()}catch{fail(502,'Resposta inválida do reconhecimento.');}
  if(typeof result.text!=='string'||result.text.length>8000)fail(502,'Resposta inválida do reconhecimento.');
  return {text:result.text,language,model:String(result.model||'Whisper').slice(0,80),processingMs:Number(result.processingMs)||0,discardedSegments:Number(result.discardedSegments)||0};
 }
 return {configured,health,transcribe};
}
