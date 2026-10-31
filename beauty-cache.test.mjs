import test from 'node:test';
import assert from 'node:assert/strict';

test('beauty cache prepares once, survives module reload and resumes partial downloads',async()=>{
 const savedFetch=globalThis.fetch,savedCaches=globalThis.caches,store=new Map(),requests=[];
 globalThis.caches={open:async()=>({match:async key=>store.get(key)?.clone(),put:async(key,response)=>store.set(key,response.clone())})};
 let fail=true;
 globalThis.fetch=async url=>{requests.push(url);if(url==='/openmakeup/download.json')return Response.json(['/openmakeup/assets/a.bin','/openmakeup/assets/b.bin']);if(url.endsWith('b.bin')&&fail)return new Response('offline',{status:503});return new Response('resource')};
 try{
 const a=await import('./dist/beauty-cache.js?cache-test=1');await assert.rejects(a.downloadBeauty(),/Falha/);fail=false;await a.downloadBeauty();assert.equal(requests.filter(x=>x.endsWith('a.bin')).length,1);
 const count=requests.length;await a.downloadBeauty();const b=await import('./dist/beauty-cache.js?cache-test=2');await b.downloadBeauty();await b.cachedFetch('/openmakeup/assets/a.bin');assert.equal(requests.length,count);
 }finally{globalThis.fetch=savedFetch;globalThis.caches=savedCaches;}
});
