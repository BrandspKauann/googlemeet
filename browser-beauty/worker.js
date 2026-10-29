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
let values,stopped=false,reader,writer,skin,mesh,makeupMesh,sdk;
onmessage=({data})=>{
  if(data.type==='values'){values=data.values;return;}
  if(data.type==='start')run(data).catch(error=>{if(!stopped)postMessage({type:'error',message:error.message||String(error)});dispose();});
};
function dispose(){stopped=true;reader?.cancel().catch(()=>{});writer?.abort().catch(()=>{});mesh?.close();makeupMesh?.close();skin?.dispose();sdk?.dispose();}
async function run({readable,writable,values:initial}){
  const {cachedFetch}=await import('/beauty-cache.js');self.fetch=cachedFetch;
  const [{Renderer},{FaceMesh}]=await Promise.all([import('/gpupixel/renderer.js'),import('/face-tracking/facemesh.js?v=20261028-stable1')]);
  values=initial;reader=readable.getReader();writer=writable.getWriter();
  const first=await reader.read();if(first.done)throw Error('A câmera foi encerrada.');
  const ratio=Math.min(1,640/first.value.displayWidth,480/first.value.displayHeight);
  const w=Math.max(2,Math.round(first.value.displayWidth*ratio)),h=Math.max(2,Math.round(first.value.displayHeight*ratio));
  first.value.close();
  const input=new OffscreenCanvas(w,h),ctx=input.getContext('2d');
  const softened=new OffscreenCanvas(w,h),output=new OffscreenCanvas(w,h);
  skin=new Renderer(softened);await skin.ready;
  postMessage({type:'status',message:'Preparando rastreamento facial…'});
  mesh=new FaceMesh({delegate:'CPU'});if(await mesh.load()!=='ready')throw Error('Não foi possível preparar o rastreamento facial.');
  makeupMesh=new FaceMesh({delegate:'CPU'});if(await makeupMesh.load()!=='ready')throw Error('Não foi possível preparar a maquiagem.');
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
  let lastMakeupDetection=-Infinity,lastDetection=-Infinity,lastFrame=-Infinity,hasFace=false,landmarks,ready=false,lastStatus,lastHeartbeat=-Infinity;
  while(!stopped){
    const {done,value:frame}=await reader.read();if(done){if(!stopped)throw Error('O filtro deixou de receber imagens da câmera.');break;}
    try{
      if(frame.timestamp-lastFrame<1000000/20)continue;lastFrame=frame.timestamp;
      ctx.drawImage(frame,0,0,w,h);const now=performance.now();
      if(now-lastDetection>=200){
        const result=mesh.landmarker.detectForVideo(input,now);landmarks=result.faceLandmarks;
        mesh._ingest(result,now/1000,false);hasFace=!!landmarks?.length;lastDetection=now;
      }
      skin.render(input,w,h,mesh.presence>0?mesh.points:null,values);
      if(now-lastMakeupDetection>=200){const result=makeupMesh.landmarker.detectForVideo(softened,now);landmarks=result.faceLandmarks;hasFace=!!landmarks?.length;lastMakeupDetection=now;}
      engine.faceObject3D.visible=hasFace;
      if(hasFace)engine._onResults({multiFaceLandmarks:landmarks});
      engine.blushMat.uniforms.aulaIntensity.value=values.blush/100;engine.lipsMat.uniforms.aulaIntensity.value=values.lipstick/100;
      engine.faceVideoMesh.visible=values.nose>0;
      sdk.setMorph('noseSlim',values.nose/100*.35);engine.videoTexture.needsUpdate=true;
      engine.renderer.render(engine.scene,engine.camera3D);
      if(skin.gl.isContextLost()||engine.renderer.getContext().isContextLost())throw Error('A aceleração de vídeo foi interrompida.');
      const processed=new VideoFrame(output,{timestamp:frame.timestamp});
      try{await writer.write(processed);}finally{processed.close();}
      if(!ready){ready=true;postMessage({type:'ready'});}
      if(now-lastHeartbeat>=1000){lastHeartbeat=now;postMessage({type:'frame'});}
      if(lastStatus!==hasFace){lastStatus=hasFace;postMessage({type:'status',message:hasFace?'Filtro de beleza ativo, inclusive em outra aba.':'Filtro pronto. Aproxime o rosto da câmera para aplicar os ajustes.'});}
    }finally{frame.close();}
  }
  dispose();
}
