(() => {
  'use strict';
  const button=document.getElementById('floatingCaption');if(!button)return;
  const source=document.getElementById('conversationLog');
  let current=null,win=null,ui=null,opening=false,scheduled=false,following=true,mutation=null,rows=new Map(),cameras=new Map(),openSequence=0;
  const text={
    pt:{open:'Sala flutuante',close:'Fechar sala flutuante',title:'Aula Global — sala flutuante',conversation:'Conversa da aula',teacher:'Professora',student:'Aluno',you:'Você',cameraOff:'Câmera desligada',empty:'As falas aparecem aqui, na ordem da conversa.',latest:'Novas mensagens ↓',font:'Letra',return:'Voltar à sala',normal:'Janela comum: não fica sempre acima de outros aplicativos. Para sobreposição, use Chrome ou Edge com janela flutuante compatível.',failed:'Não foi possível abrir a sala flutuante. Permita janelas pop-up ou use Chrome/Edge compatível.',sound:'Som da aula continua na janela principal.',show:'Mostrar câmera'},
    zh:{open:'悬浮课堂',close:'关闭悬浮课堂',title:'Aula Global — 悬浮课堂',conversation:'课堂对话',teacher:'老师',student:'学生',you:'你',cameraOff:'摄像头已关闭',empty:'双方发言将按顺序显示在这里。',latest:'新消息 ↓',font:'字号',return:'返回教室',normal:'这是普通窗口，不会始终置于其他应用之上。需要悬浮置顶时，请使用支持该功能的 Chrome 或 Edge。',failed:'无法打开悬浮课堂。请允许弹出窗口，或使用支持该功能的 Chrome/Edge。',sound:'课堂声音继续由主窗口播放。',show:'显示摄像头'},
  };
  const words=()=>text[document.documentElement.lang.startsWith('zh')?'zh':'pt'];
  const updateButton=()=>{button.textContent=win&&!win.closed?words().close:words().open;button.setAttribute('aria-pressed',String(!!win&&!win.closed));};
  const make=(doc,tag,attrs={},value)=>{const node=doc.createElement(tag);for(const [name,item]of Object.entries(attrs))node.setAttribute(name,item);if(value!==undefined)node.textContent=value;return node;};
  const write=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
  function notify(message){const node=document.getElementById('captionPhase');if(node)node.textContent=message;}
  function clearWindow(target){
    if(target!==win)return;
    mutation?.disconnect();mutation=null;for(const camera of cameras.values()){camera.video.srcObject=null;camera.article.remove();}cameras.clear();rows.clear();ui=null;win=null;following=true;updateButton();
  }
  function close(){openSequence++;const target=win;if(!target)return;clearWindow(target);if(!target.closed)target.close();}
  function getPeers(){const value=current?.peers;if(value instanceof Map)return [...value.values()];if(Array.isArray(value))return value;return value&&typeof value.values==='function'?[...value.values()]:[];}
  function renderCameras(){
    if(!ui||!win||win.closed)return;
    const state=current?.state,w=words(),members=(state?.members||[]).filter(member=>member.status==='accepted'&&(member.online||member.id===state.you?.id)).slice(0,8),peers=getPeers();
    const alive=new Set();
    for(const member of members){
      alive.add(member.id);let card=cameras.get(member.id);
      if(!card){const article=make(win.document,'article',{class:'camera-card'}),video=make(win.document,'video',{autoplay:'',playsinline:'','aria-label':member.name||''}),placeholder=make(win.document,'div',{class:'camera-placeholder'}),name=make(win.document,'span',{class:'camera-name'}),retry=make(win.document,'button',{type:'button',class:'camera-retry'});video.muted=true;video.autoplay=true;video.playsInline=true;retry.hidden=true;article.append(video,placeholder,name,retry);ui.cameras.append(article);card={article,video,placeholder,name,retry,stream:null};retry.onclick=()=>card.video.play().then(()=>retry.hidden=true).catch(()=>retry.hidden=false);cameras.set(member.id,card);}
      const own=member.id===state.you.id,peer=peers.find(value=>value.member?.id===member.id||value.id===member.id);
      const stream=own?current.cameraStream:member.media?.camera?(peer?.video?.srcObject||peer?.cameraStream||peer?.camera):null;
      const live=!!stream?.getVideoTracks?.().some(track=>track.readyState==='live');
      if(card.stream!==stream){card.stream=stream;card.video.srcObject=live?stream:null;if(live)card.video.play().then(()=>{if(cameras.get(member.id)===card)card.retry.hidden=true;}).catch(()=>{if(cameras.get(member.id)===card)card.retry.hidden=false;});}
      card.video.hidden=!live;card.placeholder.hidden=live;if(!live)card.retry.hidden=true;
      // Match the main room, including its participant-specific mirror preference.
      const main=own?document.getElementById('selfVideo'):peer?.video;
      card.video.style.transform=main?getComputedStyle(main).transform:'none';
      write(card.name,(member.name||'')+(own?' · '+w.you:''));write(card.placeholder,w.cameraOff);write(card.retry,w.show);
    }
    for(const [id,card]of cameras)if(!alive.has(id)){card.video.srcObject=null;card.article.remove();cameras.delete(id);}
    ui.cameras.hidden=members.length===0;
  }
  function makeRow(original){
    const article=make(win.document,'article',{class:'message'}),head=make(win.document,'header'),name=make(win.document,'strong'),role=make(win.document,'span'),at=make(win.document,'time'),primary=make(win.document,'p',{class:'primary'}),secondary=make(win.document,'p',{class:'secondary'}),status=make(win.document,'small');
    head.append(name,role,at);article.append(head,primary,secondary,status);return {article,name,role,at,primary,secondary,status,original};
  }
  function renderLog(){
    scheduled=false;if(!ui||!win||win.closed||!source)return;
    const w=words(),originals=[...source.querySelectorAll('.conversation-message')],alive=new Set(originals);
    const top=ui.log.getBoundingClientRect().top,anchor=!following?[...ui.log.children].find(node=>node.getBoundingClientRect().bottom>top):null,anchorTop=anchor?.getBoundingClientRect().top;
    let before=ui.log.firstChild;
    for(const original of originals){
      let row=rows.get(original);if(!row){row=makeRow(original);rows.set(original,row);}
      if(row.article!==before)ui.log.insertBefore(row.article,before);before=row.article.nextSibling;
      row.article.classList.toggle('teacher',original.classList.contains('from-teacher'));row.article.classList.toggle('provisional',original.classList.contains('conversation-provisional'));row.article.classList.toggle('gap',original.classList.contains('conversation-gap'));
      write(row.name,original.querySelector('.conversation-author strong')?.textContent||'');
      write(row.role,original.classList.contains('from-teacher')?w.teacher:w.student);
      write(row.at,original.querySelector('time')?.textContent||'');
      const primary=original.querySelector('.conversation-primary'),secondary=original.querySelector('.conversation-original'),status=original.querySelector('small');
      write(row.primary,primary?.textContent||'');row.primary.lang=primary?.lang||'';
      write(row.secondary,secondary?.textContent||'');row.secondary.lang=secondary?.lang||'';row.secondary.hidden=!secondary?.textContent||secondary.hidden;
      write(row.status,status?.textContent||'');row.status.hidden=!status?.textContent||status.hidden;
    }
    for(const [original,row]of rows)if(!alive.has(original)){row.article.remove();rows.delete(original);}
    ui.empty.hidden=originals.length>0;write(ui.empty,w.empty);
    if(following){ui.log.scrollTop=ui.log.scrollHeight;ui.latest.hidden=true;}
    else{if(anchor?.isConnected)ui.log.scrollTop+=anchor.getBoundingClientRect().top-anchorTop;ui.latest.hidden=false;}
  }
  function scheduleLog(){if(scheduled||!ui)return;scheduled=true;queueMicrotask(renderLog);}
  function localize(){
    if(!ui||!win||win.closed)return;const w=words();win.document.title=w.title;win.document.documentElement.lang=document.documentElement.lang;
    write(ui.heading,w.conversation);write(ui.fontText,w.font);write(ui.returnButton,w.return);write(ui.latest,w.latest);write(ui.hint,ui.fallback?w.normal:w.sound);updateButton();
    const clock=window.lessonClock?.read?.();
    ui.clock.hidden=!clock;ui.clock.textContent=clock?`${Math.floor(clock.elapsedMs/60_000).toString().padStart(2,'0')}:${Math.floor(clock.elapsedMs/1000%60).toString().padStart(2,'0')} / ${clock.durationMinutes} min`:'';
  }
  async function open(){
    if(win&&!win.closed){close();return;}if(opening)return;opening=true;const ticket=++openSequence;
    let target,fallback=false;
    try{
      if(window.documentPictureInPicture?.requestWindow)target=await window.documentPictureInPicture.requestWindow({width:460,height:680});
      else{fallback=true;target=window.open('','_blank','popup,width=460,height=680');if(!target)throw Error('popup');}
      if(!target)throw Error('window');
      if(ticket!==openSequence||current?.state?.ended){target.close();return;}
      win=target;const doc=win.document;doc.documentElement.lang=document.documentElement.lang;doc.body.replaceChildren();
      const style=make(doc,'style');style.textContent='*{box-sizing:border-box}html,body{height:100%;margin:0}body{font:14px system-ui,sans-serif;background:#f3f6fb;color:#18283e;display:flex;flex-direction:column;padding:10px;gap:10px;overflow:hidden}button,select{font:inherit;color:inherit;background:white;border:1px solid #d5dfed;border-radius:8px;padding:6px 8px;cursor:pointer}button:focus-visible,select:focus-visible{outline:2px solid #1a73e8;outline-offset:2px}[hidden]{display:none!important}.bar{display:flex;align-items:center;justify-content:space-between;gap:7px;flex-wrap:wrap}.bar strong{font-size:14px}.font{display:flex;align-items:center;gap:6px}.cameras{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;flex:none;max-height:34vh;overflow:auto}.camera-card{height:126px;background:#142238;border-radius:12px;position:relative;overflow:hidden}.camera-card video{width:100%;height:100%;object-fit:contain}.camera-name{position:absolute;bottom:6px;left:7px;max-width:calc(100% - 14px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:white;background:#142238b8;padding:3px 6px;border-radius:6px;font-size:11px}.camera-placeholder{height:100%;display:grid;place-items:center;text-align:center;color:#d1dced;font-size:12px;padding:12px}.camera-retry{position:absolute;left:8px;top:8px}.log{min-height:100px;min-width:0;flex:1;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;display:flex;flex-direction:column;gap:9px;padding:2px}.message{flex:none;border:1px solid #dae3f1;border-left:3px solid #a58ace;background:white;border-radius:10px;padding:11px 12px;overflow-wrap:anywhere}.message.teacher{border-left-color:#4389e4}.message.provisional{border-style:dashed}.message.gap{background:#fff7ed}.message header{display:flex;gap:6px;align-items:center;color:#65748b;font-size:11px;flex-wrap:wrap}.message header strong{color:#20354f;font-size:12px}.message time{margin-left:auto}.message p{margin:7px 0 0;white-space:pre-wrap;line-height:1.5;font-size:var(--font,17px)}.message .secondary{font-size:calc(var(--font,17px) - 2px);color:#5e7089;border-top:1px solid #e6edf7;padding-top:7px}.message small{display:block;margin-top:7px;color:#738197;font-size:11px}.hint{margin:0;flex:none;font-size:11px;line-height:1.4;color:#6b7c93}.hint.fallback{color:#8c5609}.empty{color:#6b7c93;margin:8px;font-size:14px}.latest{align-self:center;color:#155cbd;flex:none}.clock{font-size:12px;color:#65748b;font-variant-numeric:tabular-nums}@media(max-width:340px){.camera-card{height:100px}.message{padding:9px}.bar strong{font-size:12px}}';doc.head.append(style);
      const bar=make(doc,'div',{class:'bar'}),heading=make(doc,'strong'),clock=make(doc,'span',{class:'clock'}),returnButton=make(doc,'button',{type:'button'});bar.append(heading,clock,returnButton);
      const cameraContainer=make(doc,'div',{class:'cameras','aria-label':'Câmeras da aula'}),tools=make(doc,'div',{class:'bar'}),fontLabel=make(doc,'label',{class:'font'}),fontText=make(doc,'span'),font=make(doc,'select',{'aria-label':'Tamanho da letra'});
      for(const size of [14,16,18,21,24])font.append(make(doc,'option',{value:String(size)},String(size)));
      try{font.value=localStorage.getItem('lessonCompanionFont')||'18';}catch{font.value='18';}if(!font.value)font.value='18';
      const log=make(doc,'div',{class:'log',role:'log','aria-live':'polite','aria-relevant':'additions text'}),empty=make(doc,'p',{class:'empty'}),latest=make(doc,'button',{type:'button',class:'latest'}),hint=make(doc,'p',{class:'hint'+(fallback?' fallback':''),role:'status'});latest.hidden=true;fontLabel.append(fontText,font);tools.append(fontLabel);doc.body.append(bar,cameraContainer,tools,log,empty,latest,hint);
      ui={heading,clock,returnButton,cameras:cameraContainer,fontText,font,log,empty,latest,hint,fallback};
      font.onchange=()=>{log.style.setProperty('--font',font.value+'px');try{localStorage.setItem('lessonCompanionFont',font.value);}catch{}};font.onchange();
      returnButton.onclick=()=>{window.focus();};
      log.addEventListener('scroll',()=>{following=log.scrollHeight-log.clientHeight-log.scrollTop<55;if(following)latest.hidden=true;});latest.onclick=()=>{following=true;log.scrollTop=log.scrollHeight;latest.hidden=true;};
      target.addEventListener('pagehide',()=>clearWindow(target),{once:true});
      if(source){mutation=new MutationObserver(scheduleLog);mutation.observe(source,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','hidden','lang']});}
      localize();renderCameras();renderLog();updateButton();
      if(fallback)notify(words().normal);
    }catch{if(target&&!target.closed)target.close();clearWindow(target);notify(words().failed);}
    finally{opening=false;}
  }
  // The room's existing cleanup also closes this replacement for the old captions window.
  if(window.captionUI?.closeFloating){const legacyClose=window.captionUI.closeFloating;window.captionUI.closeFloating=()=>{close();legacyClose();};}
  button.onclick=open;updateButton();
  window.addEventListener('pagehide',close,{once:true});
  window.lessonCompanion=Object.freeze({sync(value){current=value;if(value?.state?.ended){close();return;}localize();renderCameras();scheduleLog();},close,open,get active(){return !!win&&!win.closed;}});
})();
