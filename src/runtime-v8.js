(()=>{
const $=s=>document.querySelector(s),E=()=>window.visorEditor,key=s=>window.audioPreviewModelV8.key(s);
let prepared=null,enabled=false,busy=false,error='',preview;
function node(){if(!preview){preview=document.createElement('audio');preview.id='v8-processed-audio';preview.preload='auto';document.body.append(preview);}return preview;}
function valid(s){return prepared&&prepared.key===key(s);}
function update(){const box=$('#v8-audio-preview');if(!box)return;const current=valid(E().get());box.querySelector('[data-audio-prepare]').textContent=busy?'Preparing audio…':current?'Refresh processed audio':prepared?'Update audio preview':'Prepare audio preview';box.querySelector('[data-audio-prepare]').disabled=busy||!E().get().clips.some(c=>E().get().assets.some(a=>a.id===c.asset&&a.hasAudio))&&!E().get().audioClips?.length;box.querySelector('[data-audio-cancel]').hidden=!busy;box.querySelector('[data-audio-compare]').hidden=!current;box.querySelectorAll('[data-audio-mode]').forEach(b=>{b.classList.toggle('active',(b.dataset.audioMode==='processed')===enabled);b.setAttribute('aria-pressed',(b.dataset.audioMode==='processed')===enabled);});box.querySelector('output').textContent=busy?'':current?(enabled?'Previewing processed audio':'Previewing original audio'):prepared?'Audio changed. Update the preview.':'';if(error)box.querySelector('output').textContent=error;}
async function prepare(){if(busy)return;E().pause();const state=E().get(),signature=key(state);busy=true;error='';enabled=false;update();try{const result=await native.prepareAudioPreview(state);prepared={key:signature,...result};node().src=result.url;enabled=valid(E().get());}catch(e){error=/cancel/i.test(e.message)?'Preview cancelled.':e.message;}finally{busy=false;update();E().jump(E().get().time);}}
window.audioPreviewPanelV8=p=>{if(E()?.get().panel!=='audio'||p.querySelector('#v8-audio-preview'))return;const box=document.createElement('section');box.id='v8-audio-preview';box.className='v8-audio-preview';box.innerHTML='<button data-audio-prepare>Prepare audio preview</button><button data-audio-cancel hidden>Cancel preparation</button><div class="ed-row" data-audio-compare hidden><button data-audio-mode="original">Original</button><button data-audio-mode="processed">Processed</button></div><output role="status" aria-live="polite"></output>';p.append(box);box.querySelector('[data-audio-prepare]').onclick=prepare;box.querySelector('[data-audio-cancel]').onclick=()=>native.cancel();box.querySelectorAll('[data-audio-mode]').forEach(b=>b.onclick=()=>{enabled=b.dataset.audioMode==='processed';E().jump(E().get().time);update();});update();};
const sync=window.syncNativeMedia;
window.syncNativeMedia=(src,state,playing)=>{
 for(const n of document.querySelectorAll('[data-v8-muted]')){n.muted=n.dataset.v8Muted==='true';delete n.dataset.v8Muted;}
 sync(src,state,playing);if(window.exporting)return;
 const use=enabled&&valid(state);if(enabled&&!use){enabled=false;update();}
 for(const n of document.querySelectorAll('#native-video,#native-music,#native-voice,.v6-audio')){if(use){n.dataset.v8Muted=String(n.muted);n.muted=true;}else if(n.dataset.v8Muted!=null){n.muted=n.dataset.v8Muted==='true';delete n.dataset.v8Muted;}}
 if(preview){preview.muted=!use;preview.playbackRate=1;window.mediaClock.sync(preview,state.time/(state.speed||1),!!use&&playing);}
};
const pause=window.pauseNativeMedia;window.pauseNativeMedia=()=>{pause();if(preview)window.mediaClock.pause(preview);};
window.addEventListener('vv-editor-change',update);
window.audioPreviewPanelV8($('#ed-panel'));
})();
