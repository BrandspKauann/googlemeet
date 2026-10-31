export const VERSION='20261031-reinstall1';
export const CACHE='aula-beauty-resources-'+VERSION;
const nativeFetch=globalThis.fetch.bind(globalThis),pending=new Map();
let preparation,controller,migration;
const readyKey='/__beauty_verified_manifest__';
async function openCache(){
 if(!globalThis.caches)throw Error('Este navegador não permite instalar os recursos do filtro.');
 if(!migration)migration=(async()=>{for(const key of await caches.keys())if(key.startsWith('aula-beauty-resources-')&&key!==CACHE)await caches.delete(key);})();
 await migration;return caches.open(CACHE);
}
const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
export async function cachedFetch(input,options){
 if(options?.method&&options.method!=='GET')return nativeFetch(input,options);
 let cache;try{cache=await openCache();const saved=await cache.match(input);if(saved)return saved;}catch{}
 const key=typeof input==='string'?input:input.url;
 if(pending.has(key))return (await pending.get(key)).clone();
 const job=(async()=>{const response=await nativeFetch(input,options);if(response.ok&&cache&&/\/(?:openmakeup\/assets|gpupixel)\/|face_landmarker\.task/.test(key))try{await cache.put(input,response.clone());}catch{}return response;})();
 pending.set(key,job);try{return (await job).clone();}finally{pending.delete(key);}
}
export async function downloadBeauty(progress=()=>{}){
 if(!preparation)preparation=(async()=>{
  controller=new AbortController();const signal=controller.signal,cache=await openCache();let manifest;
  const saved=await cache.match(readyKey);if(saved)try{manifest=await saved.json();}catch{}
  if(!manifest){const response=await nativeFetch('/openmakeup/download.json?v='+VERSION,{cache:'reload',signal});if(!response.ok)throw Error('Não foi possível consultar os arquivos do filtro.');manifest=await response.json();}
  if(manifest.version!==VERSION||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Os recursos do filtro estão desatualizados. Recarregue a página e reinstale o filtro.');
  let next=0,done=0;
  const downloads=await Promise.allSettled(Array.from({length:3},async()=>{while(next<manifest.files.length){
   const file=manifest.files[next++],url=file.url;
   if(!/^\/(?:openmakeup\/(?:assets|runtime)\/|gpupixel\/)/.test(url)||!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('Manifesto do filtro inválido.');
   const existing=await cache.match(url);let bytes=existing?await existing.arrayBuffer():null;
   if(!bytes||bytes.byteLength!==file.bytes||await sha256(bytes)!==file.sha256){
    await cache.delete(url);const response=await nativeFetch(url,{cache:'reload',signal});if(!response.ok)throw Error('Falha no download. Tente reinstalar o filtro.');bytes=await response.arrayBuffer();
    if(bytes.byteLength!==file.bytes||await sha256(bytes)!==file.sha256)throw Error('Um arquivo do filtro chegou incompleto. Tente reinstalar o filtro.');
    if(signal.aborted)throw Error('Instalação do filtro cancelada.');
    await cache.put(url,new Response(bytes,{headers:{'Content-Type':response.headers.get('Content-Type')||'application/octet-stream'}}));
   }
   progress(Math.round(++done/manifest.files.length*100));
  }}));
  const failure=downloads.find(result=>result.status==='rejected');if(failure)throw failure.reason;
  if(signal.aborted)throw Error('Instalação do filtro cancelada.');await cache.put(readyKey,Response.json(manifest));
 })().finally(()=>{preparation=null;controller=null;});
 await preparation;progress(100);
}
export async function resetBeautyResources(){
 controller?.abort();await preparation?.catch(()=>{});await Promise.allSettled([...pending.values()]);pending.clear();
 for(const key of await caches.keys())if(key.startsWith('aula-beauty-resources-'))await caches.delete(key);
 migration=null;
}
