(() => {
 // Incremental recognition uses bounded audio snapshots, never an audio recording.
 function create(rate,{transcribe,preview,resample=window.asrUtils.resample}={}){
  let parts=[],size=0,total=0,quiet=0,voiceEnd=0,offset=0,turn=1,closed=false,pending=null,last=null,lastRequested=-Infinity;
  const reset=()=>{parts=[];size=total=quiet=voiceEnd=offset=0;last=null;lastRequested=-Infinity;turn++;};
  function push(part){
   if(closed)return;let energy=0;for(const n of part)energy+=n*n;const speaking=Math.sqrt(energy/Math.max(1,part.length))>=.003;
   if(!total&&!speaking)return;
   parts.push(part);size+=part.length;total+=part.length;quiet=speaking?0:quiet+part.length;if(speaking)voiceEnd=total;
   while(size>rate*8){const remove=Math.min(size-rate*8,parts[0].length);if(remove===parts[0].length)parts.shift();else parts[0]=parts[0].subarray(remove);size-=remove;offset+=remove;}
   if(pending||voiceEnd<rate*1.6)return;
   const ending=quiet>=rate*.35&&last?.voiceEnd!==voiceEnd;
   if(!ending&&(quiet>=rate*.35||total-lastRequested<rate*2.5))return;
   const keep=Math.max(0,size-quiet);if(keep<rate*.25)return;
   const audio=new Float32Array(keep);let at=0;for(const p of parts){const count=Math.min(p.length,keep-at);if(count<=0)break;audio.set(p.subarray(0,count),at);at+=count;}
   const record={turn,voiceEnd,offset,promise:null};lastRequested=total;last=record;
   pending=record.promise=Promise.resolve().then(()=>transcribe(resample(audio,rate))).then(result=>{
    if(!closed&&record.turn===turn&&result?.text)Promise.resolve(preview({text:result.text,turn,rolling:record.offset>0})).catch(()=>{});
    return result;
   }).catch(()=>null).finally(()=>{pending=null;});
  }
  function finish(){const result={turn,wait:pending||Promise.resolve(),match:last?.voiceEnd===voiceEnd&&last?.offset===0?last.promise:null};reset();return result;}
  function abort(){closed=true;reset();}
  return {push,finish,abort};
 }
 window.liveAudio={create};
})();
