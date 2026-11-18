window.createBeauty=async function(input,values,status,onError,cancelled,signal){
 const [{Renderer},{FaceMesh},{MaskPainter},{computeFace},{buildWarps,faceUniforms,blurScaleFor},{defaults,toShader,DEFAULT_COLORS}]=await Promise.all(['renderer','facemesh','mask','face','warp','controls'].map(n=>import('/face-beautifier/'+n+'.js')));
 if(signal?.aborted||cancelled())return null;
 const video=document.createElement('video');video.muted=true;video.autoplay=true;video.playsInline=true;video.srcObject=input;video.style.cssText='position:fixed;width:1px;height:1px;opacity:.001;pointer-events:none';document.body.append(video);
 let renderer,mesh,output,clock,raf,visibility,stopped=false,frames=0,last=0;
 const canvas=document.createElement('canvas');
 function stop(){if(stopped)return;stopped=true;cancelAnimationFrame(raf);clock?.terminate();if(visibility)document.removeEventListener('visibilitychange',visibility);signal?.removeEventListener('abort',stop);mesh?.close();output?.getTracks().forEach(t=>t.stop());video.pause();video.srcObject=null;video.remove();renderer?.gl.getExtension('WEBGL_lose_context')?.loseContext();}
 try{
 await video.play();if(!video.videoWidth)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('A câmera não forneceu imagens.')),10000);video.addEventListener('loadeddata',()=>{clearTimeout(timer);resolve()},{once:true})});
 if(signal?.aborted||cancelled()){stop();return null;}
 renderer=new Renderer(canvas);mesh=new FaceMesh();const painter=new MaskPainter(320);let current={...values};
 const diagnostics={renderer:'face-beautifier',version:'20261118-face1',frames:0,tracking:'loading'};window.beautyDiagnostics=()=>({...diagnostics});
 function draw(){if(stopped)return;if(cancelled()){stop();return;}try{const now=performance.now(),w=video.videoWidth,h=video.videoHeight;if(!w||!h||video.readyState<2)return;renderer.resize(w,h);painter.setAspect(w/h);renderer.uploadSource(video,w,h);if(mesh.ready&&now-last>=80){mesh.detect(video,now);last=now;}const points=mesh.presence>0?mesh.points:null,face=computeFace(points,w/h);renderer.uploadMask(points?painter.paint(points):painter.clear());const v={...defaults(),...current,lipAmount:current.lipstick,blushAmount:current.blush},params=toShader(v,DEFAULT_COLORS);renderer.render({params,warps:buildWarps(face,params),face:faceUniforms(face,points?mesh.presence:0),blurScale:blurScaleFor(face,h,params.radius),mirror:0,compare:-1,showMask:false,time:now/1000});renderer.gl.flush();diagnostics.frames=++frames;output?.getVideoTracks()[0]?.requestFrame?.();}catch(error){stop();onError(error);}}
 function loop(){if(stopped)return;if(!document.hidden)draw();raf=requestAnimationFrame(loop);}
 draw();output=canvas.captureStream(0);if(!output.getVideoTracks()[0]?.requestFrame){output.getTracks().forEach(t=>t.stop());output=canvas.captureStream();}draw();loop();
 clock=new Worker('/beauty-clock.js');clock.onmessage=e=>{if(e.data?.type==='tick'){if(document.hidden)draw();clock?.postMessage({type:'consumed'});}};visibility=()=>clock.postMessage({type:'active',value:document.hidden});document.addEventListener('visibilitychange',visibility);visibility();
 signal?.addEventListener('abort',stop,{once:true});
 mesh.load().then(result=>{if(stopped){mesh.close();return;}diagnostics.tracking=result;status(result==='ready'?'Filtro de beleza ativo. O efeito aparece para os outros participantes.':'Filtro ativo com suavização por tom de pele; rastreamento facial indisponível.');});
 status('Filtro de beleza ativo. Preparando ajustes faciais…');
 return {stream:output,setValues(v){current={...v}},stop};
 }catch(error){stop();throw error;}
};
