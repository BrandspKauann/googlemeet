// Wake hidden-page drawing only; no camera, models or image processing here.
let active=false,timer,pending=false;
function tick(){if(!active||pending)return;pending=true;postMessage({type:'tick'});}
self.onmessage=({data})=>{
 if(data.type==='active'){active=data.value;clearTimeout(timer);if(active)tick();}
 else if(data.type==='consumed'){pending=false;if(active)timer=setTimeout(tick,0);}
};
