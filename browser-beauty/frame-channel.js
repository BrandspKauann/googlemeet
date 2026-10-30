// One input frame and one output frame in flight, with explicit ownership.
export function createFrameChannel(scope){
 let pending,read,outputAck,closed=false;
 const cancel=()=>{closed=true;pending?.close();pending=null;read?.({done:true});read=null;outputAck?.();outputAck=null;return Promise.resolve();};
 return {
  abort:cancel,
  push(frame){if(closed){frame.close();return;}if(read){const next=read;read=null;next({done:false,value:frame});}else{pending?.close();pending=frame;}},
  release(){if(!closed)scope.postMessage({type:'input-consumed'});},
  consumed(){const next=outputAck;outputAck=null;next?.();},
  readable:{getReader:()=>({read:()=>{if(pending){const value=pending;pending=null;return Promise.resolve({done:false,value});}if(closed)return Promise.resolve({done:true});return new Promise(resolve=>read=resolve);},cancel})},
  writable:{getWriter:()=>({write:frame=>{if(closed)return Promise.reject(Error('Filtro encerrado.'));return new Promise((resolve,reject)=>{outputAck=resolve;try{scope.postMessage({type:'output',frame},[frame]);}catch(error){outputAck=null;reject(error);}});},abort:cancel})}
 };
}
