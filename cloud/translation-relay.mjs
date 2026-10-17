const languages=new Set(['pt','en','es','zh']);
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
export function createTranslationRelay({getConfig=()=>({url:process.env.ASR_URL,secret:process.env.ASR_SECRET,enabled:process.env.TRANSLATION_SERVER_ENABLED}),fetcher=fetch}={}){
 const configured=()=>{const c=getConfig();return (c.enabled===true||c.enabled==='1')&&!!(c.url&&c.secret)};
 function config(){const c=getConfig();if(!configured())fail(503,'A tradução no servidor ainda não está conectada.');return {...c,url:c.url.replace(/\/$/,'')};}
 async function health(){
  if(!configured())return {ready:false,cloud:true,error:'Tradução no servidor não configurada.'};
  const c=config();
  try{
   const response=await fetcher(c.url+'/translation/health',{headers:{Authorization:'Bearer '+c.secret},signal:AbortSignal.timeout(4000)});if(!response.ok)throw Error();
   const data=await response.json();return {ready:data.ready===true,cloud:true,model:typeof data.model==='string'?data.model.slice(0,120):undefined,languages:Array.isArray(data.languages)?data.languages.filter(v=>languages.has(v)):[],error:data.ready===true?null:'O computador da aula está preparando a tradução.'};
  }catch{return {ready:false,cloud:true,error:'O servidor de tradução da aula está offline. Verifique se o computador e o Docker estão ligados.'};}
 }
 async function translate(text,source,target){
  const c=config();
  if(typeof text!=='string'||!text.trim())fail(400,'Informe um texto para traduzir.');if(text.length>2000)fail(413,'Texto muito grande para traduzir.');
  if(!languages.has(source)||!languages.has(target))fail(400,'Idioma de tradução inválido.');
  if(source===target)return {text,source,target,model:'identity',processingMs:0};
  let response;try{response=await fetcher(c.url+'/translate',{method:'POST',headers:{Authorization:'Bearer '+c.secret,'Content-Type':'application/json'},body:JSON.stringify({text,source,target}),signal:AbortSignal.timeout(20000)});}catch{fail(503,'O servidor de tradução não respondeu. Verifique o computador da aula.');}
  if(!response.ok)fail(response.status===429?429:503,response.status===429?'Tradução ocupada. Aguarde o processamento.':'O servidor está preparando o modelo ou não conseguiu traduzir este texto.');
  let result;try{result=await response.json()}catch{fail(502,'Resposta inválida da tradução.');}
  if(typeof result.text!=='string'||result.text.length>12000||!result.text.trim())fail(502,'Resposta inválida da tradução.');
  const processingMs=Number(result.processingMs);return {text:result.text,source,target,model:String(result.model||'Tradução da aula').slice(0,120),processingMs:Number.isFinite(processingMs)&&processingMs>=0?processingMs:0};
 }
 return {configured,health,translate};
}
