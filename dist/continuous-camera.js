// Native camera tracks keep flowing when canvas rendering is throttled in hidden tabs.
(() => {
  window.ContinuousCamera=class {
    constructor(doc){this.doc=doc;this.revision=0;doc.addEventListener('visibilitychange',()=>{this.select().catch(()=>{})});}
    clear(){this.revision++;this.cancelWait?.();this.cancelWait=null;this.raw=this.filtered=this.publish=null;}
    async set(raw,filtered,publish){this.clear();this.raw=raw;this.filtered=filtered;this.publish=publish;await this.select();}
    async select(){
      const revision=++this.revision;this.cancelWait?.();this.cancelWait=null;
      const {raw,filtered,publish}=this;
      if(!raw||!publish)return;
      if(this.doc.hidden){await publish(raw);return;}
      // Do not send the stale canvas frame left behind when the tab was hidden.
      const video=this.doc.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=filtered;
      let callback,timer,finished=false;
      const fresh=await new Promise(resolve=>{
        const finish=value=>{if(finished)return;finished=true;clearTimeout(timer);if(callback!==undefined)video.cancelVideoFrameCallback?.(callback);video.pause();video.srcObject=null;resolve(value);};
        this.cancelWait=()=>finish(false);
        timer=setTimeout(()=>finish(false),5000);
        if(!video.requestVideoFrameCallback){finish(false);return;}
        // The first callback may be the old frame; require a second rendered frame.
        callback=video.requestVideoFrameCallback(()=>{callback=video.requestVideoFrameCallback(()=>finish(true));});
        video.play().catch(()=>finish(false));
      });
      if(revision!==this.revision)return;
      this.cancelWait=null;
      await publish(fresh&&!this.doc.hidden?filtered:raw);
    }
  };
})();
