import {FilesetResolver,ImageSegmenter} from '@mediapipe/tasks-vision';

let stopped=false,reader,writer,segmenter,intensity=50;
function dispose(){stopped=true;reader?.cancel().catch(()=>{});writer?.abort().catch(()=>{});segmenter?.close();}
function setIntensity(value){if(Number.isFinite(value))intensity=Math.max(1,Math.min(100,value));}
self.onmessage=({data})=>{if(data.type==='intensity'){setIntensity(data.value);return;}if(data.type==='start')run(data).catch(error=>{if(!stopped)self.postMessage({type:'error',message:error.message||'Desfoque indisponível.'});dispose();});};

async function run({readable,writable,intensity:initialIntensity}){
 setIntensity(initialIntensity);
 reader=readable.getReader();writer=writable.getWriter();
 const vision=await FilesetResolver.forVisionTasks('/background-runtime/v1/wasm');
 const options={baseOptions:{modelAssetPath:'/background-runtime/v1/selfie-segmenter.tflite',delegate:'GPU'},runningMode:'VIDEO',outputCategoryMask:false,outputConfidenceMasks:true};
 try{segmenter=await ImageSegmenter.createFromOptions(vision,options);}catch{options.baseOptions.delegate='CPU';segmenter=await ImageSegmenter.createFromOptions(vision,options);}
 const labels=segmenter.getLabels(),personIndex=Math.max(0,labels.findIndex(label=>/person|selfie|foreground/i.test(label)));
 let input,source,output,ctx,person,personCtx,mask,maskCtx,maskSmall,maskSmallCtx,maskPixels,previous;
 let width,height,lastDetection=-Infinity,lastFrame=-Infinity,ready=false;
 while(!stopped){
  const {done,value:frame}=await reader.read();if(done)break;
  try{
   if(frame.timestamp-lastFrame<1000000/24)continue;lastFrame=frame.timestamp;
   if(!input){const ratio=Math.min(1,960/frame.displayWidth,720/frame.displayHeight);width=Math.max(2,Math.round(frame.displayWidth*ratio));height=Math.max(2,Math.round(frame.displayHeight*ratio));input=new OffscreenCanvas(width,height);source=input.getContext('2d',{alpha:false});output=new OffscreenCanvas(width,height);ctx=output.getContext('2d',{alpha:false});person=new OffscreenCanvas(width,height);personCtx=person.getContext('2d');mask=new OffscreenCanvas(width,height);maskCtx=mask.getContext('2d');}
   source.drawImage(frame,0,0,width,height);const now=performance.now();
   if(now-lastDetection>=100){
    segmenter.segmentForVideo(input,now,result=>{
     const confidence=result.confidenceMasks?.[personIndex]||result.confidenceMasks?.[0];if(!confidence)throw Error('O modelo não retornou a separação do fundo.');
     const probabilities=confidence.getAsFloat32Array();
     if(!maskSmall||maskSmall.width!==confidence.width||maskSmall.height!==confidence.height){maskSmall=new OffscreenCanvas(confidence.width,confidence.height);maskSmallCtx=maskSmall.getContext('2d');maskPixels=maskSmallCtx.createImageData(confidence.width,confidence.height);previous=new Float32Array(probabilities.length);previous.fill(-1);}
     for(let i=0;i<probabilities.length;i++){const value=Math.max(0,Math.min(1,(probabilities[i]-.25)/.5));const alpha=value*value*(3-2*value),smooth=previous[i]<0?alpha:alpha*.8+previous[i]*.2;previous[i]=smooth;const at=i*4;maskPixels.data[at]=255;maskPixels.data[at+1]=255;maskPixels.data[at+2]=255;maskPixels.data[at+3]=Math.round(smooth*255);}
     maskSmallCtx.putImageData(maskPixels,0,0);maskCtx.clearRect(0,0,width,height);maskCtx.filter='blur(1.5px)';maskCtx.drawImage(maskSmall,0,0,width,height);maskCtx.filter='none';
    });lastDetection=now;
   }
   if(!maskSmall)throw Error('Não foi possível preparar o fundo.');
   personCtx.clearRect(0,0,width,height);personCtx.globalCompositeOperation='source-over';personCtx.drawImage(input,0,0);personCtx.globalCompositeOperation='destination-in';personCtx.drawImage(mask,0,0);personCtx.globalCompositeOperation='source-over';
   const radius=Math.max(1,Math.round(width*(.001+.048*intensity/100)));ctx.filter=`blur(${radius}px)`;ctx.drawImage(input,-radius*2,-radius*2,width+radius*4,height+radius*4);ctx.filter='none';ctx.drawImage(person,0,0);
   const processed=new VideoFrame(output,{timestamp:frame.timestamp});try{await writer.write(processed);}finally{processed.close();}
   if(!ready){ready=true;self.postMessage({type:'ready'});}
  }finally{frame.close();}
 }
 dispose();
}
