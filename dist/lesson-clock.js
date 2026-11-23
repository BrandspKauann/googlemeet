(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const anchor = $('timer');
  if (!anchor) return;
  const dictionary = {
    pt: {title:'Tempo da aula',duration:'Duração',minutes:'minutos',custom:'Outra duração',start:'Começar aula',pause:'Pausar',resume:'Retomar',reset:'Reiniciar contador',waiting:'Aula ainda não iniciada',paused:'Aula pausada',elapsed:'Decorrido',remaining:'Restante',overtime:'Tempo adicional',ending:'Faltam até 5 minutos para o encerramento planejado.',complete:'Duração prevista atingida. A sala continua aberta.',closed:'Aula encerrada',saving:'Salvando…',error:'Não foi possível salvar o tempo da aula.',unavailable:'Cronômetro oficial indisponível neste modo.'},
    zh: {title:'课堂计时',duration:'时长',minutes:'分钟',custom:'其他时长',start:'开始上课',pause:'暂停',resume:'继续',reset:'重置计时',waiting:'课程尚未开始',paused:'课程已暂停',elapsed:'已上课',remaining:'剩余',overtime:'超时',ending:'距离预定结束时间不足5分钟。',complete:'已达到预定时长，教室仍然开放。',closed:'课程已结束',saving:'正在保存…',error:'无法保存课堂计时。',unavailable:'此模式无法使用正式课堂计时。'},
  };
  const words = () => dictionary[document.documentElement.lang.startsWith('zh') ? 'zh' : 'pt'];
  const make = (tag, attrs = {}, text) => {const node=document.createElement(tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;return node;};
  const style=make('style');style.textContent='.lesson-clock{display:flex;align-items:center;gap:10px;position:relative;flex-wrap:wrap;color:#26344a;font:13px system-ui,sans-serif}.lesson-clock [hidden]{display:none!important}.lesson-clock-readout{font-variant-numeric:tabular-nums;white-space:nowrap}.lesson-clock-readout strong{font-size:16px}.lesson-clock-readout small{display:block;color:#65748b;font-size:11px}.lesson-clock details>summary{cursor:pointer;border:1px solid #d8e1ee;border-radius:9px;background:#fff;padding:7px 9px;list-style:none}.lesson-clock details[open]>.lesson-clock-controls{display:grid;gap:10px}.lesson-clock-controls{position:absolute;bottom:calc(100% + 12px);left:0;z-index:30;width:260px;max-width:calc(100vw - 32px);background:#fff;padding:16px;border:1px solid #d8e1ee;border-radius:14px;box-shadow:0 8px 32px #15264626}.lesson-clock-controls label{display:flex;align-items:center;gap:8px}.lesson-clock select,.lesson-clock input{min-width:0;border:1px solid #d5deeb;border-radius:7px;padding:7px;color:inherit;background:white}.lesson-clock input{width:76px}.lesson-clock-buttons{display:flex;gap:7px;flex-wrap:wrap}.lesson-clock-buttons button{border:1px solid #d6e0ee;border-radius:8px;padding:8px 11px;background:#f3f7fd;color:#193856;cursor:pointer}.lesson-clock-buttons button:first-child{background:#1a73e8;color:white;border-color:#1a73e8}.lesson-clock-warning{color:#8c4c09;max-width:240px;font-size:12px}.lesson-clock-message{margin:0;color:#65748b;font-size:12px}.lesson-clock button:focus-visible,.lesson-clock summary:focus-visible,.lesson-clock select:focus-visible,.lesson-clock input:focus-visible{outline:2px solid #1a73e8;outline-offset:2px}';
  const widget=make('div',{class:'lesson-clock',id:'lessonClock'});
  const readout=make('div',{class:'lesson-clock-readout'}),time=make('strong',{id:'lessonClockElapsed'}),subtitle=make('small',{id:'lessonClockRemaining'});readout.append(time,subtitle);
  const settings=make('details',{id:'lessonClockSettings'}),summary=make('summary'),controls=make('div',{class:'lesson-clock-controls'});
  const durationLabel=make('label'),durationText=make('span'),duration=make('select',{'aria-label':'Duração da aula'});
  duration.append(make('option',{value:'50'},'50 min'),make('option',{value:'60'},'60 min'),make('option',{value:'custom'}));durationLabel.append(durationText,duration);
  const customLabel=make('label'),custom=make('input',{type:'number',min:'5',max:'240',step:'1',value:'50',id:'lessonDurationMinutes'}),minutesText=make('span');customLabel.append(custom,minutesText);customLabel.hidden=true;
  const buttons=make('div',{class:'lesson-clock-buttons'}),toggle=make('button',{type:'button',id:'lessonClockToggle'}),reset=make('button',{type:'button',id:'lessonClockReset'});buttons.append(toggle,reset);
  const message=make('p',{class:'lesson-clock-message',role:'status'}),warning=make('span',{class:'lesson-clock-warning',id:'lessonClockWarning',role:'status'});warning.hidden=true;
  controls.append(durationLabel,customLabel,buttons,message);settings.append(summary,controls);widget.append(readout,settings,warning);anchor.hidden=true;anchor.after(widget);document.head.append(style);
  let current=null,save=null,busy=false,serverAt=Date.now(),sampleAt=performance.now(),lastClock='';
  const finiteStamp = value => typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
  function read() {
    const lesson=current?.lesson || {},status=['running','paused'].includes(lesson.status)?lesson.status:'idle';
    const now=serverAt+(current?.ended?0:Math.max(0,performance.now()-sampleAt));
    const since=finiteStamp(lesson.runningSince),base=Number.isFinite(lesson.elapsedMs)?Math.max(0,lesson.elapsedMs):0;
    const elapsedMs=status==='idle'?0:base+(status==='running'&&since!==null?Math.max(0,now-since):0);
    const durationMinutes=Number.isInteger(lesson.durationMinutes)&&lesson.durationMinutes>=5&&lesson.durationMinutes<=240?lesson.durationMinutes:50;
    return {status,elapsedMs,remainingMs:durationMinutes*60_000-elapsedMs,durationMinutes,serverNow:now,ended:!!current?.ended};
  }
  const display = ms => {const seconds=Math.max(0,Math.floor(Math.abs(ms)/1000));return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;};
  function render() {
    const w=words(),value=read(),teacher=current?.you?.role==='teacher'&&current.you.status==='accepted';
    summary.textContent=w.title;durationText.textContent=w.duration;duration.options[2].textContent=w.custom;minutesText.textContent=w.minutes;reset.textContent=w.reset;
    duration.setAttribute('aria-label',w.duration);custom.setAttribute('aria-label',w.duration+' ('+w.minutes+')');
    const text=display(value.elapsedMs);if(text!==lastClock){time.textContent=text;lastClock=text;}
    time.setAttribute('aria-label',w.elapsed+' '+text);
    subtitle.textContent=value.ended?w.closed:value.status==='idle'?w.waiting:value.status==='paused'?w.paused:`${value.remainingMs>=0?w.remaining:w.overtime} ${display(value.remainingMs)}`;
    toggle.textContent=busy?w.saving:value.status==='running'?w.pause:value.status==='paused'?w.resume:w.start;
    settings.hidden=!teacher||!!current?.ended||!!current?.ending;
    for(const node of [toggle,reset,duration,custom])node.disabled=busy||!save||!current?.lesson;
    reset.hidden=value.status==='idle';
    if(document.activeElement!==duration&&document.activeElement!==custom){duration.value=[50,60].includes(value.durationMinutes)?String(value.durationMinutes):'custom';custom.value=String(value.durationMinutes);customLabel.hidden=duration.value!=='custom';}
    const notice=value.status==='running'&&!value.ended&&value.remainingMs<=300_000?(value.remainingMs>0?w.ending:w.complete):'';
    warning.hidden=!notice;if(warning.textContent!==notice)warning.textContent=notice;
    if(!current?.lesson&&!message.textContent)message.textContent=w.unavailable;
  }
  async function persist(patch) {
    if(busy||!save||current?.you?.role!=='teacher'||current?.ended||current?.ending)return;
    busy=true;message.textContent='';render();
    try{const result=await save(patch);if(result?.lesson)sync({...current,...result});}
    catch(error){message.textContent=error.message||words().error;}
    finally{busy=false;render();}
  }
  toggle.onclick=()=>persist({action:read().status==='running'?'pause':read().status==='paused'?'resume':'start'});
  reset.onclick=()=>persist({action:'reset'});
  duration.onchange=()=>{customLabel.hidden=duration.value!=='custom';if(duration.value==='custom'){custom.focus();custom.select();}else persist({durationMinutes:Number(duration.value)});};
  custom.onchange=()=>{const value=Number(custom.value);if(!Number.isInteger(value)||value<5||value>240){custom.setCustomValidity(document.documentElement.lang.startsWith('zh')?'请输入5到240之间的整数。':'Use um número inteiro de 5 a 240.');custom.reportValidity();return;}custom.setCustomValidity('');persist({durationMinutes:value});};
  custom.addEventListener('input',()=>custom.setCustomValidity(''));
  settings.addEventListener('toggle',()=>{if(!settings.open)return;controls.style.bottom='calc(100% + 12px)';controls.style.top='auto';controls.style.left='0';const box=controls.getBoundingClientRect();if(box.top<8){controls.style.bottom='auto';controls.style.top='calc(100% + 12px)';}if(box.right>window.innerWidth-8)controls.style.left=Math.min(0,window.innerWidth-8-box.right)+'px';});
  function sync(state) {if(!state)return;current=state;const next=finiteStamp(state.lesson?.serverNow);if(next!==null){serverAt=next;sampleAt=performance.now();}render();}
  const timer=setInterval(render,500);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  window.lessonClock=Object.freeze({configure(options){save=typeof options?.save==='function'?options.save:null;render();},sync,read,destroy(){clearInterval(timer);widget.hidden=true;}});
  render();
})();
