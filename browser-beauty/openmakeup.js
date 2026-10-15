import {OpenMakeup} from 'open-makeup-sdk';
import {PlaneGeometry} from 'three';

// Adapt the SDK to the existing call: never request or stop a second camera.
export async function createOpenMakeup(input, getValues, onStatus, onError, cancelled) {
  const {FaceMesh}=await import('/face-tracking/facemesh.js');
  const tracker=new FaceMesh();
  const source=document.createElement('video');source.muted=true;source.playsInline=true;source.srcObject=input;
  const canvas=document.createElement('canvas');
  let sdk,output,timer,disposed=false,lastTime=-1,lastDetection=0,hasFace=false;
  const stop=()=>{if(disposed)return;disposed=true;clearInterval(timer);output?.getTracks().forEach(t=>t.stop());sdk?.engine.scene?.traverse(object=>{object.geometry?.dispose();for(const mat of [object.material].flat().filter(Boolean)){for(const uniform of Object.values(mat.uniforms||{}))if(uniform.value?.isTexture)uniform.value.dispose();mat.map?.dispose();mat.dispose();}});sdk?.dispose();sdk?.engine.videoTexture?.dispose();sdk?.engine.renderer?.forceContextLoss();tracker.close();source.pause();source.srcObject=null;};
  try {
    await source.play();
    if(await tracker.load()!=='ready')throw Error('Não foi possível preparar o rastreamento do OpenMakeup.');
    if(cancelled()){stop();return null;}
    sdk=new OpenMakeup({video:source,renderCanvas:canvas,assetsBaseUrl:'/openmakeup/assets'});
    const engine=sdk.engine;
    // Tasks Vision supplies the same normalized 3D landmark interface.
    engine._resolveMediaPipeClasses=()=>{};
    engine._setupFaceMesh=()=>{};
    engine._setupCamera=()=>{engine._camera={start(){},stop(){}};};
    engine._animate=()=>{};
    const setup=engine._setupScene.bind(engine);
    engine._setupScene=()=>{setup();engine.renderer.debug.onShaderError=()=>{throw Error('Não foi possível compilar o efeito nesta GPU.');};};
    engine._sizeToVideoBox=()=>{
      const ratio=Math.min(1,960/source.videoWidth,720/source.videoHeight),w=Math.round(source.videoWidth*ratio),h=Math.round(source.videoHeight*ratio);
      engine.sceneSize.set(w,h);engine.renderer.setPixelRatio(1);engine.renderer.setSize(w,h,false);
      Object.assign(engine.camera3D,{left:-w/2,right:w/2,top:h/2,bottom:-h/2});engine.camera3D.updateProjectionMatrix();
      engine.videoPlane.geometry.dispose();engine.videoPlane.geometry=new PlaneGeometry(w,h);
    };
    await sdk.init();
    const deadline=performance.now()+20000;
    while(!engine.blushMat||!engine.lipsMat||!engine.faceVideoMesh){
      if(cancelled()){stop();return null;}
      if(performance.now()>deadline)throw Error('Os recursos do OpenMakeup não terminaram de carregar.');
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    for(const mat of [engine.blushMat,engine.lipsMat]){
      mat.uniforms.aulaIntensity={value:0};
      const end=mat.fragmentShader.lastIndexOf('}');
      mat.fragmentShader='uniform highp float aulaIntensity;\n'+mat.fragmentShader.slice(0,end)+'fragColor.a *= aulaIntensity;\n'+mat.fragmentShader.slice(end);
      mat.needsUpdate=true;
    }
    await sdk.apply('blush',{color:'#cc7180',finish:'matte'});
    await sdk.apply('lipstick',{color:'#a54b61',finish:'matte'});
    // Never leave a face-shaped patch when no face is present.
    const draw=()=>{
      if(disposed||source.readyState<2||source.currentTime===lastTime)return;
      lastTime=source.currentTime;
      const now=performance.now();
      if(now-lastDetection>=100){
        const result=tracker.landmarker.detectForVideo(source,now);
        hasFace=!!result.faceLandmarks?.length;
        engine.faceObject3D.visible=hasFace;
        if(hasFace)engine._onResults({multiFaceLandmarks:result.faceLandmarks});
        lastDetection=now;
      }
      const values=getValues();
      engine.blushMat.uniforms.aulaIntensity.value=values.blush/100;
      engine.lipsMat.uniforms.aulaIntensity.value=values.lipstick/100;
      sdk.setMorph('noseSlim',values.nose/100*.35);
      if(engine.renderer.getContext().isContextLost())throw Error('A aceleração de vídeo foi interrompida.');
      engine.renderer.render(engine.scene,engine.camera3D);
      onStatus(hasFace?'Efeito ativo. OpenMakeupSDK aplicado à câmera enviada ao aluno.':'Efeito pronto. Aproxime o rosto da câmera para aplicar os ajustes.');
    };
    if(cancelled()){stop();return null;}
    draw();output=canvas.captureStream(24);
    timer=setInterval(()=>{try{draw()}catch(error){if(!disposed)onError(error);}},1000/24);
    return {stream:output,stop};
  }catch(error){stop();throw error;}
}

