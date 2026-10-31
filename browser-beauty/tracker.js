// Face inference must never block camera rendering or retain camera frames.
let tracker,stopped=false;
self.onmessage=async({data})=>{
 if(data.type==='stop'){stopped=true;tracker?.close();self.close();return;}
 if(data.type==='start'){
  try{
   const {cachedFetch}=await import('/beauty-cache.js');self.fetch=cachedFetch;
   const {FaceMesh}=await import('/face-tracking/facemesh.js?v=20261031-smooth1');
   tracker=new FaceMesh({delegate:'CPU'});
   if(await tracker.load()!=='ready')throw Error('Não foi possível preparar o rastreamento facial.');
   if(!stopped)postMessage({type:'ready'});
  }catch(error){postMessage({type:'error',message:error.message});}
 }
 if(data.type==='detect'){
  try{
   if(!stopped){const result=tracker.landmarker.detectForVideo(data.bitmap,data.timestamp);postMessage({type:'landmarks',faceLandmarks:result.faceLandmarks,timestamp:data.timestamp});}
  }catch(error){if(!stopped)postMessage({type:'error',message:error.message});}
  finally{data.bitmap.close();}
 }
};
