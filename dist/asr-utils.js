(() => {
 function resample(samples,from,to=16000) {
  if(from===to)return new Float32Array(samples);
  const ratio=from/to,out=new Float32Array(Math.floor(samples.length/ratio));
  // Area averaging provides anti-aliasing when reducing the sample rate.
  for(let i=0;i<out.length;i++) {
   const start=i*ratio,end=(i+1)*ratio;let value=0;
   for(let k=Math.floor(start);k<Math.ceil(end);k++)value+=(samples[k]||0)*Math.max(0,Math.min(end,k+1)-Math.max(start,k));
   out[i]=value/ratio;
  }
  return out;
 }
 // Keep a whole speaking turn until the participant pauses, then submit it.
 function createPauseBuffer(rate,{pauseSeconds=6,segmentSeconds=10,maxSegments=120}={}){
  let parts=[],count=0,quiet=0,active=false,segments=[];
  function seal(trim=0){
   const keep=Math.max(0,count-Math.min(trim,count));
   if(keep>=rate*.25){
    const mono=new Float32Array(keep);let at=0,power=0;
    for(const part of parts){const n=Math.min(part.length,keep-at);if(n<=0)break;mono.set(part.subarray(0,n),at);for(let i=0;i<n;i++)power+=part[i]*part[i];at+=n;}
    if(Math.sqrt(power/keep)>=.002){const pcm=resample(mono,rate);for(let offset=0;offset<pcm.length;offset+=16000*segmentSeconds)segments.push(pcm.slice(offset,offset+16000*segmentSeconds));}
   }
   parts=[];count=0;
  }
  function flush(){seal(quiet);const result=segments;segments=[];quiet=0;active=false;return result.length?result:null;}
  function push(part){
   let energy=0;for(const sample of part)energy+=sample*sample;
   const speaking=Math.sqrt(energy/Math.max(1,part.length))>=.003;
   if(!active&&!speaking)return null;active=true;parts.push(part);count+=part.length;quiet=speaking?0:quiet+part.length;
   if(quiet>=rate*pauseSeconds)return flush();
   if(count>=rate*segmentSeconds)seal();
   if(segments.length>maxSegments)throw Error('Fala contínua muito longa. Desligue o microfone para concluir os trechos pendentes.');
   return null;
  }
  function abort(){parts=[];segments=[];count=0;quiet=0;active=false;}
  return {push,flush,abort};
 }
 function normalize(text){return text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}]/gu,'').trim().split(/\s+/).filter(Boolean)}
 function errorRate(reference,text,language='pt') {
  const tokens=t=>language==='zh'?Array.from(normalize(t).join('')):normalize(t);const a=tokens(reference),b=tokens(text);let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next}
  return row[b.length]/Math.max(1,a.length);
 }
 function createGrouper(emit,{setTimer=setTimeout,clearTimer=clearTimeout,idleMs=()=>2000}={}) {
  let pending='',identity='',idle,maximum,queue=Promise.resolve();
  function flush(){clearTimer(idle);clearTimer(maximum);idle=maximum=undefined;if(!pending)return queue;const text=pending;pending='';queue=queue.then(()=>emit(text));return queue}
  function push(text,key='') {
   text=text.trim();if(!text)return queue;
   if(identity!==key)flush();identity=key;
   if(!pending)maximum=setTimer(()=>flush(),10000);
   pending+=(pending?' ':'')+text;
   clearTimer(idle);
   if(/[.!?。！？][”"’')]*$/.test(text))return flush();
   idle=setTimer(()=>flush(),idleMs());return queue;
  }
  function abort(){clearTimer(idle);clearTimer(maximum);pending=''}
  return {push,flush,abort};
 }
 function progressLabel(p){if(p.status!=='progress')return p.file||p.status||'Preparando…';const mb=n=>(n/1048576).toFixed(1);const part=p.file?.includes('encoder')?' (parte 1/2)':p.file?.includes('decoder')?' (parte 2/2)':'';return 'Baixando modelo'+part+' · '+Math.round(p.progress||0)+'%'+(Number.isFinite(p.loaded)&&Number.isFinite(p.total)?' · '+mb(p.loaded)+' MB de '+mb(p.total)+' MB':'')}
 window.asrUtils={resample,createPauseBuffer,errorRate,createGrouper,progressLabel};
})();
