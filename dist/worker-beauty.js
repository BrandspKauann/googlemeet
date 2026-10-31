async function startWorkerBeauty(input,values,onStatus,onError,cancelled,signal){
  if(!window.MediaStreamTrackProcessor||!window.OffscreenCanvas)
    throw Error('Para manter o filtro em outra aba, use uma versão recente do Chrome ou Edge.');
  const track=input.getVideoTracks()[0].clone();
  let worker,output,timeout,settled=false,rejectReady,watchdog,lastFrame=0,lastRendered=0,failedOnce=false,reader,monitorReader,monitorTrack,inputAck,stopped=false,terminationTimer;
  const terminate=()=>{clearTimeout(terminationTimer);worker?.terminate();};
  const stop=()=>{if(stopped)return;stopped=true;signal?.removeEventListener('abort',stop);clearTimeout(timeout);clearInterval(watchdog);inputAck?.();reader?.cancel().catch(()=>{});monitorReader?.cancel().catch(()=>{});monitorTrack?.stop();if(worker){terminationTimer=setTimeout(terminate,2000);try{worker.postMessage({type:'stop'});}catch{terminate();}}track.stop();output?.stop();if(!settled){settled=true;rejectReady?.(Error('Preparação do filtro cancelada.'));}};
  try{
    if(signal?.aborted)throw Error('Preparação do filtro cancelada.');
    signal?.addEventListener('abort',stop,{once:true});
    const processor=new MediaStreamTrackProcessor({track,maxBufferSize:1});reader=processor.readable.getReader();
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{alpha:false});
    if(!canvas.captureStream||!ctx)throw Error('Captura da câmera com efeitos indisponível.');
    // No frame-rate argument: capture follows completed camera frames, with no
    // artificial FPS cap. Native canvas capture supplies browser-owned timing.
    const stream=canvas.captureStream();output=stream.getVideoTracks()[0];output.contentHint='motion';
    monitorTrack=output.clone();monitorReader=new MediaStreamTrackProcessor({track:monitorTrack,maxBufferSize:1}).readable.getReader();
    worker=new Worker('/openmakeup/worker.js?v=20261031-native1');
    let failed;
    const ready=new Promise((resolve,reject)=>{
      rejectReady=reject;
      failed=error=>{if(failedOnce||stopped)return;failedOnce=true;clearInterval(watchdog);if(!settled){settled=true;clearTimeout(timeout);reject(error);}else if(!cancelled())onError(error);};
      worker.onerror=event=>failed(Error(event.message||'O processamento do filtro foi interrompido.'));
      worker.onmessage=({data})=>{
        if(data.type==='stopped'){terminate();return;}
        if(data.type==='output'){
          const frame=data.frame;
          if(stopped)return;
          try{
            if(canvas.width!==frame.width||canvas.height!==frame.height){canvas.width=frame.width;canvas.height=frame.height;}
            ctx.putImageData(new ImageData(frame.pixels,frame.width,frame.height),0,0);
            output.requestFrame?.();
            lastRendered=Date.now();
            worker.postMessage({type:'output-consumed'});
          }catch(error){failed(error);}
        }
        else if(data.type==='input-consumed'){const resume=inputAck;inputAck=null;resume?.();}
        else if(data.type==='ready'&&!settled){settled=true;clearTimeout(timeout);lastFrame=lastRendered=Date.now();watchdog=setInterval(()=>{if((Date.now()-lastFrame>2500||Date.now()-lastRendered>2500)&&!cancelled()){failed(Error('O filtro parou de atualizar a câmera.'));stop();}},500);resolve();}
        else if(data.type==='status'&&!cancelled())onStatus(data.message);
        else if(data.type==='error')failed(Error(data.message));
      };
      timeout=setTimeout(()=>failed(Error('Não foi possível preparar o filtro. Verifique a conexão e tente novamente.')),120000);
    });
    // Check real captured output, not just Worker activity or successful writes.
    // A live Worker must not conceal a frozen outgoing track.
    (async()=>{try{while(!stopped){const {done,value:frame}=await monitorReader.read();if(done)break;lastFrame=Date.now();frame.close();}}catch(error){if(!stopped)failed(error);}})();
    worker.postMessage({type:'start',values});
    // Transfer ownership of each VideoFrame explicitly. Transferred streams may
    // clone frames in some Chromium hosts and retain camera-pool buffers.
    (async()=>{try{while(!stopped){const {done,value:frame}=await reader.read();if(done){if(!stopped)throw Error('A câmera deixou de fornecer imagens.');break;}if(stopped){frame.close();break;}const consumed=new Promise(resolve=>inputAck=resolve);try{worker.postMessage({type:'input',frame},[frame]);}catch(error){frame.close();throw error;}await consumed;}}catch(error){failed(error);}})();
    await ready;if(cancelled()){stop();return null;}
    return {stream,stop,setValues(next){if(!stopped)worker.postMessage({type:'values',values:next})}};
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
