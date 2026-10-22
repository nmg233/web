// Shared by the desk, request inbox and notification counter. No hidden-page polling.
export function visiblePolling({run,interval=30000,document:doc=globalThis.document,window:view=globalThis.window,setTimer=setTimeout,clearTimer=clearTimeout,now=Date.now}){
 let timer=null,disposed=false,running=false,last=-Infinity;
 const clear=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 const tick=async()=>{
  clear();if(disposed||doc.hidden||running)return;
  running=true;last=now();try{await run();}catch{/* The resource owner presents the error. */}finally{running=false;if(!disposed&&!doc.hidden)timer=setTimer(tick,interval);}
 };
 const visible=()=>{clear();if(!doc.hidden&&!disposed){if(now()-last>500)void tick();else timer=setTimer(tick,interval);}};
 const focused=()=>{if(!doc.hidden&&now()-last>1000)void tick();};
 doc.addEventListener('visibilitychange',visible);view.addEventListener('focus',focused);if(!doc.hidden)timer=setTimer(tick,0);
 return()=>{disposed=true;clear();doc.removeEventListener('visibilitychange',visible);view.removeEventListener('focus',focused);};
}
