async function startWorkerBeauty(input,values,onStatus,onError,cancelled,signal){
  if(!window.MediaStreamTrackProcessor||!window.MediaStreamTrackGenerator||!window.OffscreenCanvas)
    throw Error('Para manter o filtro em outra aba, use uma versão recente do Chrome ou Edge.');
  const track=input.getVideoTracks()[0].clone();
  let worker,output,timeout,settled=false,rejectReady,watchdog,lastFrame=0,failedOnce=false,reader,writer,inputAck,stopped=false,terminationTimer;
  const terminate=()=>{clearTimeout(terminationTimer);worker?.terminate();};
  const stop=()=>{if(stopped)return;stopped=true;signal?.removeEventListener('abort',stop);clearTimeout(timeout);clearInterval(watchdog);inputAck?.();reader?.cancel().catch(()=>{});writer?.abort().catch(()=>{});if(worker){terminationTimer=setTimeout(terminate,2000);try{worker.postMessage({type:'stop'});}catch{terminate();}}track.stop();output?.stop();if(!settled){settled=true;rejectReady?.(Error('Preparação do filtro cancelada.'));}};
  try{
    if(signal?.aborted)throw Error('Preparação do filtro cancelada.');
    signal?.addEventListener('abort',stop,{once:true});
    const processor=new MediaStreamTrackProcessor({track,maxBufferSize:1});reader=processor.readable.getReader();output=new MediaStreamTrackGenerator({kind:'video'});output.contentHint='motion';writer=output.writable.getWriter();
    worker=new Worker('/openmakeup/worker.js?v=20261030-frames3');
    let failed;
    const ready=new Promise((resolve,reject)=>{
      rejectReady=reject;
      failed=error=>{if(failedOnce||stopped)return;failedOnce=true;clearInterval(watchdog);if(!settled){settled=true;clearTimeout(timeout);reject(error);}else if(!cancelled())onError(error);};
      worker.onerror=event=>failed(Error(event.message||'O processamento do filtro foi interrompido.'));
      worker.onmessage=({data})=>{
        if(data.type==='stopped'){terminate();return;}
        if(data.type==='output'){
          const frame=data.frame;
          if(stopped){frame.close();return;}
          Promise.resolve().then(()=>writer.write(frame)).then(()=>{if(!stopped)worker.postMessage({type:'output-consumed'});}).catch(error=>failed(error)).finally(()=>frame.close());
        }
        else if(data.type==='input-consumed'){const resume=inputAck;inputAck=null;resume?.();}
        else if(data.type==='ready'&&!settled){settled=true;clearTimeout(timeout);lastFrame=Date.now();watchdog=setInterval(()=>{if(Date.now()-lastFrame>8000&&!cancelled()){failed(Error('O filtro parou de atualizar a câmera.'));stop();}},2000);resolve();}
        else if(data.type==='frame'){lastFrame=Date.now();}
        else if(data.type==='status'&&!cancelled())onStatus(data.message);
        else if(data.type==='error')failed(Error(data.message));
      };
      timeout=setTimeout(()=>failed(Error('Não foi possível preparar o filtro. Verifique a conexão e tente novamente.')),120000);
    });
    worker.postMessage({type:'start',values});
    // Transfer ownership of each VideoFrame explicitly. Transferred streams may
    // clone frames in some Chromium hosts and retain camera-pool buffers.
    (async()=>{try{while(!stopped){const {done,value:frame}=await reader.read();if(done){if(!stopped)throw Error('A câmera deixou de fornecer imagens.');break;}if(stopped){frame.close();break;}const consumed=new Promise(resolve=>inputAck=resolve);try{worker.postMessage({type:'input',frame},[frame]);}catch(error){frame.close();throw error;}await consumed;}}catch(error){failed(error);}})();
    await ready;if(cancelled()){stop();return null;}
    return {stream:new MediaStream([output]),stop,setValues(next){if(!stopped)worker.postMessage({type:'values',values:next})}};
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
