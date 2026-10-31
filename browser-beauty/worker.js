import {createFrameChannel} from './frame-channel.js';
import {createFrameClock} from './frame-clock.js';
import {OpenMakeup} from 'open-makeup-sdk';
import {CanvasTexture,LinearFilter,PlaneGeometry,SRGBColorSpace,Texture,TextureLoader} from 'three';



// The SDK uses window only for resize listeners and dimensions. No DOM rendering.
self.devicePixelRatio=1;self.innerWidth=640;self.innerHeight=480;
const textures=[];
TextureLoader.prototype.load=function(url,onLoad,onProgress,onError){
  const texture=new Texture();
  const pending=fetch(url).then(response=>{if(!response.ok)throw Error('Falha ao carregar textura.');return response.blob()})
    .then(blob=>createImageBitmap(blob,{imageOrientation:'flipY',premultiplyAlpha:'none',colorSpaceConversion:'none'}))
    .then(bitmap=>{texture.image=bitmap;texture.needsUpdate=true;onLoad?.(texture);return bitmap;});
  pending.catch(error=>onError?.(error));textures.push(pending);return texture;
};
const channel=createFrameChannel(self);
let values,stopped=false,reader,writer,skin,mesh,tracking,sdk;
onmessage=({data})=>{
  if(data.type==='stop'){dispose();return;}
  if(data.type==='input'){channel.push(data.frame);return;}
  if(data.type==='output-consumed'){channel.consumed();return;}
  if(data.type==='values'){values=data.values;return;}
  if(data.type==='start')run({readable:channel.readable,writable:channel.writable,values:data.values}).catch(error=>{if(!stopped)postMessage({type:'error',message:error.message||String(error)});dispose();}).finally(()=>postMessage({type:'stopped'}));
};
function dispose(){if(stopped)return;stopped=true;channel.abort();reader?.cancel().catch(()=>{});writer?.abort().catch(()=>{});tracking?.terminate();mesh?.close();skin?.dispose();sdk?.dispose();}
async function run({readable,writable,values:initial}){
  const {cachedFetch}=await import('/beauty-cache.js');self.fetch=cachedFetch;
  const [{Renderer},{FaceMesh}]=await Promise.all([import('/gpupixel/renderer.js'),import('/face-tracking/facemesh.js?v=20261031-smooth1')]);
  values=initial;reader=readable.getReader();writer=writable.getWriter();
  const first=await reader.read();if(first.done)throw Error('A câmera foi encerrada.');
  const ratio=Math.min(1,640/first.value.displayWidth,480/first.value.displayHeight);
  let w=Math.max(2,Math.round(first.value.displayWidth*ratio)),h=Math.max(2,Math.round(first.value.displayHeight*ratio));
  first.value.close();channel.release();
  const input=new OffscreenCanvas(w,h),ctx=input.getContext('2d');
  const softened=new OffscreenCanvas(w,h),output=new OffscreenCanvas(w,h);
  const owned=new OffscreenCanvas(w,h),readback=owned.getContext('2d',{willReadFrequently:true});
  skin=new Renderer(softened);await skin.ready;
  postMessage({type:'status',message:'Preparando rastreamento facial…'});
  // One shared detector, on a separate Worker. Rendering never waits for CPU
  // inference; at most one small bitmap is in flight and the latest landmarks
  // serve both skin/reshape and makeup.
  mesh=new FaceMesh({delegate:'CPU'});
  let trackingError,trackingBusy=false,landmarks,hasFace=false;
  tracking=new Worker('/openmakeup/tracker.js?v=20261031-smooth1');
  await new Promise((resolve,reject)=>{
    const fail=message=>{trackingError=Error(message);reject(trackingError);};
    tracking.onerror=event=>fail(event.message||'O rastreamento facial foi interrompido.');
    tracking.onmessage=({data})=>{
      if(data.type==='ready')resolve();
      else if(data.type==='error')fail(data.message);
      else if(data.type==='landmarks'){
        trackingBusy=false;landmarks=data.faceLandmarks;hasFace=!!landmarks?.length;
        mesh._ingest({faceLandmarks:landmarks},data.timestamp/1000,false);
      }
    };
    tracking.postMessage({type:'start'});
  });
  self.window=self;
  const video={videoWidth:w,videoHeight:h,readyState:2,HAVE_CURRENT_DATA:2,addEventListener(){},removeEventListener(){}};
  postMessage({type:'status',message:'Carregando o filtro de beleza…'});
  sdk=new OpenMakeup({video,renderCanvas:output,assetsBaseUrl:'/openmakeup/assets'});
  const engine=sdk.engine;
  engine._resolveMediaPipeClasses=()=>{};engine._setupFaceMesh=()=>{};engine._setupCamera=()=>{engine._camera={start(){},stop(){}}};engine._animate=()=>{};
  const setup=engine._setupScene.bind(engine);
  engine._setupScene=()=>{
    setup();engine.videoTexture.dispose();engine.videoTexture=new CanvasTexture(softened);engine.videoTexture.colorSpace=SRGBColorSpace;engine.videoTexture.minFilter=LinearFilter;engine.videoTexture.magFilter=LinearFilter;
    engine.videoPlane.material.map=engine.videoTexture;
    engine.renderer.debug.onShaderError=()=>{throw Error('Não foi possível compilar o filtro nesta GPU.');};
  };
  engine._sizeToVideoBox=()=>{
    engine.sceneSize.set(w,h);engine.renderer.setPixelRatio(1);engine.renderer.setSize(w,h,false);
    Object.assign(engine.camera3D,{left:-w/2,right:w/2,top:h/2,bottom:-h/2});engine.camera3D.updateProjectionMatrix();
    engine.videoPlane.geometry.dispose();engine.videoPlane.geometry=new PlaneGeometry(w,h);
  };
  await sdk.init();
  const deadline=performance.now()+20000;
  while(!engine.blushMat||!engine.lipsMat||!engine.faceVideoMesh){if(performance.now()>deadline)throw Error('O filtro demorou demais para carregar.');await new Promise(resolve=>setTimeout(resolve,25));}
  await Promise.all(textures);
  // Canvas textures are decoded to linear by WebGL. Match Three's background
  // output conversion in the SDK's custom face-warp shader as well.
  const warp=engine.faceVideoMesh.material,endWarp=warp.fragmentShader.lastIndexOf('}');
  warp.fragmentShader=warp.fragmentShader.slice(0,endWarp)+'\n#include <colorspace_fragment>\n'+warp.fragmentShader.slice(endWarp);warp.needsUpdate=true;
  for(const mat of [engine.blushMat,engine.lipsMat]){
    mat.uniforms.aulaIntensity={value:0};const end=mat.fragmentShader.lastIndexOf('}');
    mat.fragmentShader='uniform highp float aulaIntensity;\n'+mat.fragmentShader.slice(0,end)+'fragColor.a *= aulaIntensity;\n'+mat.fragmentShader.slice(end);mat.needsUpdate=true;
  }
  await sdk.apply('blush',{color:'#cc7180',finish:'matte'});await sdk.apply('lipstick',{color:'#a54b61',finish:'matte'});
  let lastDetection=-Infinity,ready=false,lastStatus,lastHeartbeat=-Infinity,renderMs=0,renderSamples=0;
  const frameClock=createFrameClock(20);
  while(!stopped){
    const {done,value:frame}=await reader.read();if(done){if(!stopped)throw Error('O filtro deixou de receber imagens da câmera.');break;}
    let released=false;const inputTimestamp=frame.timestamp;
    const release=()=>{if(!released){released=true;frame.close();channel.release();}};
    try{
      if(trackingError)throw trackingError;
      const now=performance.now(),timestamp=frameClock(now);if(timestamp===null)continue;
      const normalized=new VideoFrame(frame,{timestamp});
      try{ctx.drawImage(normalized,0,0,w,h);}finally{normalized.close();}
      // Release the physical camera buffer before inference, GPU readback or
      // output backpressure. Slow rendering must not starve the source camera.
      release();
      if(!trackingBusy&&now-lastDetection>=200){
        trackingBusy=true;lastDetection=now;
        createImageBitmap(input).then(bitmap=>{
          if(stopped){bitmap.close();return;}
          try{tracking.postMessage({type:'detect',bitmap,timestamp:now},[bitmap]);}
          catch(error){bitmap.close();trackingError=error;}
        }).catch(error=>{trackingError=error;trackingBusy=false;});
      }
      skin.render(input,w,h,mesh.presence>0?mesh.points:null,values);
      engine.faceObject3D.visible=hasFace;
      if(hasFace)engine._onResults({multiFaceLandmarks:landmarks});
      engine.blushMat.uniforms.aulaIntensity.value=values.blush/100;engine.lipsMat.uniforms.aulaIntensity.value=values.lipstick/100;
      engine.faceVideoMesh.visible=values.nose>0;
      sdk.setMorph('noseSlim',values.nose/100*.35);engine.videoTexture.needsUpdate=true;
      engine.renderer.render(engine.scene,engine.camera3D);
      if(skin.gl.isContextLost()||engine.renderer.getContext().isContextLost())throw Error('A aceleração de vídeo foi interrompida.');
      // Copy pixels into owned memory: do not transmit a mutable GPU canvas surface.
      readback.drawImage(output,0,0,w,h);
      const pixels=readback.getImageData(0,0,w,h);
      const processed=new VideoFrame(pixels.data,{format:'RGBA',codedWidth:w,codedHeight:h,timestamp});
      renderMs=renderSamples?renderMs*.9+(performance.now()-now)*.1:performance.now()-now;renderSamples++;
      try{await writer.write(processed);}finally{processed.close();}
      if(stopped)continue;
      if(!ready){ready=true;postMessage({type:'ready'});}
      if(now-lastHeartbeat>=1000){lastHeartbeat=now;postMessage({type:'frame',inputTimestamp,outputTimestamp:timestamp,renderMs,width:w,height:h});}
      if(lastStatus!==hasFace){lastStatus=hasFace;postMessage({type:'status',message:hasFace?'Filtro de beleza ativo, inclusive em outra aba.':'Filtro pronto. Aproxime o rosto da câmera para aplicar os ajustes.'});}
      // Software/slow GPUs must keep moving, with all effects still enabled.
      // Reduce processing resolution after sustained overload; never build a
      // backlog or oscillate resolution while the camera is running.
      if(renderSamples>=20&&renderMs>45&&w>384){
        const nextWidth=Math.max(384,Math.round(w*.75));h=Math.max(2,Math.round(h*nextWidth/w));w=nextWidth;
        for(const canvas of [input,softened,owned]){canvas.width=w;canvas.height=h;}
        engine._sizeToVideoBox();renderMs=0;renderSamples=0;
      }
    }finally{release();}
  }
  dispose();
}
