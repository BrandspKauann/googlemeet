(() => {
 let native,active=false,generation=0,retry,mode,session;
 const clearRetry=()=>{clearTimeout(retry);retry=undefined};
 async function prepare(){return window.localASR.prepare()}
 async function start(stream,config){
  mode=window.localASR.engine();if(mode!=='browser')return window.localASR.start(stream,config);
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){config.status?.('Áudio conectado; reconhecimento indisponível. Abra a aula no Chrome ou Edge.');await config.gap('Transcrição automática indisponível para este participante.');return {unavailable:true}}
  clearRetry();active=true;const current=++generation;
  const locale=window.languageRouting?.recognition(config.language).locale||{pt:'pt-BR',en:'en-US',es:'es-ES',zh:'zh-CN'}[config.language];
  let failures=0,incident=false,local=false;
  const valid=()=>current===generation;
  const report=()=>{if(incident)return;incident=true;Promise.resolve(config.gap('Transcrição temporariamente indisponível por falha no serviço de voz. O áudio da chamada continuou ativo.')).catch(()=>{})};
  async function installed(){
   if(typeof Recognition.available!=='function')return false;
   let timer;try{return await Promise.race([Recognition.available({langs:[locale],processLocally:true}),new Promise(resolve=>{timer=setTimeout(()=>resolve('unavailable'),1500)})])==='available';}catch{return false}finally{clearTimeout(timer)}
  }
  function pause(message){active=false;clearRetry();const old=native;native=null;try{old?.abort()}catch{}config.status?.(message+' O áudio da chamada continua ligado.');config.phase?.('Legendas pausadas. O áudio continua ligado.');config.reconnect?.(true);}
  function schedule(failed){
   if(!active||!valid()||retry!==undefined)return;
   if(globalThis.navigator?.onLine===false){pause('Sem conexão para reconhecer a fala. Reconecte a internet e clique em Reconectar legendas.');return;}
   const delay=failed?Math.min(12000,1500*2**Math.max(0,failures-1)):400;
   if(failed)config.status?.('Reconectando o serviço de voz… tentativa '+failures+' de 3. O áudio continua ligado.');
   retry=setTimeout(()=>{retry=undefined;if(active&&valid())open();},delay);
  }
  function open(){
   if(!active||!valid())return;
   const old=native;native=null;try{old?.abort()}catch{}
   const recognizer=new Recognition();native=recognizer;let failed=false;
   recognizer.lang=locale;recognizer.continuous=true;recognizer.interimResults=true;if(local)recognizer.processLocally=true;
   const currentInstance=()=>valid()&&native===recognizer;
   recognizer.onstart=()=>{if(currentInstance()){config.status?.(local?'Transcrição no dispositivo ativa.':'Transcrição do navegador ativa.');config.phase?.('Ouvindo…');}};
   recognizer.onresult=event=>{
    if(!currentInstance())return;failures=0;incident=false;config.reconnect?.(false);let interim='';
    for(let i=event.resultIndex;i<event.results.length;i++){const text=event.results[i][0].transcript.trim();if(event.results[i].isFinal)config.text(text);else interim+=text+' '}
    if(interim)config.phase?.('Reconhecendo a fala…');
   };
   recognizer.onerror=event=>{
    if(!currentInstance()||failed||['no-speech','aborted'].includes(event.error))return;
    failed=true;report();failures++;config.phase?.('Reconectando as legendas… O áudio continua ligado.');
    if(['not-allowed','service-not-allowed','audio-capture','language-not-supported'].includes(event.error)){pause('O navegador bloqueou a transcrição. Verifique a permissão do microfone e clique em Reconectar legendas.');return;}
    if(failures>3){pause('O serviço de voz não respondeu. A conexão ou VPN pode estar impedindo o acesso. Clique em Reconectar legendas para tentar novamente.');return;}
    schedule(true);
   };
   recognizer.onend=()=>{if(currentInstance())schedule(failed)};
   try{recognizer.start()}catch(error){recognizer.onerror({error:error.name==='NotAllowedError'?'not-allowed':'network'})}
  }
  async function reconnect(){if(!valid())return;clearRetry();active=true;failures=0;config.reconnect?.(false);local=await installed();if(active&&valid())open();}
  session={reconnect,isFailed:()=>incident};
  local=await installed();if(active&&valid())open();
 }
 async function stop(){
  active=false;session=null;clearRetry();
  if(mode!=='browser'){generation++;await window.localASR.stop();return}
  if(!native){generation++;return;}
  await new Promise(resolve=>{let done=false;const timer=setTimeout(finish,2000);const ended=native.onend;function finish(){if(done)return;done=true;clearTimeout(timer);resolve()}native.onend=()=>{ended?.();finish()};try{native.stop()}catch{finish()}});generation++;
 }
 function abort(){active=false;generation++;session=null;clearRetry();try{native?.abort()}catch{}native=null;window.localASR.abort()}
 window.addEventListener?.('online',()=>{if(session?.isFailed())session.reconnect()});
 window.speechEngine={prepare,start,stop,abort,retry:()=>session?.reconnect()};
})();
