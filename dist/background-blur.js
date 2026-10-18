(() => {
 const button=document.createElement('button');button.type='button';button.id='backgroundBlur';button.textContent='Borrar fundo';button.hidden=true;button.setAttribute('aria-pressed','false');document.querySelector('.room-actions').prepend(button);
 const controls=document.createElement('label');controls.id='backgroundBlurControls';controls.hidden=true;
 const label=document.createElement('span');label.textContent='Intensidade do fundo';
 const slider=document.createElement('input');slider.id='backgroundBlurIntensity';slider.type='range';slider.min='1';slider.max='100';slider.step='1';slider.value='50';slider.setAttribute('aria-label','Intensidade do fundo');
 const value=document.createElement('output');value.textContent='50%';value.setAttribute('for','backgroundBlurIntensity');controls.append(label,slider,value);button.after(controls);
 const status=document.createElement('p');status.id='backgroundBlurStatus';status.setAttribute('role','status');document.getElementById('mediaStatus').after(status);
 const supported=()=>!!(window.MediaStreamTrackProcessor&&window.MediaStreamTrackGenerator&&window.OffscreenCanvas);
 let enabled=false,input,publish,pipeline,preparation,generation=0,intensity=50;
 const sync=()=>{controls.hidden=!enabled||button.hidden;slider.disabled=button.disabled;button.setAttribute('aria-pressed',String(enabled));button.textContent=enabled?'Fundo borrado':'Borrar fundo';};
 async function create(stream,signal){
  const clone=stream.getVideoTracks()[0].clone();let worker,output,timer,settled=false,rejectReady;
  const stop=()=>{signal.removeEventListener('abort',stop);clearTimeout(timer);worker?.terminate();clone.stop();output?.stop();if(!settled){settled=true;rejectReady?.(Error('Preparação do fundo cancelada.'));}};
  try{
   if(signal.aborted)throw Error('Preparação do fundo cancelada.');signal.addEventListener('abort',stop,{once:true});
   const processor=new MediaStreamTrackProcessor({track:clone,maxBufferSize:1});output=new MediaStreamTrackGenerator({kind:'video'});output.contentHint='motion';worker=new Worker('/background-runtime/v1/worker.js?v=20261017-strength1');
   await new Promise((resolve,reject)=>{rejectReady=reject;const fail=error=>{if(!settled){settled=true;clearTimeout(timer);reject(error);}else if(!signal.aborted)pause(error).catch(()=>{});};worker.onerror=event=>fail(Error(event.message||'O desfoque foi interrompido.'));worker.onmessage=({data})=>{if(data.type==='ready'&&!settled){settled=true;clearTimeout(timer);resolve();}else if(data.type==='error')fail(Error(data.message));};timer=setTimeout(()=>fail(Error('O desfoque demorou para carregar. Tente novamente.')),60000);worker.postMessage({type:'start',intensity,readable:processor.readable,writable:output.writable},[processor.readable,output.writable]);});
   return {stream:new MediaStream([output]),stop,setIntensity:value=>worker.postMessage({type:'intensity',value})};
  }catch(error){stop();throw error;}
 }
 async function pause(error){const old=pipeline;pipeline=null;try{await publish?.(null);}finally{old?.stop();status.textContent='Desfoque indisponível. Desative o fundo borrado para retomar a câmera.';}}
 async function apply(){
  const ticket=++generation;preparation?.abort();preparation=new AbortController();const controller=preparation,old=pipeline;pipeline=null;
  if(!input){old?.stop();status.textContent=enabled?'Desfoque selecionado. Ligue a câmera para aplicar.':'';sync();return;}
  if(!enabled){try{await publish?.(input);}finally{old?.stop();status.textContent='';}sync();return;}
  status.textContent='Preparando desfoque… A câmera fica pausada até o efeito estar pronto.';
  try{
   await publish?.(null);old?.stop();const next=await create(input,controller.signal);
   if(ticket!==generation){next.stop();return;}pipeline=next;next.setIntensity(intensity);await publish?.(next.stream);status.textContent='Fundo borrado. O efeito também aparece para a outra pessoa.';
  }catch(error){if(ticket===generation&&!controller.signal.aborted){console.warn('Desfoque de fundo:',error.message);pipeline?.stop();pipeline=null;status.textContent='Não foi possível borrar o fundo. Desative o efeito e tente novamente.';}}
  finally{sync();}
 }
 slider.oninput=()=>{const parsed=Number(slider.value);if(!Number.isFinite(parsed))return;intensity=Math.max(1,Math.min(100,parsed));slider.value=String(intensity);value.textContent=`${intensity}%`;pipeline?.setIntensity(intensity);};
 button.onclick=()=>{enabled=!enabled;sync();return apply();};
 window.backgroundBlur={
  configure(state){button.hidden=false;button.disabled=state.you.status!=='accepted'||!!state.ending||!!state.ended||!supported();button.title=supported()?'Borrar somente o fundo da sua câmera':'Desfoque disponível no Chrome e Edge atualizados.';sync();},
  async attach(stream,callback){input=stream;publish=callback;await apply();},
  detach(){generation++;preparation?.abort();pipeline?.stop();pipeline=null;input=null;publish=null;status.textContent='';},
  enabled:()=>enabled
 };
})();
