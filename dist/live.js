(() => {
const el=id=>document.getElementById(id);
const box=document.createElement('section');box.className='livebox';
box.innerHTML='<h3>Traduza sua voz</h3><p>Fale em português e acompanhe a legenda no idioma escolhido.</p><button id="startVoice" class="primary">Ativar microfone e tradução</button><button id="stopVoice" hidden>Parar microfone</button><p id="voiceStatus" role="status">Microfone desligado.</p><label for="manualText">Ou teste com uma frase</label><textarea id="manualText" maxlength="2000" placeholder="Digite uma frase em português…"></textarea><button id="translateText">Traduzir frase</button><small>O reconhecimento de voz pode enviar áudio ao serviço do navegador. A tradução integrada é feita no dispositivo. Use o Chrome no computador.</small>';
document.querySelector('.settings').after(box);
const status=t=>el('voiceStatus').textContent=t;
let translator,translatorLang,recognition,listening=false,version=0,queue=Promise.resolve(),records=[],realMode=false,restarts=0;
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
function stop(){listening=false;version++;recognition?.abort();el('startVoice').hidden=false;el('stopVoice').hidden=true;el('mic').classList.remove('selected');el('mic').setAttribute('aria-pressed','false');el('language').disabled=false;status('Microfone desligado.');}
async function prepare(){
 const lang=el('language').value;
 if(translator&&translatorLang===lang)return translator;
 if(!window.Translator)throw new Error('Tradução indisponível neste navegador. Abra localhost:4178 no Chrome atualizado, fora do navegador do ChatGPT.');
 status('Preparando tradução. O primeiro uso pode baixar o pacote de idioma…');
 const create=async(sourceLanguage,targetLanguage)=>{
   if(Translator.availability){
     const available=await Translator.availability({sourceLanguage,targetLanguage});
     if(available==='unavailable')throw new Error('Par de idiomas indisponível.');
   }
   return Translator.create({sourceLanguage,targetLanguage,monitor(m){m.addEventListener('downloadprogress',e=>status('Baixando idioma: '+Math.round(e.loaded*100)+'%'))}});
 };
 let next;
 try{next=await create('pt',lang)}catch{
   // Some installations offer language pairs through English only.
   if(lang!=='en'){
     let first;
     try{
       first=await create('pt','en');const second=await create('en',lang);
       next={async translate(text){return second.translate(await first.translate(text))},destroy(){first.destroy();second.destroy()}};
     }catch{first?.destroy();}
   }
   if(!next)throw new Error('O navegador não conseguiu carregar a tradução para '+langs[lang][1]+'. Você pode transcrever em português; para tradução neste computador será necessário conectar um serviço de tradução.');
 }
 translator?.destroy();translator=next;translatorLang=lang;return next;
}
function mode(){if(realMode)return;pause();realMode=true;el('transcript').replaceChildren();el('caption').textContent='Aguardando sua fala…';el('original').textContent='';document.querySelector('.transhead span').textContent='VOZ REAL';}
function addRecord(text){mode();const row=document.createElement('div');row.className='entry';const meta=document.createElement('div');meta.className='meta';meta.textContent='VOCÊ · '+new Date().toLocaleTimeString('pt-BR');const p=document.createElement('p');p.textContent='Traduzindo…';const small=document.createElement('small');small.textContent=text;row.append(meta,p,small);el('transcript').append(row);el('transcript').scrollTop=el('transcript').scrollHeight;const record={text,translation:'',lang:el('language').value,node:p};records.push(record);return record;}
function translate(text,v){const record=addRecord(text);if(!translator){record.node.textContent='Somente transcrição · português';el('caption').textContent=text;el('original').textContent='Tradução indisponível neste navegador.';return}queue=queue.then(async()=>{if(v!==version){record.node.textContent='Tradução cancelada.';return}try{const result=await translator.translate(text);record.translation=result;record.node.textContent=result;if(v===version){el('caption').textContent=result;el('original').textContent=text;status(listening?'Ouvindo e traduzindo…':'Frase traduzida.')}}catch{record.node.textContent='Falha na tradução.';status('Não foi possível traduzir esta frase. Tente novamente.')}});}
el('startVoice').onclick=async()=>{
 if(!Recognition){status('Reconhecimento de voz indisponível. Use o Chrome ou teste com texto.');return}
 el('startVoice').disabled=true;
 try{
 let translationError='';try{await prepare()}catch(error){translator?.destroy();translator=null;translatorLang=null;translationError=error.message}mode();listening=true;const v=++version;restarts=0;
 recognition=new Recognition();recognition.lang='pt-BR';recognition.continuous=true;recognition.interimResults=true;
 recognition.onstart=()=>{status(translationError?'Ouvindo: somente transcrição. '+translationError:'Ouvindo em português…');el('caplang').textContent=translationError?'PORTUGUÊS · SEM TRADUÇÃO':langs[el('language').value][1];el('startVoice').hidden=true;el('stopVoice').hidden=false;el('mic').classList.add('selected');el('mic').setAttribute('aria-pressed','true');el('language').disabled=true};
 recognition.onresult=event=>{restarts=0;let interim='';for(let i=event.resultIndex;i<event.results.length;i++){const text=event.results[i][0].transcript.trim();if(event.results[i].isFinal&&text)translate(text,v);else interim+=text+' '}if(interim)el('original').textContent=interim};
 recognition.onerror=event=>{if(event.error==='no-speech')return;stop();const errors={'not-allowed':'Permita o microfone para localhost nas configurações do Chrome.','audio-capture':'Microfone não encontrado ou indisponível.','network':'O serviço de reconhecimento de voz está indisponível. Verifique sua conexão.'};status(errors[event.error]||'Erro de reconhecimento: '+event.error)};
 recognition.onend=()=>{if(!listening||v!==version)return;if(++restarts>3){stop();status('O reconhecimento parou. Clique para ativar novamente.');return}setTimeout(()=>{if(listening&&v===version){try{recognition.start()}catch{stop();status('Não foi possível reiniciar o microfone.')}}},400)};
 recognition.start();
 }catch(error){stop();status(error.message)}finally{el('startVoice').disabled=false}
};
el('stopVoice').onclick=stop;
el('mic').title='Ativar ou parar transcrição';el('mic').setAttribute('aria-label','Ativar ou parar transcrição');el('mic').onclick=()=>listening?stop():el('startVoice').click();
el('translateText').onclick=async()=>{const text=el('manualText').value.trim();if(!text){status('Digite uma frase para traduzir.');return}el('translateText').disabled=true;try{await prepare();translate(text,version);await queue}catch(error){status(error.message)}finally{el('translateText').disabled=false}};
const oldLanguage=el('language').onchange;el('language').onchange=()=>{if(!realMode){oldLanguage();return}version++;const name=langs[el('language').value][1];el('target').textContent=name;el('caplang').textContent=name;el('caption').textContent='Ative o microfone ou traduza uma nova frase.';status('Idioma alterado. Ative para preparar a tradução.')};
const oldPlay=el('play').onclick;el('play').onclick=()=>{stop();realMode=false;document.querySelector('.transhead span').textContent='DEMO';render();oldPlay()};
const oldLeave=el('leave').onclick;el('leave').onclick=()=>{stop();oldLeave()};
const oldDownload=el('download').onclick;el('download').onclick=()=>{if(!realMode){oldDownload();return}const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([records.map(r=>r.text+'\n'+(r.translation||'[sem tradução]')+' ('+r.lang+')').join('\n\n')],{type:'text/plain;charset=utf-8'}));a.download='aula-global-voz-real.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
window.addEventListener('pagehide',()=>{stop();translator?.destroy()});
document.querySelector('.note').textContent='Sua voz pode ser transcrita e traduzida neste computador. Participantes e chamada continuam simulados.';
})();
