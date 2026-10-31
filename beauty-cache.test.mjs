import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

test('beauty reinstalls only its cache, checks hashes, resumes failures and repairs corrupt resources',async()=>{
 const savedFetch=globalThis.fetch,savedCaches=globalThis.caches,stores=new Map([['aula-beauty-resources-v1',new Map([['old',new Response('old')]])],['classroom-private-data',new Map([['keep',new Response('keep')]])]]),requests=[];
 const resources={'/openmakeup/assets/a.bin':'resource-a','/openmakeup/assets/b.bin':'resource-b'};
 const manifest={version:'20261031-reinstall1',files:Object.entries(resources).map(([url,text])=>({url,bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')}))};
 globalThis.caches={keys:async()=>[...stores.keys()],delete:async key=>stores.delete(key),open:async name=>{if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {match:async key=>store.get(key)?.clone(),put:async(key,response)=>store.set(key,response.clone()),delete:async key=>store.delete(key)}}};
 let fail=true;
 globalThis.fetch=async(url,options)=>{requests.push({url,options});if(url.startsWith('/openmakeup/download.json'))return Response.json(manifest);if(url.endsWith('b.bin')&&fail)return new Response('offline',{status:503});return new Response(resources[url])};
 try{
  const a=await import('./dist/beauty-cache.js?reinstall-test=1');await assert.rejects(a.downloadBeauty(),/Falha/);fail=false;await a.downloadBeauty();
  assert.equal(stores.has('aula-beauty-resources-v1'),false);assert.equal(stores.has('classroom-private-data'),true);
  assert.equal(requests.filter(x=>x.url.endsWith('a.bin')).length,1);assert.ok(requests.every(x=>x.options.cache==='reload'));
  const count=requests.length;await a.downloadBeauty();const b=await import('./dist/beauty-cache.js?reinstall-test=2');await b.downloadBeauty();await b.cachedFetch('/openmakeup/assets/a.bin');assert.equal(requests.length,count,'verified installation reuses all downloaded files');
  stores.get(a.CACHE).set('/openmakeup/assets/a.bin',new Response('corrupted'));
  await b.downloadBeauty();assert.equal(requests.length,count+1,'corrupt cached file must be downloaded again');
  await a.resetBeautyResources();assert.equal(stores.has(a.CACHE),false);assert.equal(stores.has('classroom-private-data'),true);
  await a.downloadBeauty();assert.equal(stores.has(a.CACHE),true);assert.equal(requests.filter(x=>x.url.endsWith('b.bin')).length,3,'explicit reinstall obtains fresh resources');
 }finally{globalThis.fetch=savedFetch;globalThis.caches=savedCaches;}
});
