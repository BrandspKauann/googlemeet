// Retry small, ordered portions of the pinned public weights instead of restarting a GB-sized response.
export function createRangeFetch(fetcher, weights, notify=()=>{}, {chunkSize=4*1024*1024,concurrency=3,timeoutMs=60000,retryMs=750}={}) {
 return async (input,init={}) => {
  const url=String(input),size=weights[url];if(!size||(init.method&&init.method.toUpperCase()!=='GET'))return fetcher(input,init);
  const stopped=new AbortController();const chunks=Math.ceil(size/chunkSize);
  async function portion(index) {
   const start=index*chunkSize,end=Math.min(size,start+chunkSize)-1;
   for(let attempt=0;attempt<3;attempt++) {
    const controller=new AbortController(),abort=()=>controller.abort();stopped.signal.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,timeoutMs);
    try {
     if(stopped.signal.aborted)throw Error('Download cancelado.');
     const headers=new Headers(init.headers);headers.set('Range',`bytes=${start}-${end}`);
     const response=await fetcher(input,{...init,headers,signal:controller.signal});
     if(index===0&&response.status===200)return {whole:response};
     if(response.status!==206)throw Error('O servidor não forneceu a parte solicitada.');
     const range=response.headers.get('Content-Range');
     if(range&&range!==`bytes ${start}-${end}/${size}`)throw Error('Parte do modelo fora de ordem.');
     const bytes=new Uint8Array(await response.arrayBuffer());
     if(bytes.length!==end-start+1)throw Error('Parte do modelo incompleta.');
     return {bytes};
    } catch(error) {
     if(stopped.signal.aborted||attempt===2)throw Error('Não foi possível baixar o modelo. Verifique a conexão e tente preparar novamente, ou escolha Reconhecimento do navegador.');
     notify({status:'retry',file:'Retomando uma parte do download…'});
     await new Promise(resolve=>setTimeout(resolve,retryMs*(attempt+1)));
    } finally {clearTimeout(timer);stopped.signal.removeEventListener('abort',abort)}
   }
  }
  const first=await portion(0);if(first.whole)return first.whole;
  const pending=new Map([[0,Promise.resolve(first)]]);let next=0,schedule=1;
  function fill(){while(schedule<chunks&&pending.size<concurrency){const promise=portion(schedule);promise.catch(()=>{});pending.set(schedule++,promise)}}
  fill();
  const body=new ReadableStream({
   async pull(controller){try{const {bytes}=await pending.get(next);pending.delete(next++);controller.enqueue(bytes);if(next===chunks){controller.close();return}fill()}catch(error){stopped.abort();pending.clear();controller.error(error)}},
   cancel(){stopped.abort();pending.clear()},
  });
  return new Response(body,{status:200,headers:{'Content-Length':String(size),'Content-Type':'application/octet-stream'}});
 };
}
