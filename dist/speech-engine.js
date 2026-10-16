(() => {
 let native,active=false,generation=0,restarts=0,retry,mode;
 async function prepare(){return window.localASR.prepare()}
 async function start(stream,config){
  mode=window.localASR.engine();if(mode!=='browser')return window.localASR.start(stream,config);
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){config.status?.('Áudio conectado; reconhecimento indisponível. Use texto digitado.');await config.gap('Transcrição automática indisponível para este participante.');return {unavailable:true}}
  active=true;restarts=0;const current=++generation;native=new Recognition();
  native.lang=window.languageRouting?.recognition(config.language).locale||{pt:'pt-BR',en:'en-US',es:'es-ES',zh:'zh-CN'}[config.language];native.continuous=true;native.interimResults=true;
  native.onstart=()=>{if(current===generation)config.status?.('Transcrição do navegador ativa.')};
  native.onresult=event=>{if(current!==generation)return;restarts=0;let interim='';for(let i=event.resultIndex;i<event.results.length;i++){const text=event.results[i][0].transcript.trim();if(event.results[i].isFinal)config.text(text);else interim+=text+' '}if(interim)config.phase('Reconhecendo a fala…')};
  native.onerror=event=>{
   if(current!==generation)return;
   if(['no-speech','aborted'].includes(event.error))return;
   if(['not-allowed','service-not-allowed','audio-capture','language-not-supported'].includes(event.error)){active=false;config.status?.('Transcrição bloqueada: '+event.error+'. Verifique o microfone e ligue novamente.')}else config.status?.('Transcrição interrompida: '+event.error+'. Tentando reconectar.');
   config.gap('Interrupção na transcrição automática: '+event.error);
  };
  native.onend=()=>{if(!active||current!==generation)return;const delay=Math.min(30000,400*2**Math.min(++restarts,6));config.status?.('Reconectando a transcrição em '+Math.ceil(delay/1000)+'s. O áudio da chamada continua ativo.');retry=setTimeout(()=>{if(active&&current===generation)try{native.start()}catch{native.onend()}},delay)};
  native.start();
 }
 async function stop(){
  active=false;clearTimeout(retry);
  if(mode!=='browser'){generation++;await window.localASR.stop();return}
  if(!native)return;
  await new Promise(resolve=>{let done=false;const timer=setTimeout(finish,2000);const ended=native.onend;function finish(){if(done)return;done=true;clearTimeout(timer);resolve()}native.onend=()=>{ended?.();finish()};try{native.stop()}catch{finish()}});generation++;
 }
 function abort(){active=false;generation++;clearTimeout(retry);try{native?.abort()}catch{}native=null;window.localASR.abort()}
 window.speechEngine={prepare,start,stop,abort};
})();
