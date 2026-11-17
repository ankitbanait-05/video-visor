(()=>{
// 0.14 — "Draft with AI": the Settings section (service, key, model) and the dialog that prepares a draft
// on this Mac, shows exactly what will be sent, and only then sends it. The API key never reaches this
// window: the main process stores it and reports only "saved, ending …abcd".
if(new URLSearchParams(location.search).has('render'))return;
const $=s=>document.querySelector(s),S=()=>window.nativeShell,W=()=>S().workspace;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain=e=>String(e?.message||e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'').replace(/^Error: /,'');
const icons=()=>window.lucide?.createIcons();

// ---------------------------------------------------------------- Settings → Draft with AI
let modelLists={};
async function settings(message,isError){
 const box=$('#v14-ai');if(!box)return;
 let st;try{st=await native.aiState();}catch(e){box.innerHTML='<h2>Draft with AI</h2><p class="v-muted">'+esc(plain(e))+'</p>';return;}
 const current=st.services.find(s=>s.id===st.provider),again=(m,bad)=>settings(m,bad),fail=e=>settings(plain(e),true);
 const models=modelLists[current.id]||[],options=[...new Set([current.model,...models.map(m=>m.id)].filter(Boolean))];
 box.innerHTML='<h2>Draft with AI</h2>'
  +'<p class="v-muted">Type what you want and Video Visor builds a first cut for you to finish in the editor. It uses your own account with an AI service, so that service bills you for what you use. Video Visor sends your instruction, the clip list and the transcript. The video and audio files never leave this Mac.</p>'
  +'<div class="v14-services" role="radiogroup" aria-label="AI service">'+st.services.map(s=>'<label class="v14-service'+(s.ready?'':' off')+'"><input type="radio" name="v14-service" value="'+s.id+'" '+(s.id===st.provider?'checked':'')+' '+(s.ready?'':'disabled')+'><span><strong>'+esc(s.name)+'</strong><small>'+(s.ready?(s.saved?'Key saved · ends …'+esc(s.hint):'No key yet'):'Not available in this build')+'</small></span></label>').join('')+'</div>'
  +(message?'<p class="v13-message'+(isError?' v14-bad':'')+'" role="status">'+esc(message)+'</p>':'')
  +(!current.ready?'':current.saved
    ?'<p class="v14-key">'+(current.kept==='organisation'?'Your organisation provides the '+esc(current.company)+' key':current.kept==='keychain'?'Your '+esc(current.company)+' key is saved in '+(window.native?.platform==='win32'?'Windows (encrypted with your account)':'the macOS keychain'):'Your '+esc(current.company)+' key is kept until you quit Video Visor')+', ending <code>…'+esc(current.hint)+'</code>.</p><div class="v-row"><button class="v-button" id="v14-check">Check key and load models</button><button class="v-button quiet v10-danger" id="v14-remove">Remove key</button></div>'
     +'<label class="v14-model">Model<select class="v-select" id="v14-model">'+(options.length?options.map(m=>'<option '+(m===current.model?'selected':'')+'>'+esc(m)+'</option>').join(''):'<option value="">Press “Check key and load models”</option>')+'</select></label>'
    :'<label class="v14-keyfield">'+esc(current.company)+' API key<input class="v-input" id="v14-key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your key"></label><p class="v-small v-muted">Create one at '+esc(current.keyPage)+'. '+(st.keychain?'':(window.native?.platform==='win32'?'Windows encryption is not available':'The macOS keychain is not available')+', so the key will be kept only until you quit.')+'</p>'+(st.keychain?'<label class="v13-perm"><input type="checkbox" id="v14-remember" checked><span><strong>Remember on this Mac</strong><small>Stored encrypted with '+(window.native?.platform==='win32'?'your Windows account':'the macOS keychain')+'. Untick to keep it only until you quit.</small></span></label>':'')+'<div class="v-row"><button class="v-button primary" id="v14-save">Save key</button></div>');
 box.querySelectorAll('[name="v14-service"]').forEach(r=>r.onchange=()=>native.aiChoose(r.value).then(()=>again()).catch(fail));
 const on=(id,fn)=>{const n=$('#'+id);if(n)n.onclick=fn;};
 on('v14-save',()=>{const key=$('#v14-key').value;native.aiSaveKey(current.id,key,$('#v14-remember')?$('#v14-remember').checked:false).then(r=>again(r.kept==='keychain'?'Key saved in '+(window.native?.platform==='win32'?'Windows (encrypted with your account)':'the macOS keychain')+'.':'Key kept until you quit Video Visor.')).catch(fail);});
 on('v14-remove',()=>native.aiClearKey(current.id).then(()=>{delete modelLists[current.id];again('Key removed from this Mac.');}).catch(fail));
 on('v14-check',()=>{const b=$('#v14-check');b.disabled=true;b.textContent='Checking…';native.aiModels(current.id).then(list=>{modelLists[current.id]=list;const keep=list.some(m=>m.id===current.model)||!list.length;return (keep?Promise.resolve():native.aiSetModel(current.id,list[0].id)).then(()=>again('The key works. '+list.length+' model'+(list.length===1?'':'s')+' available.'));}).catch(fail);});
 const model=$('#v14-model');if(model)model.onchange=()=>{if(model.value)native.aiSetModel(current.id,model.value).then(()=>again('Model saved.')).catch(fail);};
}
window.aiSettingsV14=settings;

// ---------------------------------------------------------------- the dialog
const dialog={
 pick:null,steps:[],running:null,
 async open(){
  let st;try{st=await native.aiState();}catch(e){return S().notify(plain(e));}
  const service=st.services.find(s=>s.id===st.provider);
  if(!service.ready||!service.saved||!service.model){
   S().modal('Draft with AI','<p>To use this, add your own API key for an AI service once. Video Visor then builds first cuts from a typed instruction.</p><p class="v-muted">'+(!service.ready?esc(service.name)+' is not available in this build.':!service.saved?'No API key is saved yet.':'No model is chosen yet.')+'</p><div class="v-row"><button class="v-button primary" id="v14-go-settings">Open Settings</button><button class="v-button" id="v14-close">Not now</button></div>');
   $('#v14-go-settings').onclick=()=>{S().closeModal();S().route('settings');setTimeout(()=>$('#v14-ai')?.scrollIntoView({block:'start'}),200);};$('#v14-close').onclick=()=>S().closeModal();return;
  }
  dialog.pick=null;const projects=W().list().filter(p=>p.state?.clips?.some(c=>c.asset!=='blank'));
  S().modal('Draft with AI','<label class="v14-prompt">What should the draft be?<textarea id="v14-prompt" rows="4" maxlength="4000" placeholder="For example: Make a tight version of this walkthrough. Cut the pauses and the false start at the beginning, add a title with the topic, and turn on captions."></textarea></label>'
   +'<div class="v14-source"><strong>Footage</strong><div class="v-row"><button class="v-button" id="v14-pick">Choose clips…</button>'+(projects.length?'<span class="v-muted">or start from</span><select class="v-select" id="v14-project"><option value="">a project…</option>'+projects.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')+'</select>':'')+'</div><p class="v-small v-muted" id="v14-picked">Nothing chosen yet. Starting from a project works on a copy; the original is not changed.</p></div>'
   +'<label class="v13-perm"><input type="checkbox" id="v14-frames"><span><strong>Let it look at single frames</strong><small>Off: only text is sent. On: it may also ask for still pictures from the video, which are then sent too.</small></span></label>'
   +'<p class="v-small v-muted">Using '+esc(service.name)+' · '+esc(service.model)+'. Nothing is sent until you have seen it on the next screen.</p><p id="v14-error" role="alert" hidden></p>'
   +'<div class="v-row"><button class="v-button primary" id="v14-prepare">Prepare the draft</button><button class="v-button" id="v14-close">Cancel</button></div>');
  const error=m=>{const n=$('#v14-error');n.textContent=m;n.hidden=!m;};
  $('#v14-close').onclick=()=>S().closeModal();
  $('#v14-pick').onclick=()=>native.aiPick().then(r=>{if(!r)return;dialog.pick=r;if($('#v14-project'))$('#v14-project').value='';$('#v14-picked').textContent=r.files.map(f=>f.name).join(', ')+(r.problems.length?' · Skipped: '+r.problems.join(' '):'');error('');}).catch(e=>error(plain(e)));
  if($('#v14-project'))$('#v14-project').onchange=e=>{if(e.target.value){dialog.pick=null;$('#v14-picked').textContent='A copy of “'+e.target.selectedOptions[0].textContent+'” will be edited.';}};
  $('#v14-prepare').onclick=async()=>{
   const prompt=$('#v14-prompt').value,projectId=$('#v14-project')?.value||'',allowFrames=$('#v14-frames').checked;
   if(prompt.trim().length<3)return error('Say what the draft should be, in a sentence or two.');
   if(!dialog.pick&&!projectId)return error('Choose clips, or a project to start from.');
   const name=(dialog.pick?dialog.pick.files[0].name.replace(/\.[^.]+$/,''):W().get(projectId)?.name||'Video')+' · AI draft';
   if(projectId&&W().active()===projectId)W().save();
   S().modal('Preparing on this Mac','<p>Making the draft and transcribing the speech. Nothing has been sent anywhere.</p><progress style="width:100%"></progress><p class="v-small v-muted">This takes roughly a tenth of the length of the footage.</p>');
   try{dialog.review(await native.aiPrepare({prompt,name:name.slice(0,60),allowFrames,...(dialog.pick?{pickId:dialog.pick.pickId}:{projectId})}));}
   catch(e){S().modal('The draft could not be prepared','<p>'+esc(plain(e))+'</p><div class="v-row"><button class="v-button" id="v14-close">Close</button></div>');$('#v14-close').onclick=()=>S().closeModal();}
  };
 },
 // Step 2: everything that is about to leave the Mac, in full, before it leaves.
 review(p){
  S().modal('Review what will be sent','<p>This text goes to <strong>'+esc(p.provider)+'</strong> ('+esc(p.model)+') when you press Send. Its size is about '+p.approximateTokens.toLocaleString()+' tokens; '+esc(p.provider)+' bills your account for it and for the replies.</p>'
   +'<pre class="v13-code v14-outgoing" id="v14-outgoing" tabindex="0">'+esc(p.text)+'</pre>'
   +'<ul class="v14-facts"><li><strong>Sent now:</strong> your instruction, the list of '+p.clips+' clip'+(p.clips===1?'':'s')+' with names and lengths, and '+(p.transcriptLines?'the transcript ('+p.transcriptLines+' line'+(p.transcriptLines===1?'':'s')+')':'a note that no speech was found')+'.</li><li><strong>Sent while it works:</strong> the result of each edit it makes (the same kind of clip list, titles and transcript, with new times)'+(p.frames?', and any single frames it asks to see':'')+'.</li><li><strong>Never sent:</strong> the video and audio files'+(p.frames?'':', or any picture from them')+', other projects, or your API key to anyone but '+esc(p.provider)+'.</li></ul>'
   +'<div class="v-row"><button class="v-button primary" id="v14-send">Send and build the draft</button><button class="v-button" id="v14-discard">Don’t send</button></div>');
  dialog.pending=p.projectId;
  $('#v14-discard').onclick=()=>{dialog.pending=null;native.aiDiscard(p.projectId).finally(()=>{S().closeModal();S().notify('Nothing was sent. The prepared draft was removed.');});};
  $('#v14-send').onclick=()=>{dialog.pending=null;dialog.run(p);};
 },
 async run(p){
  dialog.steps=[];dialog.running=p.projectId;
  S().modal('Building the draft','<p class="v-muted">'+esc(p.provider)+' is working through your instruction. You can stop at any time; edits already made stay in the draft.</p><ol class="v14-steps" id="v14-steps" aria-live="polite"><li class="pending">Waiting for the first reply…</li></ol><div class="v-row"><button class="v-button" id="v14-stop">Stop</button></div>');
  $('#v14-stop').onclick=()=>{$('#v14-stop').disabled=true;$('#v14-stop').textContent='Stopping…';native.aiCancel();};
  let result,problem;try{result=await native.aiRun(p.projectId);}catch(e){problem=plain(e);}
  dialog.running=null;if(result?.steps)dialog.steps=result.steps;const id=result?.projectId||p.projectId;
  /* 0.15 (DS-05): a run that changed nothing leaves no empty draft behind */
  const exists=!!W().get(id),removed=!!result?.removed||!exists;
  const list=dialog.steps.length?'<details class="v14-log"><summary>'+dialog.steps.length+' step'+(dialog.steps.length===1?'':'s')+'</summary><ol class="v14-steps">'+dialog.steps.map(dialog.item).join('')+'</ol></details>':'';
  S().modal(problem?'The draft was not finished':result.stopped==='done'?'Your draft is ready':'The draft was stopped','<p class="v14-summary">'+esc(problem||result.summary||'The draft was changed as asked.')+'</p>'+(problem&&dialog.steps.some(s=>s.ok)?'<p class="v-muted">The edits made before the problem are in the draft.</p>':'')+list
   +(removed?'<p class="v-small v-muted">Nothing was changed, so the empty draft was removed.</p>':'')+'<p class="v-small v-muted"'+(removed?' hidden':'')+'>The draft is under Projects, tagged AI draft. “Undo AI edit” there takes back its last change.'+(result?.usage?.input?' This session used about '+(result.usage.input+result.usage.output).toLocaleString()+' tokens.':'')+'</p>'
   +'<div class="v-row">'+(exists?'<button class="v-button primary" id="v14-open">Open the draft</button>':'')+'<button class="v-button" id="v14-close">Close</button></div>');
  if($('#v14-open'))$('#v14-open').onclick=()=>{S().closeModal();W().open(id);};$('#v14-close').onclick=()=>S().closeModal();
 },
 item:s=>'<li class="'+(s.ok?'ok':'bad')+'">'+esc(s.label)+(s.ok?'':' <small>could not be done: '+esc(s.problem||'')+'</small>')+'</li>'
};
native.onAiStep(step=>{if(step.projectId!==dialog.running)return;dialog.steps.push(step);const list=$('#v14-steps');if(list){list.innerHTML=dialog.steps.map(dialog.item).join('')+'<li class="pending">Working…</li>';list.scrollTop=list.scrollHeight;}});
// 0.15 (DS-05): closing the review dialog any other way removes the prepared draft; closing "Building the draft" stops it.
new MutationObserver(()=>{const o=document.getElementById('v-overlay');if(!o||!o.hidden)return;if(dialog.running){native.aiCancel().catch(()=>{});}else if(dialog.pending){const id=dialog.pending;dialog.pending=null;native.aiDiscard(id).catch(()=>{});S().notify('Nothing was sent. The prepared draft was removed.');}}).observe(document.getElementById('v-overlay')||document.body,{attributes:true,attributeFilter:['hidden']});
window.draftWithAiV14=dialog;
// Entry points: the Projects page button and the Home card.
document.addEventListener('click',e=>{if(e.target.closest('[data-v14="draft"],[data-flow="start-ai"]'))dialog.open();});
})();
