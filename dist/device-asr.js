(() => {
 let worker,sequence=0,ready=false,preparation,generation=0;
 const requests=new Map();
 const listeners=new Set();
 function progress(value){for(const listener of listeners)listener(value)}
 function dispose(message='Reconhecimento interrompido.'){
  ready=false;generation++;worker?.terminate();worker=null;
  for(const {reject,timer}of requests.values()){clearTimeout(timer);reject(Error(message))}requests.clear();
 }
 function ensureWorker(){
  if(worker)return;
  worker=new Worker('/whisper-worker.js',{type:'module'});const created=worker;
  worker.onmessage=({data})=>{if(worker!==created)return;
   if(data.type==='progress'){for(const request of requests.values())if(request.type==='prepare'){clearTimeout(request.timer);request.timer=setTimeout(()=>dispose('Download sem progresso por dois minutos. Prepare novamente ou escolha outro motor.'),120000)}progress(data.progress);return}
   const request=requests.get(data.id);if(!request)return;requests.delete(data.id);clearTimeout(request.timer);
   if(data.type==='error'){request.reject(Error(data.error));dispose(data.error)}else request.resolve(data.result);
  };
  worker.onerror=()=>{if(worker===created)dispose('Falha no Worker do Whisper. Prepare novamente ou escolha Reconhecimento do navegador.');};
 }
 function call(type,body={},transfer=[]){
  ensureWorker();const id=++sequence;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>dispose('Whisper excedeu o tempo de processamento. Escolha outro motor.'),120000);requests.set(id,{resolve,reject,timer,type});worker.postMessage({id,type,...body},transfer)});
 }
 async function decode(buffer){
  const context=new AudioContext();try{const audio=await context.decodeAudioData(buffer.slice(0));const mono=new Float32Array(audio.length);for(let c=0;c<audio.numberOfChannels;c++){const channel=audio.getChannelData(c);for(let i=0;i<mono.length;i++)mono[i]+=channel[i]/audio.numberOfChannels}return window.asrUtils.resample(mono,audio.sampleRate)}finally{await context.close()}
 }
 async function transcribe(audio,language){if(!ready)throw Error('Prepare e valide o Whisper primeiro.');return call('transcribe',{audio:audio.buffer,language},[audio.buffer])}
 async function prepare(){
  if(ready)return;if(preparation)return preparation;
  preparation=(async()=>{
   try{
    if(!navigator.gpu)throw Error('Este dispositivo não tem WebGPU. Escolha Reconhecimento do navegador.');
    const current=generation;await call('prepare');
    progress({status:'validation',file:'Verificando áudio conhecido…'});
    const response=await fetch('/asr-fixture.wav');if(!response.ok)throw Error('Amostra de validação indisponível.');
    const audio=await decode(await response.arrayBuffer());if(current!==generation)throw Error('Preparação cancelada.');
    const result=await call('transcribe',{audio:audio.buffer,language:'pt'},[audio.buffer]);
    const expected='Olá, tudo bem? Hoje vamos aprender português. Você pode compartilhar sua tela e acompanhar a tradução da aula.';
    const rate=window.asrUtils.errorRate(expected,result.text);
    if(rate>0.35||!Number.isFinite(rate))throw Error('O modelo não passou na amostra de validação deste dispositivo. Escolha Reconhecimento do navegador.');
    if(current!==generation)throw Error('Preparação cancelada.');
    ready=true;progress({status:'ready',validation:{text:result.text,errorRate:rate,processingMs:result.processingMs},file:'Whisper pronto — experimental. Amostra sintética validada.'});
   }catch(error){dispose(error.message);throw error}
  })().finally(()=>preparation=null);return preparation;
 }
 window.deviceASR={prepare,transcribe,decode,ready:()=>ready,abort:message=>dispose(message),onProgress:listener=>{listeners.add(listener);return()=>listeners.delete(listener)}};
})();
