(() => {
  const el=id=>document.getElementById(id);
  const button=document.createElement('button');button.id='beautyButton';button.type='button';button.hidden=true;button.textContent='Filtro de beleza';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-pressed','false');document.querySelector('.room-actions').prepend(button);
  const dialog=document.createElement('dialog');dialog.id='beautyDialog';dialog.setAttribute('aria-labelledby','beautyTitle');
  dialog.innerHTML='<div class="beauty-heading"><div><span class="card-kicker">RETRATO EM TEMPO REAL · 美颜</span><h2 id="beautyTitle">Filtro de beleza</h2></div><button id="closeBeauty" type="button" aria-label="Fechar ajustes de beleza">×</button></div><p class="beauty-intro">Efeitos opcionais no dispositivo, com intensidade do seu jeito.</p><div class="beauty-layout"><div><div class="beauty-preview"><video id="beautyPreview" autoplay muted playsinline hidden></video><div id="beautyPlaceholder">Ligue a câmera para ver a prévia.</div><span id="beautyPreviewLabel">Sua prévia</span></div><button id="beautyCompare" type="button" aria-pressed="false">Ver original</button><small class="beauty-privacy">O processamento acontece neste dispositivo. Os outros participantes recebem sua câmera com o filtro.</small></div><div class="beauty-adjustments"><label class="beauty-switch"><input id="beautyEnabled" type="checkbox">Ativar efeito de beleza</label><div class="beauty-presets" role="group" aria-label="Estilos de beleza"><button type="button" data-beauty-preset="natural">Natural</button><button type="button" data-beauty-preset="douyin">美颜 suave</button><button type="button" data-beauty-preset="porcelain">Porcelana</button></div><button type="button" id="beautyDownload" hidden>Baixar recursos do filtro</button><button type="button" id="beautyRetry">Tentar ativar novamente</button><button type="button" id="beautyReinstall">Reinstalar filtro</button><button type="button" id="beautyDiagnostics">Copiar diagnóstico</button><div id="beautySliders"></div><button id="resetBeauty" type="button">Restaurar Porcelana</button></div></div><p id="beautyStatus" role="status">Porcelana ativado. Ligue a câmera para aplicar o filtro.</p>';
  document.body.append(dialog);
  const controls=[['smooth','Suavização da pele · 磨皮'],['bright','Luminosidade · 提亮'],['slim','Contorno do rosto · 瘦脸'],['eyes','Realçar olhos · 大眼'],['blush','Tom rosado · 红润'],['lipstick','Batom suave'],['nose','Contorno sutil do nariz']];
  const base={texture:72,even:12,radius:35,sharpen:16,eyeBright:8,underEye:8,warmth:2,vibrance:3,contrast:0,glow:0,vignette:0,grain:0,slim:0,eyes:0,nose:0,chin:0,lips:0};
  const presets={natural:{...base,smooth:22,bright:5,blush:6,lipstick:0},douyin:{...base,smooth:40,bright:12,blush:16,lipstick:14},porcelain:{...base,smooth:36,bright:10,blush:12,lipstick:10}};
  let values={...presets.porcelain},preset='porcelain',enabled=true,teacher=false,raw=null,onStream=null,pipeline=null,generation=0,comparing=false,preparation,configuredRoom,reinstalling=false,applying=0;
  let preferenceKey='';
  function safeValues(saved){const next={...presets.porcelain};for(const key of Object.keys(next)){const number=Number(saved?.[key]);if(Number.isFinite(number))next[key]=Math.max(0,Math.min(100,number));}for(const key of ['slim','eyes','nose','chin','lips'])next[key]=0;return next;}
  function remember(){if(!preferenceKey)return;try{sessionStorage.setItem(preferenceKey,JSON.stringify({enabled,preset,values:safeValues(values)}));}catch{}}
  function restore(state){preferenceKey='aula-beauty-v2:'+state.id+':'+state.you.id;enabled=true;preset='porcelain';values={...presets.porcelain};try{const saved=JSON.parse(sessionStorage.getItem(preferenceKey)||'null');if(saved&&typeof saved.enabled==='boolean'){enabled=saved.enabled;values=safeValues(saved.values);preset=Object.hasOwn(presets,saved.preset)?saved.preset:'custom';}}catch{}}
  for(const [key,label]of controls){const row=document.createElement('label');row.className='beauty-slider';row.htmlFor='beauty-'+key;row.textContent=label;const out=document.createElement('output');out.id='beauty-value-'+key;row.append(out);const input=document.createElement('input');input.type='range';input.id='beauty-'+key;input.min='0';input.max='100';input.step='1';input.oninput=()=>{values[key]=Number(input.value);preset='custom';remember();sync()};row.append(input);el('beautySliders').append(row)}
  function sync(){el('beautyEnabled').disabled=reinstalling||applying>0;el('beautyReinstall').disabled=reinstalling;el('beautyRetry').hidden=enabled||!raw;pipeline?.setValues?.({...values});el('beautyEnabled').checked=enabled;button.setAttribute('aria-pressed',String(enabled));for(const [key]of controls){el('beauty-'+key).value=values[key];el('beauty-value-'+key).value=values[key]+'%'}for(const b of dialog.querySelectorAll('[data-beauty-preset]'))b.setAttribute('aria-pressed',String(b.dataset.beautyPreset===preset));preview()}
  function preview(){const stream=comparing?raw:(pipeline?.stream||raw),video=el('beautyPreview');video.style.transform='scaleX(-1)';if(video.srcObject!==stream){video.srcObject=stream;if(stream)video.play().catch(()=>{})}video.hidden=!stream;el('beautyPlaceholder').hidden=!!stream;el('beautyPreviewLabel').textContent=comparing||!enabled?'Original':'Efeito de beleza';el('beautyCompare').disabled=!raw||!enabled;el('beautyCompare').textContent=comparing?'Ver efeito':'Ver original';el('beautyCompare').setAttribute('aria-pressed',String(comparing))}

  const status=text=>{const clean=text.replaceAll('OpenMakeupSDK','filtro de beleza').replaceAll('GPUPixel','filtro de beleza');if(el('beautyStatus').textContent!==clean)el('beautyStatus').textContent=clean;};
  el('beautyReinstall').onclick=async()=>{
    if(reinstalling)return;reinstalling=true;enabled=false;comparing=false;sync();
    try{await apply();status('Limpando os recursos antigos do filtro…');const {resetBeautyResources,downloadBeauty}=await import('/beauty-cache.js?v=20261118-face1');await resetBeautyResources();await downloadBeauty(percent=>status('Reinstalando filtro: '+percent+'%'));enabled=true;await apply();}
    catch(error){status(error.message+' Sua câmera continua sem efeito.');}
    finally{reinstalling=false;sync();}
  };
  el('beautyDiagnostics').onclick=async()=>{const b=el('beautyDiagnostics');try{await navigator.clipboard.writeText(JSON.stringify(window.beautyDiagnostics?.()||{status:el('beautyStatus').textContent},null,2));b.textContent='Diagnóstico copiado';setTimeout(()=>b.textContent='Copiar diagnóstico',1800);}catch{status('Não foi possível copiar o diagnóstico.');}};
  el('beautyRetry').onclick=()=>{enabled=true;comparing=false;apply()};
  el('beautyDownload').onclick=async()=>{const b=el('beautyDownload');b.disabled=true;try{status('Baixando recursos do filtro…');const {downloadBeauty}=await import('/beauty-cache.js?v=20261118-face1');await downloadBeauty(percent=>status('Baixando recursos do filtro: '+percent+'%'));status('Recursos baixados. Ligue a câmera ou clique em Tentar ativar novamente.');}catch(error){status(error.message)}finally{b.disabled=false}};
  button.onclick=()=>{if(teacher){preview();dialog.showModal()}};el('closeBeauty').onclick=()=>dialog.close();el('beautyCompare').onclick=()=>{comparing=!comparing;preview()};
  for(const b of dialog.querySelectorAll('[data-beauty-preset]'))b.onclick=()=>{preset=b.dataset.beautyPreset;values={...presets[preset]};remember();sync()};
  el('resetBeauty').onclick=()=>{preset='porcelain';values={...presets.porcelain};remember();sync()};
  el('beautyEnabled').onchange=()=>{enabled=el('beautyEnabled').checked;comparing=false;remember();apply()};
  async function createPipeline(input,ticket){
    preparation?.abort();const controller=new AbortController();preparation=controller;
    return window.createBeauty(input,{...values},status,error=>{if(ticket===generation)recover(error)},()=>ticket!==generation,controller.signal);
  }
  async function recover(error){const original=raw,old=pipeline;pipeline=null;generation++;enabled=false;try{if(original&&onStream)await onStream(original)}catch{}finally{preparation?.abort();old?.stop();comparing=false;sync();status((error.message||'Filtro indisponível.')+' Sua câmera continua sem efeito.')}}
  async function apply(){if(pipeline&&enabled&&raw&&teacher)return;const ticket=++generation;applying++;el('beautyEnabled').disabled=true;try{
    if(!enabled||!raw||!teacher){preparation?.abort();const old=pipeline;pipeline=null;if(old&&raw&&onStream)await onStream(raw);old?.stop();if(ticket===generation)status(enabled?'Efeito selecionado. Ligue a câmera para aplicar.':'Desligado. Sua câmera continua original.');return}
    if(pipeline)return;
    status('Preparando efeito de beleza… Sua câmera original continua na chamada.');const next=await createPipeline(raw,ticket);if(!next)return;if(ticket!==generation){next.stop();return}pipeline=next;if(onStream)await onStream(next.stream);
  }catch(error){if(ticket===generation)await recover(error)}finally{applying--;sync()}}
  window.beautyCamera={
    configure(state){teacher=state.you.status==='accepted';const roomKey=state.id+':'+state.you.id;if(teacher&&configuredRoom!==roomKey){configuredRoom=roomKey;restore(state);sync();}button.hidden=!teacher;button.disabled=!!state.ended||!!state.ending||state.you.status!=='accepted';if(!teacher&&dialog.open)dialog.close()},
    async attach(stream,callback){if(raw&&raw!==stream){generation++;preparation?.abort();pipeline?.stop();pipeline=null;}raw=stream;onStream=callback;if(teacher)await apply();preview()},
    detach(){generation++;preparation?.abort();preparation=null;pipeline?.stop();pipeline=null;raw=null;onStream=null;comparing=false;el('beautyEnabled').disabled=false;preview();status(enabled?'Efeito selecionado. Ligue a câmera para aplicar.':'Desligado. Sua câmera continua original.')},
    close(){this.detach();dialog.close()}
  };
  sync();
})();
