(() => {
  let worker,sequence=0,prepared=false,preparation;
  const pending=new Map(),listeners=new Set();
  function abort(message='Paraformer interrompido. Prepare novamente ou escolha Reconhecimento do navegador.'){
    prepared=false;worker?.terminate();worker=null;
    for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error(message));}pending.clear();
  }
  function call(type,body={},transfer=[]){
    if(!worker){
      worker=new Worker('/paraformer-worker.js?v=1');const created=worker;
      worker.onmessage=({data})=>{
        if(worker!==created)return;
        if(data.type==='progress'){for(const task of pending.values()){clearTimeout(task.timer);task.timer=setTimeout(()=>abort('Download do modelo sem progresso. Prepare novamente.'),180000);}for(const listener of listeners)listener(data.message);return;}
        const task=pending.get(data.id);if(!task)return;pending.delete(data.id);clearTimeout(task.timer);if(data.type==='error')task.reject(Error(data.error));else task.resolve(data.result);
      };
      worker.onerror=()=>{if(worker===created)abort('Falha no Paraformer. O áudio da chamada continua ativo; escolha outro reconhecimento.');};
    }
    const id=++sequence;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>abort('Paraformer demorou demais. Prepare novamente ou escolha outro motor.'),180000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,type,...body},transfer);});
  }
  function prepare(){if(prepared)return Promise.resolve();if(preparation)return preparation;preparation=call('prepare').then(()=>{prepared=true;}).catch(error=>{abort(error.message);throw error;}).finally(()=>{preparation=null;});return preparation;}
  async function transcribe(audio,language){if(!prepared)throw Error('Clique em Preparar reconhecimento antes de ligar o microfone.');return call('transcribe',{audio:audio.buffer,language},[audio.buffer]);}
  window.paraformerASR={prepare,transcribe,abort,ready:()=>prepared,onProgress:listener=>listeners.add(listener)};
})();
