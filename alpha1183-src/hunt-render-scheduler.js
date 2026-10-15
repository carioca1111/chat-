'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.HuntRenderScheduler=api;})(typeof window!=='undefined'?window:globalThis,function(){
  class CoalescedRenderScheduler {
    constructor(options={}){
      this.paint=typeof options.paint==='function'?options.paint:()=>{};
      this.minInterval=Math.max(0,Number(options.minInterval)||200);
      this.now=options.now||(()=>typeof performance!=='undefined'?performance.now():Date.now());
      this.raf=options.raf||((fn)=>requestAnimationFrame(fn));
      this.cancelRaf=options.cancelRaf||((id)=>cancelAnimationFrame(id));
      this.setTimer=options.setTimer||((fn,ms)=>setTimeout(fn,ms));
      this.clearTimer=options.clearTimer||((id)=>clearTimeout(id));
      this.visible=false;this.dirty=false;this.timer=0;this.frame=0;this.lastPaint=-Infinity;this.requests=0;this.paints=0;this.timerWakeups=0;this.rafWakeups=0;
    }
    _queueFrame(){
      if(!this.visible||this.frame)return;
      this.frame=this.raf(ts=>{this.frame=0;this.rafWakeups++;if(!this.visible||!this.dirty)return;this.dirty=false;this.lastPaint=Number.isFinite(Number(ts))?Number(ts):this.now();this.paints++;this.paint();if(this.dirty)this.request();});
    }
    request(){
      this.requests++;this.dirty=true;if(!this.visible||this.timer||this.frame)return;
      const wait=Math.max(0,this.minInterval-(this.now()-this.lastPaint));
      if(wait>0){this.timer=this.setTimer(()=>{this.timer=0;this.timerWakeups++;this._queueFrame();},wait);return;}
      this._queueFrame();
    }
    notePaint(ts=this.now()){this.lastPaint=Number(ts)||0;this.paints++;this.dirty=false;}
    setVisible(on){
      this.visible=!!on;
      if(!this.visible){if(this.timer){this.clearTimer(this.timer);this.timer=0;}if(this.frame){this.cancelRaf(this.frame);this.frame=0;}return;}
      if(this.dirty)this.request();
    }
    cancel(){if(this.timer){this.clearTimer(this.timer);this.timer=0;}if(this.frame){this.cancelRaf(this.frame);this.frame=0;}this.dirty=false;}
    snapshot(){return {visible:this.visible,dirty:this.dirty,requests:this.requests,paints:this.paints,timerWakeups:this.timerWakeups,rafWakeups:this.rafWakeups,timerActive:!!this.timer,frameActive:!!this.frame};}
  }
  return {CoalescedRenderScheduler};
});
