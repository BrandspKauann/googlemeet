(() => {
  const el=id=>document.getElementById(id);
  const button=document.createElement('button');button.id='beautyButton';button.type='button';button.hidden=true;button.textContent='Filtro de beleza';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-pressed','false');document.querySelector('.room-actions').prepend(button);
  const dialog=document.createElement('dialog');dialog.id='beautyDialog';dialog.setAttribute('aria-labelledby','beautyTitle');
  dialog.innerHTML='<div class="beauty-heading"><div><span class="card-kicker">RETRATO EM TEMPO REAL · 美颜</span><h2 id="beautyTitle">Filtro de beleza</h2></div><button id="closeBeauty" type="button" aria-label="Fechar ajustes de beleza">×</button></div><p class="beauty-intro">Efeitos opcionais no dispositivo, com intensidade do seu jeito.</p><div class="beauty-layout"><div><div class="beauty-preview"><video id="beautyPreview" autoplay muted playsinline hidden></video><div id="beautyPlaceholder">Ligue a câmera para ver a prévia.</div><span id="beautyPreviewLabel">Sua prévia</span></div><button id="beautyCompare" type="button" aria-pressed="false">Ver original</button><small class="beauty-privacy">O processamento acontece neste dispositivo. O aluno recebe a câmera com o efeito; sua tela compartilhada não muda.</small></div><div class="beauty-adjustments"><label class="beauty-switch"><input id="beautyEnabled" type="checkbox">Ativar efeito de beleza</label><div class="beauty-presets" role="group" aria-label="Estilos de beleza"><button type="button" data-beauty-preset="natural">Natural</button><button type="button" data-beauty-preset="douyin">美颜 suave</button><button type="button" data-beauty-preset="porcelain">Porcelana</button></div><div id="beautySliders"></div><button id="resetBeauty" type="button">Restaurar Porcelana</button></div></div><p id="beautyStatus" role="status">Porcelana ativado. Ligue a câmera para aplicar o filtro.</p>';
  document.body.append(dialog);
  const controls=[['smooth','Suavização da pele · 磨皮'],['bright','Luminosidade · 提亮'],['slim','Contorno do rosto · 瘦脸'],['eyes','Realçar olhos · 大眼'],['blush','Tom rosado · 红润'],['lipstick','Batom suave'],['nose','Contorno sutil do nariz']];
  const neutral={smooth:0,bright:0,slim:0,eyes:0};
  const presets={natural:{smooth:20,bright:5,slim:0,eyes:0,blush:25,lipstick:20,nose:0},douyin:{smooth:58,bright:28,slim:20,eyes:18,blush:45,lipstick:40,nose:15},porcelain:{smooth:68,bright:36,slim:15,eyes:12,blush:35,lipstick:30,nose:10}};
  let values={...presets.porcelain},preset='porcelain',enabled=true,teacher=false,raw=null,onStream=null,pipeline=null,generation=0,comparing=false,modules,configuredRoom;
  for(const [key,label]of controls){const row=document.createElement('label');row.className='beauty-slider';row.htmlFor='beauty-'+key;row.textContent=label;const out=document.createElement('output');out.id='beauty-value-'+key;row.append(out);const input=document.createElement('input');input.type='range';input.id='beauty-'+key;input.min='0';input.max='100';input.step='1';input.oninput=()=>{values[key]=Number(input.value);preset='custom';sync()};row.append(input);el('beautySliders').append(row)}
  function sync(){el('beautyEnabled').checked=enabled;button.setAttribute('aria-pressed',String(enabled));for(const [key]of controls){el('beauty-'+key).value=values[key];el('beauty-value-'+key).value=values[key]+'%'}for(const b of dialog.querySelectorAll('[data-beauty-preset]'))b.setAttribute('aria-pressed',String(b.dataset.beautyPreset===preset));preview()}
  function preview(){const stream=comparing?raw:(pipeline?.stream||raw),video=el('beautyPreview');video.style.transform='scaleX(-1)';if(video.srcObject!==stream){video.srcObject=stream;if(stream)video.play().catch(()=>{})}video.hidden=!stream;el('beautyPlaceholder').hidden=!!stream;el('beautyPreviewLabel').textContent=comparing||!enabled?'Original':'Efeito de beleza';el('beautyCompare').disabled=!raw||!enabled;el('beautyCompare').textContent=comparing?'Ver efeito':'Ver original';el('beautyCompare').setAttribute('aria-pressed',String(comparing))}
  const status=text=>{el('beautyStatus').textContent=text.replaceAll('OpenMakeupSDK','filtro de beleza').replaceAll('GPUPixel','filtro de beleza')};
  button.onclick=()=>{if(teacher){preview();dialog.showModal()}};el('closeBeauty').onclick=()=>dialog.close();el('beautyCompare').onclick=()=>{comparing=!comparing;preview()};
  for(const b of dialog.querySelectorAll('[data-beauty-preset]'))b.onclick=()=>{preset=b.dataset.beautyPreset;values={...presets[preset]};sync()};
  el('resetBeauty').onclick=()=>{preset='porcelain';values={...presets.porcelain};sync()};
  el('beautyEnabled').onchange=()=>{enabled=el('beautyEnabled').checked;comparing=false;apply()};
  async function loadModules(){return modules||=Promise.all([import('./gpupixel/renderer.js'),import('./face-tracking/facemesh.js')]).catch(error=>{modules=null;throw error})}
  async function createPipeline(input,ticket,mode='combined'){
    if(mode==='combined'){
      const skin=await createPipeline(input,ticket,'gpupixel');
      if(!skin)return null;
      try{
        if(ticket!==generation){skin.stop();return null;}
        const makeup=await createPipeline(skin.stream,ticket,'openmakeup');
        if(!makeup){skin.stop();return null;}
        return {stream:makeup.stream,stop(){makeup.stop();skin.stop();}};
      }catch(error){skin.stop();throw error;}
    }
    if(mode==='openmakeup'){const {createOpenMakeup}=await import('/openmakeup/adapter.js');return createOpenMakeup(input,()=>values,text=>{if(ticket===generation)status(text.replace('OpenMakeupSDK aplicado','Filtro de beleza aplicado'))},error=>{if(ticket===generation)recover(error)},()=>ticket!==generation);}

    const [{Renderer},{FaceMesh}]=await loadModules();
    if(ticket!==generation)return null;
    const canvas=document.createElement('canvas'),source=document.createElement('video');source.muted=true;source.autoplay=true;source.playsInline=true;source.srcObject=input;
    let renderer,mesh,output,timer,disposed=false,lastDetection=-1,lastVideoTime=-1;
    const stop=()=>{if(disposed)return;disposed=true;clearInterval(timer);source.pause();source.srcObject=null;output?.getTracks().forEach(t=>t.stop());mesh?.close();renderer?.dispose();};
    try{
      if(!canvas.captureStream)throw Error('Este navegador não suporta câmera com efeitos.');
      renderer=new Renderer(canvas);await renderer.ready;mesh=new FaceMesh();
      await source.play();if(ticket!==generation){stop();return null}
      const ready=await mesh.load(()=>{if(ticket===generation)status('Preparando o rastreamento do rosto… O primeiro uso baixa o modelo.')});
      if(ticket!==generation){stop();return null}
      if(ready!=='ready')throw Error('Não foi possível carregar o rastreamento facial. Verifique a conexão e tente ativar novamente.');
      let lastFaceStatus='';
      const draw=()=>{
        if(disposed||source.readyState<2||!source.videoWidth||lastVideoTime===source.currentTime)return;
        lastVideoTime=source.currentTime;const now=performance.now(),width=source.videoWidth,height=source.videoHeight,ratio=Math.min(1,960/width,720/height),w=Math.round(width*ratio),h=Math.round(height*ratio);
        
        if(now-lastDetection>100){mesh.detect(source,now);lastDetection=now}
        const points=mesh.presence>0?mesh.points:null,face=!!points;renderer.render(source,w,h,points,values);
        if(renderer.gl.isContextLost())throw Error('A aceleração de vídeo foi interrompida.');
        const text=face?'Efeito ativo. O aluno recebe sua câmera com o filtro.':'Efeito pronto. Aproxime o rosto da câmera para aplicar os ajustes.';if(text!==lastFaceStatus&&ticket===generation&&mode!=='gpupixel'){status(text);lastFaceStatus=text}
      };
      const run=()=>{try{draw()}catch(error){if(!disposed&&ticket===generation)recover(error)}};
      draw();output=canvas.captureStream(24);output.getVideoTracks()[0].contentHint='motion';timer=setInterval(run,1000/24);
      canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(!disposed&&ticket===generation)recover(Error('A aceleração de vídeo foi interrompida.'))});
      return {stream:output,stop};
    }catch(error){stop();throw error}
  }
  async function recover(error){enabled=false;const original=raw,old=pipeline;pipeline=null;generation++;try{if(original&&onStream)await onStream(original)}catch{}finally{old?.stop();comparing=false;sync();status((error.message||'Filtro indisponível.')+' Sua câmera continua sem efeito.')}}
  async function apply(){const ticket=++generation;el('beautyEnabled').disabled=true;try{
    if(!enabled||!raw||!teacher){const old=pipeline;pipeline=null;if(old&&raw&&onStream)await onStream(raw);old?.stop();if(ticket===generation)status(enabled?'Efeito selecionado. Ligue a câmera para aplicar.':'Desligado. Sua câmera continua original.');return}
    if(pipeline)return;
    status('Preparando efeito de beleza… Sua câmera original continua na chamada.');const next=await createPipeline(raw,ticket);if(!next)return;if(ticket!==generation){next.stop();return}pipeline=next;if(onStream)await onStream(next.stream);
  }catch(error){if(ticket===generation)await recover(error)}finally{el('beautyEnabled').disabled=false;sync()}}
  window.beautyCamera={
    configure(state){teacher=state.you.role==='teacher';if(teacher&&configuredRoom!==state.id){configuredRoom=state.id;enabled=true;preset='porcelain';values={...presets.porcelain};sync();}button.hidden=!teacher;button.disabled=!!state.ended||!!state.ending||state.you.status!=='accepted';if(!teacher&&dialog.open)dialog.close()},
    async attach(stream,callback){raw=stream;onStream=callback;if(teacher)await apply();preview()},
    detach(){generation++;pipeline?.stop();pipeline=null;raw=null;onStream=null;comparing=false;el('beautyEnabled').disabled=false;preview();status(enabled?'Efeito selecionado. Ligue a câmera para aplicar.':'Desligado. Sua câmera continua original.')},
    close(){this.detach();dialog.close()}
  };
  sync();
})();
