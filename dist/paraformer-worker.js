/* Classic worker: official sherpa-onnx 1.12.33 WASM + pinned Paraformer weights. */
let recognizer,boot;
const base='/paraformer-runtime/';
const repository='https://huggingface.co/csukuangfj/sherpa-onnx-streaming-paraformer-bilingual-zh-en/resolve/8e40c43232a1c5c66c82111efc5820d3accca11b/';
const files=[
  {name:'decoder.int8.onnx',offset:3033,size:71664561,sha:'f3cca9f77bb9d93c8fcbfb63ae617b6b1ee96818df3aa3b151c40658fe38594f'},
  {name:'encoder.int8.onnx',offset:71667594,size:165462184,sha:'81a70226a8934e6ed92aa1d4fc486b428b5398e2f2619ed4897b7294cab90e9a'},
  {name:'tokens.txt',offset:237129778,size:75756,sha:'59aba8873a2ed1e122c25fee421e25f283b63290efbde85c1f01a853d83cb6e6'}
];
const progress=message=>postMessage({type:'progress',message});
async function bytes(file){
  const url=file.name==='tokens.txt'?base+file.name:repository+file.name;
  let cache;try{cache=await caches.open('aula-paraformer-1.12.33');}catch{}
  const saved=await cache?.match(url);
  let data;
  if(saved){progress('Lendo modelo em cache: '+file.name);data=await saved.arrayBuffer();}
  else{
    const response=await fetch(url);if(!response.ok)throw Error('Falha no download de '+file.name+' (HTTP '+response.status+').');
    const reader=response.body.getReader(),parts=[];let count=0,lastPercent=-1;
    while(true){const {done,value}=await reader.read();if(done)break;parts.push(value);count+=value.byteLength;const percent=Math.min(100,Math.round(count/file.size*100));if(percent!==lastPercent){lastPercent=percent;progress(file.name+': '+percent+'%');}}
    const result=new Uint8Array(count);let at=0;for(const part of parts){result.set(part,at);at+=part.length;}data=result.buffer;
  }
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
  if(data.byteLength!==file.size||hash!==file.sha){await cache?.delete(url);throw Error('O modelo recebido está incompleto ou incorreto. Prepare novamente.');}
  if(!saved)try{await cache?.put(url,new Response(data));}catch{}
  return new Uint8Array(data);
}
var Module;
async function prepare(){
  if(recognizer)return;
  if(boot)return boot;
  boot=(async()=>{
    progress('Baixando Paraformer para mandarim e inglês (aproximadamente 249 MB no primeiro uso)…');
    let packed=new Uint8Array(237205534);
    // Sequential downloads limit peak memory; integrity is checked before loading.
    for(const file of files)packed.set(await bytes(file),file.offset);
    progress('Carregando reconhecimento de mandarim neste dispositivo…');
    await new Promise((resolve,reject)=>{
      Module={locateFile:path=>base+path,getPreloadedPackage:()=>packed.buffer,onRuntimeInitialized:resolve,onAbort:reason=>reject(Error('Falha ao iniciar Paraformer: '+reason)),print:()=>{},printErr:message=>console.warn('[Paraformer]',message)};
      importScripts(base+'sherpa-onnx-wasm-main-asr.js');
    });
    Module.getPreloadedPackage=null;packed=null;
    importScripts(base+'sherpa-onnx-asr.js');
    recognizer=createOnlineRecognizer(Module,{
      featConfig:{sampleRate:16000,featureDim:80},
      modelConfig:{transducer:{encoder:'',decoder:'',joiner:''},paraformer:{encoder:'./encoder.onnx',decoder:'./decoder.onnx'},zipformer2Ctc:{model:''},nemoCtc:{model:''},toneCtc:{model:''},tokens:'./tokens.txt',numThreads:1,provider:'cpu',debug:0,modelType:'',modelingUnit:'cjkchar',bpeVocab:''},
      decodingMethod:'greedy_search',maxActivePaths:4,enableEndpoint:0,rule1MinTrailingSilence:2.4,rule2MinTrailingSilence:1.2,rule3MinUtteranceLength:20,hotwordsFile:'',hotwordsScore:1.5,ctcFstDecoderConfig:{graph:'',maxActive:3000},ruleFsts:'',ruleFars:''
    });
    if(!recognizer.handle)throw Error('Não foi possível carregar o reconhecedor Paraformer.');
  })();
  return boot;
}
onmessage=async({data})=>{
  try{
    if(data.type==='prepare'){await prepare();postMessage({id:data.id,result:{ready:true}});return;}
    if(data.type!=='transcribe')throw Error('Operação desconhecida.');
    if(!recognizer)throw Error('Prepare o reconhecimento de mandarim primeiro.');
    if(!['zh','en'].includes(data.language))throw Error('Paraformer reconhece mandarim e inglês. Escolha outro motor para português ou espanhol.');
    const audio=new Float32Array(data.audio);if(audio.length>16000*11)throw Error('Trecho de áudio muito longo.');
    const start=performance.now(),stream=recognizer.createStream();let text;
    try{stream.acceptWaveform(16000,audio);stream.acceptWaveform(16000,new Float32Array(16000));stream.inputFinished();while(recognizer.isReady(stream))recognizer.decode(stream);text=recognizer.getResult(stream).text.trim();}finally{stream.free();}
    postMessage({id:data.id,result:{text,model:'Paraformer mandarim/inglês',processingMs:performance.now()-start}});
  }catch(error){postMessage({id:data.id,type:'error',error:error.message||String(error)});}
};
