(()=>{
const $=s=>document.querySelector(s),fmt=window.timelineModelV7.formatTime,base=window.nativeToolPreview;
let activeVideo;
window.nativeToolPreview=(tool,files)=>{
 base(tool,files);if(!['trim','gif','frame','vcompress','vconvert','vaudio'].includes(tool?.id))return;
 /* 0.15 (Phase 15): the file card stays in view (it has the remove button); the tool page decides whether the drop area shows */const list=$('#v-filelist');
 if(!files.length)return;const a=files[0];let box=$('#v5-tool-preview');
 if(!box){box=document.createElement('section');box.id='v5-tool-preview';box.className='v-card';const v=document.createElement('video');v.crossOrigin='anonymous';v.src=a.url;v.className='v5-player';v.preload='auto';box.append(v);list.before(box);}
 if(box.dataset.v7===a.id)return;box.dataset.v7=a.id;
 const video=box.querySelector('video');if(!video)return;if(activeVideo&&activeVideo!==video)activeVideo.pause();activeVideo=video;
 video.controls=false;video.ontimeupdate=null;box.querySelector('.v5-range-handles')?.remove();box.querySelector('h3')?.remove();
 const start=$('#v-start'),end=$('#v-end'),frame=tool.id==='frame'?$('#v-content input[type=number]'):null,hasRange=!!(start&&end);
 [start,end,frame].filter(Boolean).forEach(n=>{n.closest('label').hidden=true;});if(frame){frame.id='v-frame-time';frame.value=0;}
 const controls=document.createElement('section');controls.className='v7-tool-controls';controls.innerHTML='<div class="v7-tool-toolbar"><button type="button" class="v-button" id="v7-tool-play">Play</button><button type="button" class="v-button" data-frame="-1" aria-label="Previous frame">← Frame</button><button type="button" class="v-button" data-frame="1" aria-label="Next frame">Frame →</button><output id="v7-tool-time"></output></div><div class="v7-tool-ruler"></div><div class="v7-tool-strip" tabindex="0" aria-label="Video timeline. Drag to seek, arrow keys step frames."><div class="v7-tool-film"></div><div class="v7-tool-selection"></div><button type="button" class="v7-tool-in" aria-label="Trim start"></button><button type="button" class="v7-tool-out" aria-label="Trim end"></button><span class="v7-tool-head"></span></div><label class="v7-scrub-label">Playhead<input id="v7-tool-scrub" aria-label="Video playhead" type="range" min="0" step="any" value="0"></label><p class="v-small" id="v7-tool-range"></p><button type="button" class="v-button" id="v7-replace-tool">Use another video</button>';
 box.insertBefore(controls,box.querySelector('#v5-range')||null);
 const strip=controls.querySelector('.v7-tool-strip'),scrub=$('#v7-tool-scrub'),play=$('#v7-tool-play'),time=$('#v7-tool-time'),range=$('#v7-tool-range'),head=controls.querySelector('.v7-tool-head'),inPoint=controls.querySelector('.v7-tool-in'),outPoint=controls.querySelector('.v7-tool-out');
 const max=Math.max(0,a.duration-.001),fps=a.fps||30;let target=0,seeking=false,dragCleanup=null,presentedTime=null;
 scrub.max=max;inPoint.hidden=outPoint.hidden=!hasRange;
 controls.querySelector('.v7-tool-ruler').innerHTML=Array.from({length:5},(_,i)=>'<span>'+fmt(a.duration*i/4)+'</span>').join('');
 native.mediaVisuals(a.id).then(v=>{if(box.isConnected)controls.querySelector('.v7-tool-film').innerHTML=(v.frames||[]).map(src=>'<img alt="" src="'+src+'">').join('');}).catch(()=>{});
 function draw(){const t=seeking?target:video.currentTime;time.textContent=fmt(t)+' / '+fmt(a.duration);scrub.value=t;head.style.left=t/a.duration*100+'%';play.textContent=video.paused?'Play':'Pause';play.setAttribute('aria-label',video.paused?'Play video':'Pause video');
  const lo=hasRange?+start.value:0,hi=hasRange?+end.value:a.duration;inPoint.style.left=lo/a.duration*100+'%';outPoint.style.left=hi/a.duration*100+'%';Object.assign(controls.querySelector('.v7-tool-selection').style,{left:lo/a.duration*100+'%',width:(hi-lo)/a.duration*100+'%'});range.textContent=hasRange?'Selected: '+fmt(lo)+' – '+fmt(hi)+' · '+fmt(hi-lo)+' duration':'← → steps one frame, Shift + ← → ten.';
  if(frame)frame.value=String(!seeking&&presentedTime!==null?presentedTime:t);
 }
 if(frame&&video.requestVideoFrameCallback){const presented=(_now,meta)=>{presentedTime=meta.mediaTime;if(!seeking)frame.value=String(presentedTime);if(box.isConnected)video.requestVideoFrameCallback(presented);};video.requestVideoFrameCallback(presented);}
 function seek(t){presentedTime=null;target=Math.max(0,Math.min(max,t));seeking=true;window.mediaClock.sync(video,target,false);if(!video.seeking&&video.readyState>=1)seeking=false;draw();}
 function step(d){seek((seeking?target:video.currentTime)+d/fps);}
 function toggle(){if(video.paused){seeking=false;window.mediaClock.pause(video);video.play().catch(e=>window.nativeShell.notify(e.message));}else video.pause();draw();}
 scrub.oninput=()=>seek(+scrub.value);play.onclick=toggle;
 controls.querySelectorAll('[data-frame]').forEach(b=>b.onclick=()=>step(+b.dataset.frame));
 controls.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();step((e.key==='ArrowLeft'?-1:1)*(e.shiftKey?10:1));}else if(e.code==='Space'&&!e.target.closest('button')){e.preventDefault();toggle();}});
 strip.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();strip.focus();video.pause();const mode=e.target===inPoint?'start':e.target===outPoint?'end':'seek',r=strip.getBoundingClientRect();
  const move=v=>{let t=Math.max(0,Math.min(max,(v.clientX-r.left)/r.width*a.duration));if(mode==='start'){t=Math.min(t,+end.value-1/fps);start.value=t;start.dispatchEvent(new Event('change'));}else if(mode==='end'){t=Math.max(t,+start.value+1/fps);end.value=t;end.dispatchEvent(new Event('change'));}seek(t);};
  const cleanup=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cleanup);window.removeEventListener('blur',cleanup);dragCleanup=null;},up=v=>{move(v);cleanup();};dragCleanup?.();dragCleanup=cleanup;window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cleanup);window.addEventListener('blur',cleanup);move(e);
 };
 video.addEventListener('seeked',()=>{if(Math.abs(video.currentTime-target)<.002)seeking=false;draw();});
 video.addEventListener('timeupdate',()=>{if(!video.seeking&&!video.paused){target=video.currentTime;seeking=false;if(hasRange&&video.currentTime>=+end.value)video.pause();}draw();});
 for(const event of ['loadedmetadata','play','pause','ended'])video.addEventListener(event,draw);
 $('#v7-replace-tool').onclick=()=>{dragCleanup?.();video.pause();window.nativeShell.openTool(tool.id);};
 const observer=new MutationObserver(()=>{if(!box.isConnected){dragCleanup?.();window.mediaClock.pause(video);observer.disconnect();}});observer.observe($('#v-content'),{childList:true,subtree:true});
 draw();
};
})();
