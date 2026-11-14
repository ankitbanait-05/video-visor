/* One pending seek per media element. A fast drag always lands at its last target. */
(()=>{
 const clocks=new WeakMap();
 function clock(node){
  if(clocks.has(node))return clocks.get(node);
  const c={target:0,playing:false,apply(){
   if(window.exporting)return;
   if(!c.playing)node.pause();
   if(node.readyState<1||node.seeking)return;
   const target=Math.max(0,Math.min(c.target,Number.isFinite(node.duration)?Math.max(0,node.duration-.001):c.target));
   if(Math.abs(node.currentTime-target)>(c.playing?.25:.001)){node.currentTime=target;return;}
   if(c.playing&&node.paused)node.play().catch(()=>{});
  }};
  for(const event of ['loadedmetadata','seeked'])node.addEventListener(event,()=>c.apply());
  clocks.set(node,c);return c;
 }
 window.mediaClock={sync(node,time,playing=false){const c=clock(node);c.target=Math.max(0,Number(time)||0);c.playing=playing;c.apply();},pause(node){if(!node)return;const c=clocks.get(node);if(c)c.playing=false;node.pause();}};
})();
