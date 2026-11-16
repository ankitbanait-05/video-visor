(()=>{
// 0.13 — the command layer inside the app window, the render queue, and the "Connect an AI assistant" settings.
// Commands arrive from the connector (main process) as window.visorCommands.run(name, args). They work on any
// project without opening the editor, through nativeShell.workspace and the pure model in engines/draft-v13.js.
// The hidden window that draws export frames loads the same scripts but has no app services: nothing here applies to it.
if(new URLSearchParams(location.search).has('render'))return;
const $=s=>document.querySelector(s),E=()=>window.visorEditor,S=()=>window.nativeShell,W=()=>S().workspace,D=window.draftModelV13;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain=e=>String(e?.message||e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'').replace(/^Error: /,'');
const icons=()=>window.lucide?.createIcons();

// ---------------------------------------------------------------- projects
function project(id){const p=W().get(id);if(!p)D.fail(`There is no project with id "${id}". Use list_projects to see the ids.`);return p;}
const stateOf=p=>p.state?.clips?p.state:D.blank(E().blank());
// Rule for every change an assistant makes: its own drafts are edited in place (the previous state is kept
// so the edit can be undone from Projects); the person's own projects are never changed, the result goes
// to a copy. The change is worked out first, so a refused request leaves nothing behind.
function edit(id,label,change){
 const source=project(id),{state,info}=D.apply(stateOf(source),change);let target=source.id,note;
 if(source.ai)W().update(source.id,state,label);
 else{target=W().create({name:(source.name+' (AI draft)').slice(0,80),state,ai:true,from:source.id});note=`"${source.name}" is the person's own project, so it was left as it is. The change was made on a copy tagged AI draft: use project_id "${target}" from now on.`;}
 return{project_id:target,...(note?{note}:{}),...info,duration:Math.round(D.duration(state)*100)/100};
}
// Speech recognition results are kept per media file for this session, so reading a transcript never has
// to change a project that is not the assistant's own.
const heard=new Map();
function linesFor(state){if(state.transcript?.length)return state.transcript;const out=[];for(const a of state.assets||[])if(heard.has(a.id))out.push(...heard.get(a.id));return out;}
async function transcribe(state){
 const assets=(state.assets||[]).filter(a=>a.hasAudio&&state.clips.some(c=>c.asset===a.id));
 if(!assets.length)D.fail('There is no speech to transcribe: nothing on the timeline has sound.');
 const lines=[];for(const a of assets){if(!heard.has(a.id))heard.set(a.id,await native.transcribe(a.id,state.captionLanguage||{}));lines.push(...heard.get(a.id));}
 if(!lines.length)D.fail('No speech was found in this video.');return lines;
}
const lucideHas=name=>{const set=window.lucide?.icons;if(!set)return D.ICONS.includes(name);return !!set[name.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join('')]||D.ICONS.includes(name);};
let library=null;const tracks=async()=>library||(library=await native.library());

const commands={
 list_projects(){return{projects:W().list().map(p=>{const s=stateOf(p);return{project_id:p.id,name:p.name,ai_draft:p.ai,duration:Math.round(D.duration(s)*100)/100,canvas:D.shapeName(s.ratio),clips:s.clips.filter(c=>c.asset!=='blank').length,...(p.updated?{edited:new Date(p.updated).toISOString()}:{}),...(p.active?{open_in_editor:true}:{})};})};},
 get_project(a){const p=project(a.project_id);return D.summary(stateOf(p),p);},
 _state(a){const p=project(a.project_id),s=stateOf(p);if(!s.clips.some(c=>c.asset!=='blank'))D.fail('This project has no footage yet.');if(a.time>D.duration(s)+.05)D.fail(`The video is only ${Math.round(D.duration(s)*100)/100} s long.`);return{state:{...s,transcript:linesFor(s)},name:p.name,speed:Number(s.speed)||1};},
 async get_transcript(a){
  let p=project(a.project_id),s=stateOf(p),note;
  if(!linesFor(s).length){
   if(!a.generate)return{duration:Math.round(D.duration(s)*100)/100,lines:[],note:'This project has no transcript yet. Call get_transcript again with generate: true to transcribe it on this Mac.'};
   const lines=await transcribe(s);
   // The assistant's own draft keeps the transcript (captions can then be switched on at once).
   if(p.ai&&!s.transcript?.length){W().update(p.id,D.apply(s,x=>{x.transcript=lines;}).state,'Transcript added');p=project(p.id);s=stateOf(p);}
  }
  const lines=D.transcript({...s,transcript:linesFor(s)});
  return{duration:Math.round(D.duration(s)*100)/100,lines,...(lines.length?{}:{note:'No speech falls inside the parts of the footage that are on the timeline.'})};
 },
 async list_presets(){const list=await tracks().catch(()=>[]);return D.presets(list.map(t=>({name:t.name,mood:t.mood,bpm:t.bpm,seconds:Math.round(t.duration||0)})));},
 create_draft(a){
  const prefs=S().settings()||{},{state,info}=D.create(E().blank(),a.assets,{canvas:a.canvas,preferredRatio:prefs.canvas});
  if(['en','hi'].includes(prefs.captionLanguage))state.captionLanguage={language:prefs.captionLanguage,script:'original'};
  const id=W().create({name:a.name,state,ai:true});
  return{project_id:id,...info,...D.summary(state,{id,name:a.name,ai:true}),note:'The draft is in Video Visor under Projects, tagged AI draft. The person can open it there and keep editing.'};
 },
 // A draft prepared for "Draft with AI" that the person decided not to send.
 _discard(a){const p=project(a.project_id);if(!p.ai)D.fail('Only AI drafts can be discarded this way.');return{removed:W().remove(p.id)};},
 duplicate_project(a){const p=project(a.project_id),name=(a.name||p.name+' copy').slice(0,80),id=W().create({name,state:D.clone(stateOf(p)),ai:true,from:p.id});return{project_id:id,name};},
 import_media(a){return edit(a.project_id,'Media added',s=>D.addMedia(s,a.assets,a.add_to_timeline!==false));},
 remove_ranges(a){return edit(a.project_id,'Parts cut out',s=>D.removeRanges(s,a.ranges));},
 async remove_pauses(a){
  const p=project(a.project_id),s=stateOf(p),assets=(s.assets||[]).filter(x=>x.hasAudio&&s.clips.some(c=>c.asset===x.id));
  if(!assets.length)D.fail('Nothing on the timeline has sound, so there are no pauses to find.');
  const silences=[];for(const x of assets)for(const r of await native.silences(x.id))silences.push({...r,asset:x.id});
  const ranges=D.pauses(s,silences,{min:a.min_pause,keep:a.keep});
  if(!ranges.length)return{project_id:p.id,pauses_removed:0,note:'No pauses that long were found.',duration:Math.round(D.duration(s)*100)/100};
  return{...edit(a.project_id,'Pauses removed',x=>D.removeRanges(x,ranges)),pauses_removed:ranges.length};
 },
 reorder_clips(a){return edit(a.project_id,'Clips reordered',s=>D.reorder(s,a.order));},
 add_title(a){return edit(a.project_id,'Title added',s=>D.addTitle(s,a));},
 add_icon(a){return edit(a.project_id,'Icon added',s=>D.addIcon(s,a,lucideHas));},
 remove_element(a){return edit(a.project_id,'Title removed',s=>D.removeElement(s,a.element_id));},
 async set_captions(a){
  const p=project(a.project_id),s=stateOf(p);let lines=null;
  if(a.enabled&&!s.transcript?.length)lines=await transcribe(s);
  return edit(a.project_id,a.enabled?'Captions turned on':'Captions turned off',x=>{if(lines)x.transcript=lines;return D.setCaptions(x,a);});
 },
 async set_music(a){
  if(a.track===null)return edit(a.project_id,'Music removed',s=>D.setMusic(s,null));
  const list=await tracks(),wanted=a.track.trim().toLowerCase(),track=list.find(t=>t.name.toLowerCase()===wanted)||list.find(t=>t.name.toLowerCase().includes(wanted));
  if(!track)D.fail(`There is no track called "${a.track}". Tracks: ${list.map(t=>t.name).join(', ')}.`);
  return edit(a.project_id,'Music added',s=>D.setMusic(s,track,a.volume));
 },
 set_canvas(a){return edit(a.project_id,'Frame shape changed',s=>D.setCanvas(s,a.shape,a.fit));},
 add_camera(a){return edit(a.project_id,'Camera circle added',s=>D.addCamera(s,a.asset,{shape:a.shape,corner:a.corner}));},
 render(a){const jobs=queue.add(a.project_id,a);return{jobs:jobs.map(queue.report),folder:queue.folder,note:'Rendering runs in the background in Video Visor. Use render_status to follow it.'};},
 render_status(a){if(a.job_id){const job=queue.jobs.find(j=>j.id===a.job_id);if(!job)D.fail(`There is no render with id "${a.job_id}".`);return queue.report(job);}return{jobs:queue.jobs.map(queue.report)};},
 cancel_render(a){const job=queue.jobs.find(j=>j.id===a.job_id);if(!job)D.fail(`There is no render with id "${a.job_id}".`);if(!['waiting','rendering'].includes(job.status))D.fail('That render already finished ('+job.status+').');queue.cancel(job.id);return queue.report(job);}
};
// Never rejects: the main process reads {ok, result} or {ok:false, error}.
window.visorCommands={run:async(name,args={})=>{try{if(!Object.hasOwn(commands,name))throw Error('Unknown command: '+name);return{ok:true,result:await commands[name](args)};}catch(e){return{ok:false,error:plain(e)};}},names:()=>Object.keys(commands).filter(n=>n[0]!=='_')};

// ---------------------------------------------------------------- render queue
// One render at a time, in the background. A job holds its own copy of the project as it was when queued.
const queue={
 jobs:[],running:null,folder:'',count:0,
 report:j=>({job_id:j.id,project:j.name,shape:j.shape,format:j.format,resolution:j.resolution,status:j.status,...(j.status==='rendering'?{percent:j.progress}:{}),...(j.path?{file:j.path}:{}),...(j.error?{problem:j.error}:{}),...(j.note&&j.status==='waiting'?{note:j.note}:{})}),
 add(projectId,options={}){
  const p=project(projectId),s=stateOf(p);
  if(!s.clips.some(c=>(s.assets||[]).some(a=>a.id===c.asset&&a.url)))D.fail('This project has no footage to render.');
  const own=D.shapeName(s.ratio),shapes=options.shapes?.length?options.shapes:[own],format=options.format||'MP4',resolution=options.resolution||'1080p';
  if(queue.jobs.filter(j=>['waiting','rendering'].includes(j.status)).length+shapes.length>30)D.fail('The render queue is full (30 videos). Wait for some to finish.');
  const added=shapes.map(shape=>{
   // The project's own shape is rendered exactly as it is; another shape is the same edit in a new frame.
   const state=shape===own?D.clone({...s,transcript:linesFor(s)}):D.apply({...s,transcript:linesFor(s)},x=>D.setCanvas(x,shape)).state;
   return{id:'r'+(++queue.count)+Date.now().toString(36),projectId:p.id,name:p.name,shape,format,resolution,status:'waiting',progress:0,state,added:Date.now()};
  });
  queue.jobs.push(...added);queue.draw();queue.pump();return added;
 },
 cancel(id){const job=queue.jobs.find(j=>j.id===id);if(!job)return;if(job.status==='waiting'){job.status='cancelled';delete job.state;}else if(job.status==='rendering'){job.cancelling=true;(native.cancelQueued?native.cancelQueued():native.cancel()).catch(()=>{});}queue.draw();},
 clear(){queue.jobs=queue.jobs.filter(j=>['waiting','rendering'].includes(j.status));queue.draw();},
 async pump(){
  if(queue.running)return;const job=queue.jobs.find(j=>j.status==='waiting');if(!job)return;
  queue.running=job;job.status='rendering';job.progress=0;job.note='';queue.draw();
  const s=job.state,cfg={format:job.format,resolution:job.resolution==='4K'?'4K UHD':job.resolution,fps:window.exportFpsV15?window.exportFpsV15(s,'Automatic'):30,captions:'Burn into video'};
  let retry=false;
  try{
   const result=await native.exportQueued(s,cfg,job.name+' '+job.shape.replace(':','x'));
   if(!result?.path)throw Error('The render did not produce a file.');
   job.status='done';job.path=result.path;job.progress=100;delete job.state;S().addJob('Video export · '+job.format+' · '+job.shape,result.path);
  }catch(e){
   const message=plain(e);
   if(job.cancelling||/cancel/i.test(message)){job.status='cancelled';delete job.state;}
   // Another task (a transcription, an export started by hand) holds the engine: wait and try again.
   else if(/A task is already running/.test(message)){job.status='waiting';job.note='Waiting for another task to finish';retry=true;}
   else{job.status='failed';job.error=message;delete job.state;}
  }finally{queue.running=null;queue.draw();if(S().workspace.route()==='projects'&&job.status==='done')S().route('projects');}
  if(retry)setTimeout(()=>queue.pump(),2500);else queue.pump();
 },
 // The section on the Projects page, and a small chip visible everywhere while something is rendering.
 draw(){
  const open=queue.jobs.filter(j=>['waiting','rendering'].includes(j.status)),box=$('#v13-queue');
  if(box){
   const label={waiting:'Waiting',rendering:'Rendering',done:'Done',failed:'Failed',cancelled:'Cancelled'};
   box.innerHTML=queue.jobs.length?'<div class="v-sectionhead"><h2>Render queue</h2>'+(queue.jobs.some(j=>!['waiting','rendering'].includes(j.status))?'<button class="v-button quiet" id="v13-queue-clear">Clear finished</button>':'')+'</div>'+queue.jobs.map(j=>'<div class="v-rowitem v13-job" data-job="'+j.id+'" data-status="'+j.status+'"><div class="v-grow"><strong>'+esc(j.name)+' · '+j.shape+'</strong><span class="v-small v-muted">'+j.format+' · '+j.resolution+' · '+(j.status==='rendering'?'Rendering · '+j.progress+'%':j.status==='failed'?'Failed: '+esc(j.error||''):j.status==='waiting'&&j.note?esc(j.note):j.status==='done'?esc(vvPath.base(j.path))/* 0.15 (Win-fix 4) */:label[j.status])+'</span>'+(j.status==='rendering'?'<progress max="100" value="'+j.progress+'"></progress>':'')+'</div>'+(j.status==='done'?'<button class="v-button quiet" data-v13-open="'+j.id+'">Open</button><button class="v-button quiet" data-v13-reveal="'+j.id+'">'+esc(vvPath.revealLabel())+'</button>':['waiting','rendering'].includes(j.status)?'<button class="v-button quiet" data-v13-cancel="'+j.id+'">Cancel</button>':'<span class="v-pill">'+label[j.status]+'</span>')+'</div>').join(''):'';
   box.querySelectorAll('[data-v13-cancel]').forEach(b=>b.onclick=()=>queue.cancel(b.dataset.v13Cancel));
   const file=id=>queue.jobs.find(j=>j.id===id)?.path,fail=e=>S().notify(plain(e));
   box.querySelectorAll('[data-v13-open]').forEach(b=>b.onclick=()=>native.openFile(file(b.dataset.v13Open)).catch(fail));
   box.querySelectorAll('[data-v13-reveal]').forEach(b=>b.onclick=()=>native.reveal(file(b.dataset.v13Reveal)).catch(fail));
   const clear=$('#v13-queue-clear');if(clear)clear.onclick=()=>queue.clear();
  }
  let chip=$('#v13-queue-chip');
  if(!open.length){chip?.remove();return;}
  if(!chip){chip=document.createElement('button');chip.id='v13-queue-chip';chip.type='button';chip.title='Open the render queue';chip.onclick=()=>S().route('projects');document.body.append(chip);}
  const now=queue.running,done=queue.jobs.filter(j=>j.status==='done').length;
  chip.textContent=now?'Rendering '+(done+1)+' of '+(done+open.length)+' · '+now.progress+'%':open.length+' waiting to render';
 },
 // Q2: one project, several frame shapes, one dialog.
 dialog(projectId){
  const p=W().get(projectId);if(!p)return;const s=stateOf(p),own=D.shapeName(s.ratio),names={'16:9':'Presentation','9:16':'Vertical','1:1':'Square','4:5':'Portrait'};
  if(!s.clips.some(c=>(s.assets||[]).some(a=>a.id===c.asset&&a.url)))return S().notify('Add footage to this project before rendering.');
  const shapes=[...new Set([own,...Object.keys(D.SHAPES)])];
  S().modal('Render “'+esc(p.name)+'”','<p class="v-muted">Pick one or more frame shapes. Each becomes its own video, rendered one after another in the background while you keep working.</p><div class="v13-shapes" role="group" aria-label="Frame shapes">'+shapes.map(k=>'<label class="v13-shape"><input type="checkbox" value="'+k+'" '+(k===own?'checked':'')+'><span class="v13-shape-box" style="aspect-ratio:'+(D.SHAPES[k]||s.ratio)+'"></span><strong>'+k+'</strong><small>'+(k===own?'This project':names[k]||'')+'</small></label>').join('')+'</div><div class="v12-form"><label class="v12-field">Format<select class="v-select" id="v13-format"><option>MP4</option><option>MOV</option></select></label><label class="v12-field">Resolution<select class="v-select" id="v13-resolution"><option>720p</option><option selected>1080p</option><option>4K</option></select></label></div><p class="v-small v-muted">Saved to <code>'+esc(queue.folder||'your export folder')+'</code>. Other shapes use the same edit in a new frame; check titles and the camera circle in the result.</p><p id="v13-render-error" role="alert" hidden></p><div class="v-row"><button class="v-button primary" id="v13-render-add">Add to render queue</button><button class="v-button" id="v13-render-cancel">Cancel</button></div>');
  $('#v13-render-cancel').onclick=()=>S().closeModal();
  $('#v13-render-add').onclick=()=>{
   const picked=[...document.querySelectorAll('.v13-shape input:checked')].map(i=>i.value),error=$('#v13-render-error');
   if(!picked.length){error.textContent='Pick at least one frame shape.';error.hidden=false;return;}
   try{if(W().active()===projectId)W().save();const added=queue.add(projectId,{shapes:picked,format:$('#v13-format').value,resolution:$('#v13-resolution').value});S().closeModal();S().notify(added.length+' render'+(added.length===1?'':'s')+' added to the queue. Progress is under Projects.');}
   catch(e){error.textContent=plain(e);error.hidden=false;}
  };
 }
};
window.renderQueueV13=queue;
native.onProgress(p=>{const job=queue.running;if(!job||p?.source!=='queue')return;const n=Math.max(0,Math.min(100,Math.round(p?.percent||0)));if(n!==job.progress){job.progress=n;queue.draw();}});
// The Export dialog in the editor offers the queue as well.
new MutationObserver(()=>{const body=$('#v-dialog-body');if(!body||!body.querySelector('#v-export-format')||body.querySelector('#v13-export-queue'))return;const b=document.createElement('button');b.id='v13-export-queue';b.type='button';b.className='v-button v-full v15-shapes-button';b.innerHTML='<span class="v15-mini-shapes" aria-hidden="true"><i style="aspect-ratio:9/16"></i><i style="aspect-ratio:1"></i><i style="aspect-ratio:4/5"></i></span>Also make vertical, square or portrait versions…';b.onclick=()=>{const id=W().active();if(!id)return S().notify('Save this video as a project first.');S().closeModal();queue.dialog(id);};body.append(b);}).observe($('#v-dialog-body')||document.body,{childList:true,subtree:true});

// ---------------------------------------------------------------- settings: Connect an AI assistant
const groups=[['read','See projects, transcripts and frames','The assistant can read what is in your projects and look at single frames.'],['edit','Create and edit drafts','New work is tagged AI draft. Your own projects are never changed: the assistant works on a copy.'],['render','Render videos','Finished videos are saved to your export folder.']];
async function connectorSettings(message){
 const box=$('#v13-connector');if(!box)return;
 let st;try{st=await native.connectorState();}catch(e){box.innerHTML='<h2>Connect an AI assistant</h2><p class="v-muted">'+esc(plain(e))+'</p>';return;}
 queue.folder=st.exportFolder||queue.folder;
 const fail=e=>connectorSettings(plain(e)),update=change=>native.connectorUpdate(change).then(()=>connectorSettings()).catch(fail);
 const time=t=>new Date(t).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
 box.innerHTML='<h2>Connect an AI assistant</h2>'
  +'<p class="v-muted">Let an assistant such as Claude build a first draft in Video Visor from a prompt, which you then finish in the editor. It works from the transcript and single frames; it cannot watch the video. Nothing leaves this Mac through Video Visor: the assistant app decides what it sends to its own service.</p>'
  +'<label class="v13-switch"><input type="checkbox" id="v13-on" '+(st.enabled?'checked':'')+'><span><strong>'+(st.enabled?'On':'Off')+'</strong> · '+(st.enabled?(st.running?'reachable from apps on this Mac only':esc(st.problem||'starting…')):'no app can reach Video Visor')+'</span></label>'
  +(message?'<p class="v13-message" role="status">'+esc(message)+'</p>':'')
  +'<div class="v13-connector-body"'+(st.enabled?'':' hidden')+'>'
  +'<h3>What the assistant may do</h3>'+groups.map(([k,title,help])=>'<label class="v13-perm"><input type="checkbox" data-v13-perm="'+k+'" '+(st.permissions[k]?'checked':'')+'><span><strong>'+title+'</strong><small>'+help+'</small></span></label>').join('')
  +'<h3>Folders it may import from</h3><p class="v-small v-muted">The assistant can only use media inside these folders.</p>'+(st.folders.length?st.folders.map(f=>'<div class="v-row v10-folder"><code>'+esc(f)+'</code><button class="v-button quiet" data-v13-remove="'+esc(f)+'">Remove</button></div>').join(''):'<p class="v-small v-muted">No folder yet. Without one the assistant cannot bring in any media.</p>')+'<div class="v-row"><button class="v-button" id="v13-add-folder">Add folder…</button></div>'
  +'<h3>Set up Claude Desktop</h3><p class="v-small v-muted">Adds Video Visor to Claude Desktop’s connectors. Quit and reopen Claude afterwards; Video Visor must be open when you use it. Set it up again if you move the Video Visor app.</p><div class="v-row"><button class="v-button primary" id="v13-claude">Add to Claude Desktop</button><button class="v-button quiet" id="v13-manual">Show manual setup</button></div>'+(st.setup.claudeFound?'':'<p class="v-small v-muted">Claude Desktop was not found on this Mac. You can still add the entry now; it is used once Claude Desktop is installed.</p>')
  +'<div id="v13-manual-box" hidden><p class="v-small v-muted">For Claude Desktop, put this in <code>'+esc(st.setup.configFile)+'</code>:</p><pre class="v13-code" id="v13-config">'+esc(st.setup.config)+'</pre><div class="v-row"><button class="v-button quiet" data-v13-copy="v13-config">Copy</button></div><p class="v-small v-muted">For an app that connects to a local address (MCP over HTTP), use this address and send the access key as a Bearer token:</p><pre class="v13-code" id="v13-url">'+esc(st.url||'Switch the connector on to see the address')+'</pre><pre class="v13-code" id="v13-token">'+esc(st.token)+'</pre><div class="v-row"><button class="v-button quiet" data-v13-copy="v13-url">Copy address</button><button class="v-button quiet" data-v13-copy="v13-token">Copy access key</button><button class="v-button quiet v10-danger" id="v13-new-key">New access key</button></div></div>'
  +'<h3>Recent activity</h3>'+(st.recent.length?'<ul class="v13-activity">'+st.recent.map(r=>'<li><span>'+time(r.at)+'</span><code>'+esc(r.tool)+'</code><span class="'+(r.ok?'ok':'bad')+'">'+(r.ok?'done':'refused'+(r.error?': '+esc(r.error):''))+'</span></li>').join('')+'</ul>':'<p class="v-small v-muted">Nothing yet. Requests from the assistant are listed here.</p>')
  +'</div>';
 $('#v13-on').onchange=e=>update({enabled:e.target.checked});
 box.querySelectorAll('[data-v13-perm]').forEach(i=>i.onchange=()=>update({permissions:{[i.dataset.v13Perm]:i.checked}}));
 box.querySelectorAll('[data-v13-remove]').forEach(b=>b.onclick=()=>native.connectorRemoveFolder(b.dataset.v13Remove).then(()=>connectorSettings()).catch(fail));
 box.querySelectorAll('[data-v13-copy]').forEach(b=>b.onclick=()=>navigator.clipboard.writeText($('#'+b.dataset.v13Copy).textContent).then(()=>S().notify('Copied.')).catch(()=>S().notify('Could not copy. Select the text and copy it by hand.')));
 const on=(id,fn)=>{const n=$('#'+id);if(n)n.onclick=fn;};
 on('v13-add-folder',()=>native.connectorAddFolder().then(()=>connectorSettings()).catch(fail));
 on('v13-manual',()=>{const m=$('#v13-manual-box');m.hidden=!m.hidden;});
 on('v13-new-key',()=>update({newToken:true}).then(()=>{const m=$('#v13-manual-box');if(m)m.hidden=false;S().notify('New access key made. Apps set up with the old key need the new one.');}));
 on('v13-claude',()=>native.connectorInstallClaude().then(r=>connectorSettings('Added to Claude Desktop. Quit Claude completely and open it again, then look for “video-visor” under its connectors.'+(r.backup?' Your previous Claude settings were saved next to the file.':''))).catch(fail));
}
window.connectorSettingsV13=connectorSettings;
// Startup: remember the export folder for the queue and tell the main process about a saved choice.
(async()=>{try{const folder=S().settings()?.exportFolder;if(folder)await native.setExportFolder(folder).catch(()=>{});queue.folder=(await native.connectorState()).exportFolder;}catch{}})();
})();
