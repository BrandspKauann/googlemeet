// Restore the original DOM video -> GPUPixel canvas -> SDK canvas pipeline.
window.createBeauty=async function(input,values,status,onError,cancelled,signal){
 const diagnostics={version:'20261031-restore1',renderer:'native-dom',startedAt:Date.now(),stages:{},error:null};
 window.beautyDiagnostics=()=>({...diagnostics,stages:structuredClone(diagnostics.stages),camera:(()=>{const s=input.getVideoTracks()[0]?.getSettings?.()||{};return {width:s.width,height:s.height,frameRate:s.frameRate};})()});
 const frame=(stage,source,gl)=>{const previous=diagnostics.stages[stage];diagnostics.stages[stage]={frames:(previous?.frames||0)+1,lastFrameAt:Date.now(),sourceDecoded:source.getVideoPlaybackQuality?.().totalVideoFrames??null,width:source.videoWidth,height:source.videoHeight};if(gl&&!diagnostics.gpu){const ext=gl.getExtension('WEBGL_debug_renderer_info');diagnostics.gpu=gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER);}};
 const failure=error=>{diagnostics.error=error.message;if(!cancelled())onError(error)};
 if(signal?.aborted||cancelled())throw Error('Preparação do filtro cancelada.');
 const result=await window.createCompatibleBeauty(input,()=>values,status,failure,cancelled,signal,frame);
 if(!result)return null;
 if(signal?.aborted||cancelled()){result.stop();return null;}
 let stopped=false;const originalStop=result.stop;signal?.removeEventListener('abort',originalStop);const stop=originalStop.bind(result),watchdog=setInterval(()=>{if(Object.values(diagnostics.stages).some(stage=>Date.now()-stage.lastFrameAt>3000)){result.stop();failure(Error('O filtro parou de atualizar a câmera.'));}},500);
 result.stop=()=>{if(stopped)return;stopped=true;clearInterval(watchdog);signal?.removeEventListener('abort',result.stop);stop();};
 signal?.addEventListener('abort',result.stop,{once:true});if(signal?.aborted||cancelled()){result.stop();return null;}
 return result;
};
