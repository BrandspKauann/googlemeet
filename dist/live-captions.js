(() => {
 function create({self,target,translate,send,render,restore,setTimer=setTimeout,clearTimer=clearTimeout}){
  const drafts=new Map(),done=new Set(),cache=new Map(),sealed=new Set(),latest=new Map();let pending,busy=false,finalizing=0,closed=false,lane=Promise.resolve();
  const key=(source,to,text)=>JSON.stringify([source,to,text]);
  function put(k,entry){cache.set(k,entry);while(cache.size>64){const oldest=cache.keys().next().value;const old=cache.get(oldest);old.reject?.(Error('Prévia expirada.'));clearTimer(old.timer);cache.delete(oldest);}}
  function remember(source,to,text,translated){const k=key(source,to,text),old=cache.get(k);old?.resolve?.(translated);clearTimer(old?.timer);put(k,{promise:Promise.resolve(translated),at:Date.now()});}
  function cachedTranslate(source,to,text,run){
   const k=key(source,to,text),old=cache.get(k);if(old&&Date.now()-old.at<120000)return old.promise.catch(error=>{if(old.remote){if(cache.get(k)===old)cache.delete(k);return cachedTranslate(source,to,text,run);}throw error;});
   const entry={at:Date.now()};entry.promise=lane.then(run).catch(error=>{if(cache.get(k)===entry)cache.delete(k);throw error;});lane=entry.promise.catch(()=>{});put(k,entry);return entry.promise;
  }
  function expect(source,to,text){const k=key(source,to,text);if(cache.has(k))return;const entry={remote:true,at:Date.now()};entry.promise=new Promise((resolve,reject)=>{entry.resolve=resolve;entry.reject=reject;entry.timer=setTimer(()=>{if(cache.get(k)===entry)cache.delete(k);reject(Error('Tradução compartilhada indisponível.'));},8000)});entry.promise.catch(()=>{});put(k,entry);}
  function show(member,packet){
   if(closed||done.has(member.id+':'+packet.turnId))return;
   const previous=drafts.get(member.id);if(packet.revision<(latest.get(member.id)||0)&&previous?.turnId!==packet.turnId)return;latest.set(member.id,Math.max(latest.get(member.id)||0,packet.revision));
   if(previous&&previous.turnId===packet.turnId&&previous.revision>packet.revision){if(packet.translated&&packet.revision>(previous.translationRevision||0)){previous.translated=packet.translated;previous.translationSource=packet.text;previous.translationRevision=packet.revision;render(member,previous);}return;}
   clearTimer(previous?.timer);const inherited=previous?.turnId===packet.turnId?{translated:previous.translated,translationSource:previous.translationSource,translationRevision:previous.translationRevision}:{};const draft={...inherited,...packet,...(packet.translated?{translationSource:packet.text,translationRevision:packet.revision}:{}),member,timer:setTimer(()=>{if(drafts.get(member.id)===draft){drafts.delete(member.id);restore(member);}},20000)};drafts.set(member.id,draft);render(member,draft);
  }
  let revision=0;
  function packet(text,turnId,kind='draft'){const me=self();return {kind,text,turnId,revision:++revision,language:me.language,target:target(me.language)};}
  async function pump(){
   if(busy||finalizing||sealed.size||!pending||closed)return;const job=pending;pending=null;busy=true;
   try{const translated=await translate(job.language,job.target,job.text);if(!closed&&!done.has(self().id+':'+job.turnId)){const result={...job,translated};show(self(),result);send(result);}}
   catch{}finally{busy=false;pump();}
  }
  function preview(text,turnId){if(closed||!text?.trim())return;const draft=packet(text.slice(-500),turnId);show(self(),draft);send(draft);pending=draft;pump();}
  function seal(turnId){sealed.add(turnId);if(pending?.turnId===turnId)pending=null;}
  function settled(turnId){sealed.delete(turnId);pump();}
  function final(text,turnId){
   if(closed||!text?.trim()||text.length>2000)return;const draft=packet(text,turnId,'final-wait');send(draft);if(pending?.turnId===turnId)pending=null;finalizing++;
   Promise.resolve(translate(draft.language,draft.target,text)).then(translated=>{if(!closed)send({...draft,kind:'final-translation',translated});}).catch(()=>{if(!closed)send({...draft,kind:'failed'});}).finally(()=>{finalizing--;pump();});
  }
  function receive(member,p){
   if(closed||!p||typeof p.turnId!=='string'||p.turnId.length>100||!Number.isSafeInteger(p.revision)||p.revision<1||p.language!==member.language||p.target!==target(member.language)||typeof p.text!=='string'||p.text.length>2000||!['draft','final-wait','final-translation','failed'].includes(p.kind))return;
   if(p.translated!==undefined&&(typeof p.translated!=='string'||p.translated.length>3500))return;
   if(p.kind==='failed'){const entry=cache.get(key(p.language,p.target,p.text));entry?.reject?.(Error('Tradução provisória indisponível.'));if(entry?.remote){clearTimer(entry.timer);cache.delete(key(p.language,p.target,p.text));}return;}
   if(p.translated)remember(p.language,p.target,p.text,p.translated);
   if(p.kind==='final-wait'){expect(p.language,p.target,p.text);return;}
   if(p.kind==='draft')show(member,p);else if(p.kind==='final-translation')restore(member,p.turnId);
  }
  function confirmed(memberId,turnId){if(turnId){done.add(memberId+':'+turnId);while(done.size>256)done.delete(done.values().next().value);}const d=drafts.get(memberId);if(d&&(!turnId||d.turnId===turnId)){clearTimer(d.timer);drafts.delete(memberId);}}
  function resetPeer(memberId){const d=drafts.get(memberId);if(d){clearTimer(d.timer);drafts.delete(memberId);}latest.delete(memberId);}
  function close(){closed=true;pending=null;for(const d of drafts.values())clearTimer(d.timer);drafts.clear();for(const e of cache.values()){clearTimer(e.timer);e.reject?.(Error('Aula encerrada.'));}cache.clear();done.clear();sealed.clear();latest.clear();}
  return {preview,seal,settled,final,receive,confirmed,resetPeer,cachedTranslate,has:role=>[...drafts.values()].some(d=>d.member.role===role),close};
 }
 window.liveCaptionFactory={create};
})();
