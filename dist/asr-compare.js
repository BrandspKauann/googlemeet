(() => {
 const get=id=>document.getElementById(id);let report;
 window.deviceASR.onProgress(p=>get('status').textContent=window.asrUtils.progressLabel(p));
 get('prepare').onclick=async()=>{get('prepare').disabled=true;get('cancelPrepare').hidden=false;get('status').textContent='Verificando WebGPU e iniciando o modelo…';try{await window.deviceASR.prepare();get('run').disabled=false}catch(error){get('status').textContent=error.message}finally{get('prepare').disabled=false;get('cancelPrepare').hidden=true}};
 get('cancelPrepare').onclick=()=>window.deviceASR.abort('Preparação cancelada.');
 get('run').onclick=async()=>{
  get('run').disabled=true;get('save').hidden=true;
  try{
   const file=get('audio').files[0];if(!file||!file.name.toLowerCase().endsWith('.wav'))throw Error('Selecione um arquivo WAV.');if(file.size>20*1024*1024)throw Error('Use uma amostra WAV de até 20 MB.');
   get('status').textContent='Transcrevendo a amostra no dispositivo…';
   const audio=await window.deviceASR.decode(await file.arrayBuffer());const duration=audio.length/16000;
   if(duration>120)throw Error('Use uma amostra de até dois minutos.');
   const language=get('language').value;
   const result=await window.deviceASR.transcribe(audio,language);
   const reference=get('reference').value.trim();
   report={...result,language,duration,realTimeFactor:result.processingMs/(1000*duration),reference,errorRate:reference?window.asrUtils.errorRate(reference,result.text,language):null,testType:'Arquivo fornecido pelo usuário; não armazenado'};
   get('result').textContent=JSON.stringify(report,null,2);get('status').textContent='Comparação concluída. Mandarim usa CER e conta diferenças entre escrita tradicional e simplificada.';get('save').hidden=false;
  }catch(error){get('status').textContent=error.message}finally{get('run').disabled=!window.deviceASR.ready()}
 };
 get('save').onclick=()=>{if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='comparacao-whisper.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
})();
