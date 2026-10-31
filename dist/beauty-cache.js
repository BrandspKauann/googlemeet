export const CACHE='aula-beauty-resources-v1';
const nativeFetch=globalThis.fetch.bind(globalThis),pending=new Map();
let preparation;
const readyKey='/__beauty_resources_ready_v3__';
export async function cachedFetch(input,options){
 if(options?.method&&options.method!=='GET')return nativeFetch(input,options);
 let cache;try{cache=await caches.open(CACHE);const saved=await cache.match(input,{ignoreSearch:true});if(saved)return saved;}catch{}
 const key=typeof input==='string'?input:input.url;
 if(pending.has(key))return (await pending.get(key)).clone();
 const job=(async()=>{const response=await nativeFetch(input,options);if(response.ok&&cache&&/\/(?:openmakeup\/assets|gpupixel)\/|face_landmarker\.task/.test(key))try{await cache.put(input,response.clone());}catch{}return response;})();
 pending.set(key,job);try{return (await job).clone();}finally{pending.delete(key);}
}
export async function downloadBeauty(progress=()=>{}){
 if(!globalThis.caches)throw Error('Este navegador não permite salvar os recursos. Tente no Chrome ou Edge.');
 const cache=await caches.open(CACHE);
 if(await cache.match(readyKey)){progress(100);return;}
 if(!preparation)preparation=(async()=>{
  const response=await nativeFetch('/openmakeup/download.json');if(!response.ok)throw Error('Não foi possível consultar os arquivos do filtro.');
  const urls=await response.json();let next=0,done=0;
  await Promise.all(Array.from({length:4},async()=>{while(next<urls.length){const url=urls[next++];if(!await cache.match(url)){const file=await cachedFetch(url);if(!file.ok)throw Error('Falha no download. Tente novamente para continuar.');await cache.put(url,file);}progress(Math.round(++done/urls.length*100));}}));
  await cache.put(readyKey,new Response('ready'));
 })().finally(()=>preparation=null);
 await preparation;progress(100);
}
