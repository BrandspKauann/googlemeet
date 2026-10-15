(() => {
  const stage=document.getElementById('screenStage'),video=document.getElementById('screenVideo'),stop=document.getElementById('stopScreen');
  const viewport=document.createElement('div');viewport.id='screenViewport';viewport.tabIndex=0;viewport.setAttribute('role','group');viewport.setAttribute('aria-label','Conteúdo compartilhado. Use mais e menos para ampliar, setas para mover e zero para ajustar.');
  video.before(viewport);viewport.append(video);
  const toolbar=document.createElement('div');toolbar.id='screenZoom';toolbar.hidden=true;toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Zoom do conteúdo compartilhado');
  toolbar.innerHTML='<span class="zoom-title">Zoom do conteúdo</span><button type="button" id="zoomOut" aria-label="Diminuir zoom" title="Diminuir zoom">−</button><output id="zoomLevel" aria-live="polite" aria-atomic="true">100%</output><button type="button" id="zoomIn" aria-label="Aumentar zoom" title="Aumentar zoom">+</button><button type="button" id="zoomReset" title="Mostrar todo o conteúdo">Ajustar à tela</button><small id="zoomHint">Só muda a sua visualização.</small>';
  stage.querySelector('.screenhead').after(toolbar);
  const el=id=>document.getElementById(id);let scale=1,x=0,y=0,drag=null,source;
  function clamp(){const width=viewport.clientWidth,height=viewport.clientHeight,fit=video.videoWidth&&video.videoHeight?Math.min(width/video.videoWidth,height/video.videoHeight):0;const maxX=Math.max(0,(video.videoWidth*fit*scale-width)/2),maxY=Math.max(0,(video.videoHeight*fit*scale-height)/2);x=Math.min(maxX,Math.max(-maxX,x));y=Math.min(maxY,Math.max(-maxY,y));}
  function draw(){clamp();video.style.transform=`translate(${x}px, ${y}px) scale(${scale})`;viewport.classList.toggle('zoomed',scale>1);viewport.classList.toggle('dragging',!!drag);}
  function zoom(value){scale=Math.max(1,Math.min(4,Math.round(value*4)/4));if(scale===1){x=0;y=0;drag=null}draw();el('zoomLevel').textContent=Math.round(scale*100)+'%';el('zoomOut').disabled=scale===1;el('zoomIn').disabled=scale===4;el('zoomHint').textContent=scale>1?'Arraste o conteúdo para mover.':'Só muda a sua visualização.';}
  function reset(){x=0;y=0;drag=null;zoom(1)}
  function sync(){const receiving=!stage.hidden&&stop.hidden;toolbar.hidden=!receiving;if(!receiving){if(stage.hidden)source=null;reset()}}
  el('zoomIn').onclick=()=>zoom(scale+.25);el('zoomOut').onclick=()=>zoom(scale-.25);el('zoomReset').onclick=reset;
  viewport.addEventListener('pointerdown',event=>{if(scale===1||event.button!==0)return;event.preventDefault();viewport.focus({preventScroll:true});drag={id:event.pointerId,x:event.clientX,y:event.clientY,startX:x,startY:y};viewport.setPointerCapture(event.pointerId);draw()});
  viewport.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;x=drag.startX+event.clientX-drag.x;y=drag.startY+event.clientY-drag.y;draw()});
  const release=event=>{if(drag&&event.pointerId===drag.id){drag=null;draw()}};viewport.addEventListener('pointerup',release);viewport.addEventListener('pointercancel',release);viewport.addEventListener('lostpointercapture',release);
  viewport.addEventListener('keydown',event=>{if(toolbar.hidden)return;const keys={ArrowLeft:[40,0],ArrowRight:[-40,0],ArrowUp:[0,40],ArrowDown:[0,-40]};if(['+','=','-','0'].includes(event.key)){event.preventDefault();event.key==='0'?reset():zoom(scale+(event.key==='-'?-.25:.25));}else if(scale>1&&keys[event.key]){event.preventDefault();const delta=keys[event.key];x+=delta[0];y+=delta[1];draw()}});
  viewport.addEventListener('wheel',event=>{if(toolbar.hidden)return;if(event.ctrlKey||event.metaKey){event.preventDefault();zoom(scale+(event.deltaY<0?.25:-.25));}else if(scale>1){event.preventDefault();x-=event.deltaX;y-=event.deltaY;draw()}},{passive:false});
  video.addEventListener('loadedmetadata',()=>{if(source!==video.srcObject){source=video.srcObject;reset()}else draw()});
  video.addEventListener('emptied',reset);new ResizeObserver(draw).observe(viewport);
  const observer=new MutationObserver(sync);observer.observe(stage,{attributes:true,attributeFilter:['hidden']});observer.observe(stop,{attributes:true,attributeFilter:['hidden']});sync();reset();
})();
