window.followBeautyVideoFrames=function(source,draw,onError){
 let stopped=false,handle;const native=typeof source.requestVideoFrameCallback==='function';
 const schedule=()=>{handle=native?source.requestVideoFrameCallback(run):requestAnimationFrame(run)};
 function run(){if(stopped)return;try{draw()}catch(error){onError(error)}if(!stopped)schedule()}
 schedule();return ()=>{stopped=true;if(native)source.cancelVideoFrameCallback(handle);else cancelAnimationFrame(handle)};
};
window.createCompatibleBeauty=async function(input,getValues,status,onError,cancelled,signal){
 let values=getValues(),modules;
 async function loadModules(){return modules||=Promise.all([import('./gpupixel/renderer.js'),import('./face-tracking/facemesh.js')]);}
  async function createPipeline(input,ticket,mode='combined'){
    if(mode==='combined'){
      const skin=await createPipeline(input,ticket,'gpupixel');
      if(!skin)return null;
      try{
        if(cancelled()){skin.stop();return null;}
        const makeup=await createPipeline(skin.stream,ticket,'openmakeup');
        if(!makeup){skin.stop();return null;}
        return {stream:makeup.stream,stop(){makeup.stop();skin.stop();}};
      }catch(error){skin.stop();throw error;}
    }
    if(mode==='openmakeup'){const {createOpenMakeup}=await import('/openmakeup/adapter.js?v=20261031-native1');return createOpenMakeup(input,()=>values,text=>{if(!cancelled())status(text.replace('OpenMakeupSDK aplicado','Filtro de beleza aplicado'))},error=>{if(!cancelled())onError(error)},()=>cancelled());}

    const [{Renderer},{FaceMesh}]=await loadModules();
    if(cancelled())return null;
    const canvas=document.createElement('canvas'),source=document.createElement('video');source.muted=true;source.autoplay=true;source.playsInline=true;source.srcObject=input;
    let renderer,mesh,output,stopFrames,disposed=false,lastDetection=-1,lastVideoTime=-1;
    const stop=()=>{if(disposed)return;disposed=true;stopFrames?.();source.pause();source.srcObject=null;output?.getTracks().forEach(t=>t.stop());mesh?.close();renderer?.dispose();};
    try{
      if(!canvas.captureStream)throw Error('Este navegador não suporta câmera com efeitos.');
      renderer=new Renderer(canvas);await renderer.ready;mesh=new FaceMesh();
      await source.play();if(cancelled()){stop();return null}
      const ready=await mesh.load(()=>{if(!cancelled())status('Preparando o rastreamento do rosto… O primeiro uso baixa o modelo.')});
      if(cancelled()){stop();return null}
      if(ready!=='ready')throw Error('Não foi possível carregar o rastreamento facial. Verifique a conexão e tente ativar novamente.');
      let lastFaceStatus='';
      const draw=()=>{
        if(disposed||source.readyState<2||!source.videoWidth||lastVideoTime===source.currentTime)return;
        lastVideoTime=source.currentTime;const now=performance.now(),width=source.videoWidth,height=source.videoHeight,ratio=Math.min(1,960/width,720/height),w=Math.round(width*ratio),h=Math.round(height*ratio);
        
        if(now-lastDetection>100){mesh.detect(source,now);lastDetection=now}
        const points=mesh.presence>0?mesh.points:null,face=!!points;renderer.render(source,w,h,points,values);
        if(renderer.gl.isContextLost())throw Error('A aceleração de vídeo foi interrompida.');
        const text=face?'Efeito ativo. O aluno recebe sua câmera com o filtro.':'Efeito pronto. Aproxime o rosto da câmera para aplicar os ajustes.';if(text!==lastFaceStatus&&!cancelled()&&mode!=='gpupixel'){status(text);lastFaceStatus=text}
      };
      draw();output=canvas.captureStream();output.getVideoTracks()[0].contentHint='motion';stopFrames=window.followBeautyVideoFrames(source,draw,error=>{if(!disposed&&!cancelled())onError(error)});
      canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(!disposed&&!cancelled())onError(Error('A aceleração de vídeo foi interrompida.'))});
      return {stream:output,stop};
    }catch(error){stop();throw error}
  }

 const result=await createPipeline(input,0);if(!result)return null;
 const stop=result.stop.bind(result);result.stop=()=>{signal?.removeEventListener('abort',result.stop);stop()};signal?.addEventListener('abort',result.stop,{once:true});if(signal?.aborted||cancelled()){result.stop();return null;}
 result.setValues=next=>{values=next};return result;
};
