export const CACHE='aula-beauty-resources-v1';
const nativeFetch=globalThis.fetch.bind(globalThis);
export async function cachedFetch(input,options){
  if(!options?.method||options.method==='GET')try{const cache=await caches.open(CACHE),saved=await cache.match(input,{ignoreSearch:true});if(saved)return saved;}catch{}
  return nativeFetch(input,options);
}
export async function downloadBeauty(progress){
  if(!globalThis.caches)throw Error('Este navegador não permite salvar os recursos. Tente no Chrome ou Edge.');
  const response=await nativeFetch('/openmakeup/download.json');if(!response.ok)throw Error('Não foi possível consultar os arquivos do filtro.');
  const urls=await response.json(),cache=await caches.open(CACHE);let next=0,done=0;
  await Promise.all(Array.from({length:4},async()=>{while(next<urls.length){const url=urls[next++];if(!await cache.match(url)){const file=await nativeFetch(url);if(!file.ok)throw Error('Falha no download. Tente novamente para continuar.');await cache.put(url,file);}progress(Math.round(++done/urls.length*100));}}));
}
