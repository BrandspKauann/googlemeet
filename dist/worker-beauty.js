async function startWorkerBeauty(input,values,onStatus,onError,cancelled,signal){
  if(!window.MediaStreamTrackProcessor||!window.MediaStreamTrackGenerator||!window.OffscreenCanvas)
    throw Error('Para manter o filtro em outra aba, use uma versão recente do Chrome ou Edge.');
  const track=input.getVideoTracks()[0].clone();
  let worker,output,timeout,settled=false,rejectReady;
  const stop=()=>{signal?.removeEventListener('abort',stop);clearTimeout(timeout);worker?.terminate();track.stop();output?.stop();if(!settled){settled=true;rejectReady?.(Error('Preparação do filtro cancelada.'));}};
  try{
    if(signal?.aborted)throw Error('Preparação do filtro cancelada.');
    signal?.addEventListener('abort',stop,{once:true});
    const processor=new MediaStreamTrackProcessor({track,maxBufferSize:1});output=new MediaStreamTrackGenerator({kind:'video'});output.contentHint='motion';
    worker=new Worker('/openmakeup/worker.js?v=1');
    const ready=new Promise((resolve,reject)=>{
      rejectReady=reject;
      const failed=error=>{if(!settled){settled=true;clearTimeout(timeout);reject(error);}else if(!cancelled())onError(error);};
      worker.onerror=event=>failed(Error(event.message||'O processamento do filtro foi interrompido.'));
      worker.onmessage=({data})=>{
        if(data.type==='ready'&&!settled){settled=true;clearTimeout(timeout);resolve();}
        else if(data.type==='status'&&!cancelled())onStatus(data.message);
        else if(data.type==='error')failed(Error(data.message));
      };
      timeout=setTimeout(()=>failed(Error('Não foi possível preparar o filtro. Verifique a conexão e tente novamente.')),120000);
    });
    worker.postMessage({type:'start',readable:processor.readable,writable:output.writable,values},[processor.readable,output.writable]);
    await ready;if(cancelled()){stop();return null;}
    return {stream:new MediaStream([output]),stop,setValues(next){worker.postMessage({type:'values',values:next})}};
  }catch(error){stop();throw error;}
};

window.createWorkerBeauty=async function(input,values,onStatus,onError,cancelled,signal){
 try{return await startWorkerBeauty(input,values,onStatus,onError,cancelled,signal)}catch(error){
  if(signal?.aborted||cancelled())throw error;
  console.warn('Filtro: processamento em segundo plano indisponível:',error.message);
  onStatus('Preparando filtro no modo compatível…');
  try{return await window.createCompatibleBeauty(input,()=>values,text=>onStatus(text+' Modo compatível: mantenha a aba da aula aberta.'),onError,cancelled,signal)}catch(fallbackError){throw Error('Não foi possível ativar o filtro. '+fallbackError.message+' Tente baixar os recursos ou usar o Chrome/Edge atualizado.');}
 }
};
