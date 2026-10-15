const $=id=>document.getElementById(id);
const lines=[['Bem-vindos! Hoje vamos aprender juntos.','Welcome! Today, we will learn together.','¡Bienvenidos! Hoy vamos a aprender juntos.','欢迎！今天我们一起学习。'],['Podem me ouvir bem? Vamos começar nossa aula.','Can you hear me clearly? Let’s start our lesson.','¿Me escuchan bien? Vamos a empezar nuestra clase.','你们能听清楚吗？我们开始上课吧。'],['Em português, usamos “bom dia” para cumprimentar pela manhã.','In Portuguese, we use “bom dia” to greet someone in the morning.','En portugués, usamos “bom dia” para saludar por la mañana.','在葡萄牙语中，我们用“bom dia”来问候早上见面的人。'],['Agora é sua vez. Como você se apresenta?','Now it’s your turn. How do you introduce yourself?','Ahora te toca. ¿Cómo te presentas?','现在轮到你了。你怎么介绍自己？'],['Muito bem! Podemos repetir juntos, devagar.','Very good! We can repeat together, slowly.','¡Muy bien! Podemos repetir juntos, despacio.','很好！我们可以一起慢慢重复。'],['Vocês têm alguma pergunta sobre a aula de hoje?','Do you have any questions about today’s lesson?','¿Tienen alguna pregunta sobre la clase de hoy?','关于今天的课，你们有什么问题吗？']];
const langs={en:[1,'English'],es:[2,'Español'],zh:[3,'中文']};let history=[0],current=0,playing=false,interval,elapsed=0,stream,ended=false;function toast(t){$('toast').textContent=t;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',3500)}function render(){const [index,name]=langs[$('language').value];$('target').textContent=name;$('caplang').textContent=name.toUpperCase();$('caption').textContent=lines[current][index];$('original').textContent=lines[current][0];$('transcript').replaceChildren();history.forEach((n,i)=>{const el=document.createElement('div');el.className='entry';const m=document.createElement('div');m.className='meta';m.textContent=`PROFESSOR · exemplo ${i+1}`;const p=document.createElement('p');p.textContent=lines[n][index];const s=document.createElement('small');s.textContent=lines[n][0];el.append(m,p,s);$('transcript').append(el)});$('transcript').scrollTop=$('transcript').scrollHeight}function pause(){playing=false;clearInterval(interval);$('play').textContent='▶ Continuar aula simulada'}$('language').onchange=render;$('play').onclick=()=>{if(ended){ended=false;elapsed=0;current=0;history=[0];render()}if(playing){pause();return}playing=true;$('play').textContent='Ⅱ Pausar demonstração';interval=setInterval(()=>{current=(current+1)%lines.length;history.push(current);render()},5000)};
$('camera').onclick=async()=>{try{stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});$('video').srcObject=stream;$('video').hidden=false;$('placeholder').hidden=true;$('camToggle').classList.add('selected');$('camToggle').setAttribute('aria-pressed','true');toast('Câmera ativada apenas no seu navegador.')}catch(e){toast('Não foi possível abrir a câmera. Verifique a permissão do navegador.')}};$('camToggle').onclick=()=>{if(!stream){$('camera').click();return}const t=stream.getVideoTracks()[0];t.enabled=!t.enabled;$('video').hidden=!t.enabled;$('placeholder').hidden=t.enabled;$('camToggle').classList.toggle('selected',t.enabled);$('camToggle').setAttribute('aria-pressed',String(t.enabled))};$('mic').onclick=()=>toast('Esta demonstração ainda não captura nem traduz sua voz.');$('cc').onclick=()=>{const visible=$('caption').hidden;$('caption').hidden=!visible;$('cc').classList.toggle('selected',visible);$('cc').setAttribute('aria-pressed',String(visible))};$('help').onclick=()=>$('dialog').showModal();$('close').onclick=()=>$('dialog').close();$('leave').onclick=()=>{pause();ended=true;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}$('video').hidden=true;$('placeholder').hidden=false;$('camToggle').classList.remove('selected');$('camToggle').setAttribute('aria-pressed','false');$('play').textContent='▶ Reiniciar aula simulada';toast('Demonstração encerrada. Sua câmera foi desligada.')};$('download').onclick=()=>{const [n,name]=langs[$('language').value];const blob=new Blob([`Aula Global — transcrição simulada (${name})\n\n`+history.map(i=>lines[i][0]+'\n'+lines[i][n]).join('\n\n')],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='aula-global-transcricao.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};setInterval(()=>{if(playing)elapsed++;$('timer').firstChild.textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0')+' '},1000);render();
// Camera lifecycle: display only after playback begins and release previous streams.
let openingCamera=false;
function cameraState(active){
  $('video').hidden=!active;
  $('placeholder').hidden=active;
  $('camToggle').classList.toggle('selected',active);
  $('camToggle').setAttribute('aria-pressed',String(active));
}
$('camera').onclick=async()=>{
  if(openingCamera)return;
  openingCamera=true;
  $('camera').disabled=true;
  $('camera').textContent='Abrindo câmera…';
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw Object.assign(new Error(),{name:'Unsupported'});
    if(stream)stream.getTracks().forEach(t=>t.stop());
    stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:'user'},audio:false});
    const track=stream.getVideoTracks()[0];
    const video=$('video');
    video.srcObject=stream;
    video.muted=true;
    cameraState(true);
    await video.play();
    track.onended=()=>{stream=null;video.srcObject=null;cameraState(false);toast('A câmera foi desconectada. Ative novamente para tentar.')};
    toast('Câmera ativa: '+(track.label||'câmera padrão'));
  }catch(error){
    if(stream)stream.getTracks().forEach(t=>t.stop());
    stream=null;$('video').srcObject=null;cameraState(false);
    const messages={NotAllowedError:'Acesso à câmera bloqueado. Permita a câmera para localhost nas configurações do navegador.',NotFoundError:'Nenhuma câmera foi encontrada no computador.',NotReadableError:'Não foi possível ler a câmera. Feche outros aplicativos que estejam usando a webcam e tente novamente.',Unsupported:'Este navegador não disponibilizou a câmera. Abra http://localhost:4178 no Chrome ou Edge.',AbortError:'A abertura da câmera foi interrompida. Tente novamente.'};
    toast(messages[error.name]||'Não foi possível exibir a câmera: '+error.name);
  }finally{openingCamera=false;$('camera').disabled=false;$('camera').textContent='Ativar minha câmera'}
};
$('camToggle').onclick=async()=>{
  const track=stream?.getVideoTracks()[0];
  if(!track||track.readyState==='ended'){$('camera').click();return}
  track.enabled=!track.enabled;cameraState(track.enabled);
  if(track.enabled){try{await $('video').play()}catch{toast('Clique em ativar minha câmera para reconectar.')}}
};
window.addEventListener('pagehide',()=>stream?.getTracks().forEach(t=>t.stop()));
