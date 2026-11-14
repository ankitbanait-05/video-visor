(async()=>{try{
 const render=new URLSearchParams(location.search).has('render');
 const state=render?null:await native.load();
 window.openai={widgetState:state,setWidgetState:data=>render?Promise.resolve():native.save(data)};
 for(const file of ['engines/edit-model.js','engines/timeline-retime.js','engines/editor-model-v5.js','engines/timeline-model-v7.js','engines/audio-preview-v8.js','engines/tracks-v8.js','engines/titles-v8.js','engines/titles-v11.js','engines/explainer-v12.js','engines/draft-v13.js','engines/speed-v15.js','engines/media-clock.js','runtime.js','editor.js','shell.js','runtime-v5.js','runtime-v6.js','runtime-v7.js','runtime-v8.js','runtime-v13.js','runtime-v14.js'])await new Promise((resolve,reject)=>{
  const s=document.createElement('script'),error=e=>{window.removeEventListener('error',error);reject(e.error||Error(e.message));};
  window.addEventListener('error',error);s.src=file+'?v=__VERSION__';s.onload=()=>{window.removeEventListener('error',error);resolve();};s.onerror=()=>{window.removeEventListener('error',error);reject(Error('Could not load '+file));};document.body.append(s);
 });
 window.nativeReady=true;if(!render)window.setupNative();
 if(!render){const recovery=await native.workspaceRecovery();if(recovery){
  const banner=document.createElement('div');banner.setAttribute('role','status');banner.className='vv-recovery-banner';
  const text=document.createElement('span');text.textContent='Project recovered. Invalid timeline fragments were removed; your footage and captions are preserved. The original workspace is backed up.';
  const close=document.createElement('button');close.textContent='Dismiss';close.onclick=()=>banner.remove();banner.append(text,close);document.body.append(banner);
 }}
}catch(error){
 window.nativeBootError=error?.message||String(error);window.nativeReady=false;
 window.openai={setWidgetState:()=>Promise.reject(Error('Saving paused during recovery.'))};
 window.native?.diagnostic?.(window.nativeBootError).catch(()=>{});
 const panel=document.createElement('main');panel.className='vv-startup-error';
 const title=document.createElement('h1');title.textContent='Your workspace could not open';
 const detail=document.createElement('p');detail.textContent=window.nativeBootError;
 const note=document.createElement('p');note.textContent='Nothing has been deleted. You can restore the last backup or start with an empty workspace; the damaged file is kept beside it either way.';
 const row=document.createElement('div');row.className='vv-startup-actions';
 const add=(label,fn,primary)=>{const b=document.createElement('button');b.textContent=label;if(primary)b.className='primary';b.onclick=async()=>{b.disabled=true;try{await fn();location.reload();}catch(e){detail.textContent=e.message||String(e);b.disabled=false;}};row.append(b);return b;};
 /* 0.15 (PR-05): more than "Try again" */
 const info=await window.native?.workspaceInfo?.().catch(()=>null);
 if(info?.backup)add('Restore last backup',()=>native.workspaceRestore('backup'),true);
 add('Start with an empty workspace',async()=>{if(confirm('Start with an empty workspace?\n\nThe damaged file is kept in the workspace folder.'))await native.workspaceRestore('fresh');else throw Error(window.nativeBootError);});
 add('Try again',async()=>{});
 panel.append(title,detail,note,row);document.body.replaceChildren(panel);
}
})();
