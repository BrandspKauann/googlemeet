// Native camera -> owned RGBA copies -> filter -> native canvas capture.
// Physical camera frames never cross a Worker boundary.
window.createWorkerBeauty=async function(input,values,status,onError,cancelled,signal){
 if(!window.Worker||!window.OffscreenCanvas)return window.createCompatibleBeauty(input,()=>values,status,onError,cancelled,signal);
 const camera=input.getVideoTracks()[0].clone(),source=document.createElement('video');
 source.muted=true;source.autoplay=true;source.playsInline=true;source.srcObject=new MediaStream([camera]);
 source.setAttribute('aria-hidden','true');source.style.cssText='position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:.01;pointer-events:none';document.body.append(source);
 let worker,output,monitor,stopMonitor,stopFrames,timer,watchdog,terminationTimer,settled=false,stopped=false,failedOnce=false,rejectReady;
 let available=true,lastTime=-1,lastRendered=Date.now(),lastCaptured=Date.now();
 const terminate=()=>{clearTimeout(terminationTimer);worker?.terminate()};
 const stop=()=>{
  if(stopped)return;stopped=true;signal?.removeEventListener('abort',stop);clearTimeout(timer);clearInterval(watchdog);stopFrames?.();
  source.pause();source.srcObject=null;source.remove();camera.stop();stopMonitor?.();if(monitor){monitor.pause();monitor.srcObject=null;monitor.remove();}output?.stop();
  if(worker){terminationTimer=setTimeout(terminate,2000);try{worker.postMessage({type:'stop'})}catch{terminate()}}
  if(!settled){settled=true;rejectReady?.(Error('Preparação do filtro cancelada.'))}
 };
 try{
  if(signal?.aborted||cancelled())throw Error('Preparação do filtro cancelada.');signal?.addEventListener('abort',stop,{once:true});
  const capture=document.createElement('canvas'),copy=capture.getContext('2d',{alpha:false,willReadFrequently:true});
  const canvas=document.createElement('canvas'),draw=canvas.getContext('2d',{alpha:false});
  if(!copy||!draw||!canvas.captureStream)throw Error('Este navegador não suporta câmera com efeitos.');
  const stream=canvas.captureStream();output=stream.getVideoTracks()[0];output.contentHint='motion';
  worker=new Worker('/openmakeup/worker.js?v=20261031-reinstall1');
  let fail;
  const captureLatest=()=>{
   if(stopped||!available)return;
   try{
    if(source.readyState<2||!source.videoWidth||source.currentTime===lastTime){worker.postMessage({type:'input-wait'});return;}
    const ratio=Math.min(1,640/source.videoWidth,480/source.videoHeight),width=Math.max(2,Math.round(source.videoWidth*ratio)),height=Math.max(2,Math.round(source.videoHeight*ratio));
    if(capture.width!==width||capture.height!==height){capture.width=width;capture.height=height;}
    copy.drawImage(source,0,0,width,height);const image=copy.getImageData(0,0,width,height);
    lastTime=source.currentTime;available=false;
    worker.postMessage({type:'input',frame:{pixels:image.data,width,height,timestamp:Math.round(lastTime*1000000)}},[image.data.buffer]);
   }catch(error){fail(error)}
  };
  const ready=new Promise((resolve,reject)=>{
   rejectReady=reject;
   fail=error=>{if(stopped||failedOnce)return;failedOnce=true;clearInterval(watchdog);if(!settled){settled=true;clearTimeout(timer);reject(error)}else if(!cancelled())onError(error)};
   worker.onerror=event=>fail(Error(event.message||'O filtro foi interrompido.'));
   worker.onmessage=({data})=>{
    if(data.type==='stopped'){terminate();return;}
    if(stopped)return;
    if(data.type==='request-input')captureLatest();
    else if(data.type==='input-consumed'){available=true;captureLatest();}
    else if(data.type==='output'){
     try{
      const frame=data.frame;if(canvas.width!==frame.width||canvas.height!==frame.height){canvas.width=frame.width;canvas.height=frame.height;}
      draw.putImageData(new ImageData(frame.pixels,frame.width,frame.height),0,0);output.requestFrame?.();lastRendered=Date.now();worker.postMessage({type:'output-consumed'});
     }catch(error){fail(error)}
    }else if(data.type==='ready'&&!settled){
     settled=true;clearTimeout(timer);lastRendered=lastCaptured=Date.now();
     watchdog=setInterval(()=>{if((Date.now()-lastRendered>2500||(monitor&&Date.now()-lastCaptured>2500))&&!cancelled()){fail(Error('O filtro parou de atualizar a câmera.'));stop()}},500);resolve();
    }else if(data.type==='status'&&!cancelled())status(data.message);
    else if(data.type==='error')fail(Error(data.message));
   };
   timer=setTimeout(()=>fail(Error('Não foi possível preparar o filtro. Reinstale os recursos e tente novamente.')),120000);
  });
  // Observe decoded native output without TrackProcessor/TrackGenerator APIs.
  monitor=document.createElement('video');monitor.muted=true;monitor.playsInline=true;monitor.srcObject=stream;monitor.style.cssText=source.style.cssText;monitor.setAttribute('aria-hidden','true');document.body.append(monitor);
  let observedTime=-1;
  stopMonitor=window.followBeautyVideoFrames(monitor,()=>{if(monitor.currentTime!==observedTime){observedTime=monitor.currentTime;lastCaptured=Date.now();}},fail);
  Promise.resolve(monitor.play()).catch(fail);
  worker.postMessage({type:'start',values});
  stopFrames=window.followBeautyVideoFrames(source,captureLatest,fail);
  Promise.resolve(source.play()).then(captureLatest).catch(fail);
  await ready;if(cancelled()){stop();return null;}
  return {stream,stop,setValues(next){if(!stopped)worker.postMessage({type:'values',values:next})}};
 }catch(error){stop();throw error;}
};
