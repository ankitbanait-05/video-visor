
// 0.9: shortcuts listen on the window so they keep working when focus is outside the editor
// (first open, or after a dialog closes). They stay off while a dialog is open, while another
// screen is showing, and while focus is on a control outside the editor.
// 0.9: "1920/1080" is shown as 16:9.
function ratioLabelV9(ratio){let [w,h]=String(ratio||'16/9').split('/').map(Number);if(!(w>0&&h>0))return '16:9';if(Number.isInteger(w)&&Number.isInteger(h)){let a=w,b=h;while(b)[a,b]=[b,a%b];w/=a;h/=a;}return w<=32&&h<=32?w+':'+h:(w/h).toFixed(2).replace(/\.?0+$/,'')+':1';}
const onKeyV9=fn=>window.addEventListener('keydown',ev=>{const r=document.getElementById('vv-editor'),o=document.getElementById('v-overlay'),t=ev.target;if(!r||!r.getClientRects().length||(o&&!o.hidden))return;if(t instanceof Element&&!r.contains(t)&&t!==document.body&&t!==document.documentElement)return;fn(ev);});
(()=>{const root=document.getElementById('vv-editor'),q=s=>root.querySelector(s),clone=o=>JSON.parse(JSON.stringify(o)),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),icon=n=>'<i data-lucide="'+n+'" aria-hidden="true"></i>',icons=()=>globalThis.lucide?.createIcons({attrs:{width:16,height:16}}),fmt=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(Math.floor(n%60)).padStart(2,'0');
const initial={clips:[{id:'blank',asset:'blank',name:'Add footage',kind:'image',start:0,end:5,limit:5}],assets:[],time:0,selected:0,panel:'media',elements:[],active:null,zoom:false,strength:1.35,captions:false,captionStyle:'highlight',captionFont:'system-ui',captionSize:18,captionPosition:'bottom',captionColour:'#1f7ae0',captionBackground:true,ratio:'16/9',speed:1,transcript:[],audio:{voice:100,system:70,music:20,noise:false,level:false},focus:{mode:'manual',x:50,y:50,start:0,end:5},style:{name:'smallcase blue',font:'system-ui',colour:'#8ac7ff',logo:'VV'},transition:'cut',camera:false};
let state=clone(initial),history=[],future=[],playing=false,last=0,raf=0,expandedCaps=false,elementCategory='titles',previewOriginal=false,previewEffect=null;
const saved=window.openai?.widgetState?.privateContent;if(saved?.prototypeVersion===3&&saved.editorState?.clips?.length)state={...clone(initial),...clone(saved.editorState)};
const total=()=>state.clips.reduce((n,c)=>n+c.end-c.start,0),notice=t=>{q('#ed-status').textContent=t;window.nativeShell?.notify(t);};
// 0.15: view settings (open tab, track view, collapsed groups, selected item) are not part of the edit.
// They are not saved with a project, not changed by Undo / Redo, and not carried into a new project.
const VIEW_KEYS=['panel','timelineView','collapsedTrackGroups','active'];
const pickView=s=>Object.fromEntries(VIEW_KEYS.map(k=>[k,s[k]]));
const withoutView=s=>{const o={...s};for(const k of VIEW_KEYS)delete o[k];return o;};
const editKey=s=>{const o=withoutView(s);delete o.time;delete o.selected;return JSON.stringify(o);};
// 0.15: an Undo step is recorded only when the edit really changed. snapshot() remembers the state before a
// possible change; commit() keeps it as an Undo step only if the edit differs (clicking into a field, or
// touching the canvas without moving anything, no longer adds an empty step that wipes Redo).
let pendingUndoV15=null;
function keepUndoV15(){if(!pendingUndoV15)return;const before=pendingUndoV15;pendingUndoV15=null;if(editKey(before)===editKey(state))return;history.push(before);if(history.length>50)history.shift();future=[];q('#ed-undo').disabled=false;q('#ed-redo').disabled=true;}
function commit(){keepUndoV15();window.dispatchEvent(new CustomEvent('vv-editor-change'));}
function snapshot(){if(!pendingUndoV15)pendingUndoV15=clone(state);}
// 0.15: tracks are settled once, after the edit (window.trackModelV8 is loaded before this file); drawing never moves items.
function settleTracksV15(){window.trackModelV8?.normalize(state);}
function transaction(fn){previewOriginal=false;previewEffect=null;stop();snapshot();const beforeStateV15=clone(state),lockIdsV15=lockedTrackIdsV15(),lockedV15=lockedItemsV15(lockIdsV15),focusIdsV15=focusIdsOfV15();const beforeClipsV6=clone(state.clips),beforeRefsV6={elements:state.elements,zooms:state.zooms,audioClips:state.audioClips,overlays:state.overlays};fn();
 // 0.15: nothing on a locked track can change; the whole edit is refused instead.
 if(lockedItemsV15(lockIdsV15)!==lockedV15){state=beforeStateV15;notice('That would change a locked track. Unlock it first.');render();return;}
 retimeV6(beforeClipsV6,beforeRefsV6);tidyV15();settleTracksV15();refocusV15(focusIdsV15);notice('Changes saved locally.');state.time=Math.max(0,Math.min(state.time,total()));state.selected=Math.max(0,Math.min(state.selected,state.clips.length-1));render();}
// 0.15: every clip and item gets a stable, unique id. Older projects could hold duplicates (for example
// after running Magic Edit twice), which made selecting or deleting one affect both; they are repaired on open.
const uidV15=()=>crypto.randomUUID();
function uniqueIdsV15(s){const seen=new Set();for(const key of ['clips','elements','zooms','overlays','audioClips']){for(const item of s[key]||[]){if(!item||typeof item!=='object')continue;if(item.id==='blank'&&key==='clips'){seen.add('blank');continue;}if(!item.id||seen.has(item.id))item.id=uidV15();seen.add(item.id);}}}
function restoreV15(next){const ids=focusIdsOfV15(),view=pickView(state),time=state.time;state=next;Object.assign(state,view);state.time=time;refocusV15(ids);}
function undo(){selectionV7=[];previewOriginal=false;timelineSelection=null;pendingUndoV15=null;if(!history.length)return;stop();future.push(clone(state));restoreV15(history.pop());render();notice('Edit undone. Redo is available.');}
function redo(){selectionV7=[];previewOriginal=false;timelineSelection=null;pendingUndoV15=null;if(!future.length)return;stop();history.push(clone(state));restoreV15(future.pop());render();notice('Edit restored.');}
function source(){let t=state.time;for(let i=0;i<state.clips.length;i++){const c=state.clips[i],d=c.end-c.start;if(t<d||i===state.clips.length-1)return {clip:c,t:c.start+Math.min(t,d),index:i,within:t,duration:d};t-=d;}return {clip:{asset:'blank',name:'Add footage',kind:'image'},t:0,index:0,within:0,duration:1};}
function mapTime(t){let n=0;for(const c of state.clips){if(c.asset===source().clip.asset&&t>=c.start&&t<c.end)return n+t-c.start;n+=c.end-c.start;}return null;}
function removeSource(a,b,id=source().clip.asset){const clips=state.clips.flatMap(c=>c.asset!==id?[c]:[{...c,end:Math.min(c.end,a)},{...c,id:uidV15(),start:Math.max(c.start,b),transitionIn:undefined}].filter(x=>x.end-x.start>=.3));if(!clips.length){notice('Keep at least one clip in the project.');return false;}state.clips=clips;state.selected=0;state.time=Math.min(state.time,total());return true;}
function stop(){window.pauseNativeMedia?.();playing=false;last=0;cancelAnimationFrame(raf);q('#ed-play').innerHTML=icon('play');q('#ed-play').setAttribute('aria-label','Play video');icons();}
function tick(ts){if(!playing)return;if(last)state.time=Math.min(total(),state.time+(ts-last)/1000*state.speed);last=ts;paint();followPlayheadV15();if(state.time>=total()){stop();return;}raf=requestAnimationFrame(tick);}
function play(){if(!state.clips.length)return;if(playing){stop();return;}if(state.time>=total())state.time=0;playing=true;last=0;q('#ed-play').innerHTML=icon('pause');q('#ed-play').setAttribute('aria-label','Pause video');icons();raf=requestAnimationFrame(tick);}
function paint(){const src=source(),t=src.t,activeZoom=(state.zooms||[]).find(z=>state.time>=z.start&&state.time<z.end),focus=activeZoom||state.focus||initial.focus;const cursor=window.cursorAt?.(src.clip.asset,t)||{x:focus.x,y:focus.y};const cursorX=cursor.x,cursorY=cursor.y;q('#ed-cursor').style.cssText='left:'+cursorX+'%;top:'+cursorY+'%';const zoom=(activeZoom||state.zoom||previewEffect==='zoom')&&!previewOriginal&&state.time>=focus.start&&state.time<=focus.end;const screen=q('#ed-screen');screen.style.transformOrigin=(focus.mode==='manual'?focus.x:cursorX)+'% '+(focus.mode==='manual'?focus.y:cursorY)+'%';const ramp=zoom?Math.max(0,Math.min(1,(state.time-focus.start)/.35,(focus.end-state.time)/.35)):0;screen.style.transform='scale('+(1+((activeZoom?.strength||state.strength)-1)*ramp*ramp*(3-2*ramp))+')';screen.style.filter=(state.colour||previewEffect==='colour')&&!previewOriginal?'brightness(1.08) saturate(1.06)':'none';q('#ed-canvas').style.aspectRatio=state.ratio;q('#ed-canvas').style.setProperty('--frame-ratio',state.ratio.split('/').reduce((a,b)=>a/b));q('#ed-scene-title').textContent=src.clip.kind==='image'?'A clearer way to work':src.clip.asset==='walk'?'Spring launch':src.clip.name;q('#ed-frame-label').textContent=previewOriginal?'Original':zoom?(focus.mode==='manual'?'Animated zoom':'Following cursor')+' · '+(activeZoom?.strength||state.strength).toFixed(2)+'×':src.clip.name;q('#ed-camera').hidden=!state.camera;const cap=q('#ed-captions'),line=state.transcript.find(l=>(!l.asset||l.asset===src.clip.asset)&&t>=l.start&&t<l.end);cap.hidden=!!state.hiddenTracks?.captions||!state.captions||!line||previewOriginal;if(line){const words=line.text.trim().split(/\s+/),idx=line.words?.length===words.length?Math.max(0,line.words.findLastIndex(w=>t>=w.start)):Math.min(words.length-1,Math.floor((t-line.start)/Math.max(.1,line.end-line.start)*words.length));cap.dataset.style=state.captionStyle;cap.style.fontFamily=state.captionFont;const portrait=Number(state.ratio.split('/')[0])/Number(state.ratio.split('/')[1])<1;cap.style.fontSize=(state.captionSize/(portrait?3:6))+'cqw';cap.style.setProperty('--ed-cap','#1f7ae0');cap.style.bottom=state.captionPosition==='top'?'auto':state.captionPosition==='middle'?'45%':portrait?'20%':'8%';cap.style.top=state.captionPosition==='top'?'8%':'auto';cap.querySelector('span').style.background=state.captionBackground?'':'transparent';cap.querySelector('span').innerHTML=state.captionStyle==='word'?'<b class="current">'+esc(words[idx])+'</b>':words.map((w,i)=>Math.floor(i/(state.captionGroup||3))!==Math.floor(idx/(state.captionGroup||3))?'':'<b class="'+(i===idx?'current ':'')+(i<=idx?'spoken':'')+'">'+esc(w)+'</b>').join(' ');}
window.syncNativeMedia?.(src,state,playing);q('#ed-scrub').max=total();q('#ed-scrub').value=state.time;q('#ed-time').textContent=!state.clips.some(c=>c.asset!=='blank')?'00:00.0 / 00:00.0':V7.formatTime(state.time/state.speed)+' / '+V7.formatTime(total()/state.speed);q('#ed-play').disabled=!state.clips.some(c=>c.asset!=='blank');const lineEl=q('.ed-playline');if(lineEl)lineEl.style.left=state.time/(total()||1)*100+'%';root.querySelectorAll('.ed-layer').forEach(el=>{const e=state.elements.find(x=>x.id===el.dataset.id);el.hidden=!!state.hiddenTracks?.[(['blur','cover'].includes(e.kind)?'effects':'graphics')]||previewOriginal||state.time<e.start||state.time>=e.end;const age=state.time-e.start;el.style.opacity=(['cover','blur'].includes(e.kind)||e.animation==='none')?1:Math.max(0,Math.min(1,age/.3));el.style.translate=e.animation==='slide'?'0 '+Math.max(0,12-age*40)+'px':'';el.style.scale=e.animation==='pop'?Math.min(1,.85+Math.max(0,age)*.5):1;});const fade=q('#ed-fade');fade.style.opacity=state.transition==='fade'?Math.max(0,1-src.within/.5,1-(src.duration-src.within)/.5):state.transition==='dissolve'&&src.index>0?Math.max(0,.45-src.within):0;paintV4(src);}
function layers(){q('#ed-screen').querySelectorAll('.ed-layer').forEach(n=>n.remove());q('#ed-layers').replaceChildren();for(const e of state.elements){const el=document.createElement('button');el.type='button';el.className='ed-layer'+(e.id===state.active?' selected':'');el.dataset.id=e.id;el.dataset.kind=e.kind;el.setAttribute('aria-label','Edit '+e.kind+' element');el.style.cssText='left:'+e.x+'%;top:'+e.y+'%;font-family:'+e.font+';font-size:'+(e.size/6)+'cqw;color:'+e.colour+';width:'+(e.width||40)+'%;';el.style.fontWeight=e.weight||600;el.style.textAlign=e.align||'center';if(e.background)el.style.background=e.background;if(e.kind==='editorial'||e.kind==='arrow')el.style.background='transparent';if(e.kind==='logo'){el.textContent=state.style.logo;el.style.background=state.style.colour;}if(e.kind==='lower')el.style.borderLeft='.5cqw solid '+state.style.colour;el.textContent=e.kind==='logo'?state.style.logo:e.text;if(e.kind.startsWith('icon-')){el.innerHTML=icon(e.kind.slice(5));el.style.background='transparent';}if(e.id===state.active&&!e.tracking){const h=document.createElement('span');h.className='ed-handle';el.append(h);}let moved=false;el.onclick=()=>{if(moved)return;state.active=e.id;open('element');layers();paint();timelineFocus();};el.ondblclick=()=>{state.active=e.id;open('element');q('#ed-text')?.focus();};el.onpointerdown=ev=>{if(ev.button!==0||e.tracking)return;if(lockedV7({type:'element',id:e.id}))return notice('Unlock this track to move it.');stop();snapshot();moved=false;const rect=q('#ed-canvas').getBoundingClientRect(),x0=ev.clientX,y0=ev.clientY,ox=e.x,oy=e.y,ow=e.width||40,resize=ev.target.classList.contains('ed-handle');el.setPointerCapture(ev.pointerId);el.onpointermove=v=>{const dx=(v.clientX-x0)/rect.width*100,dy=(v.clientY-y0)/rect.height*100;if(Math.abs(dx)+Math.abs(dy)>1)moved=true;if(resize)e.width=Math.min(85,Math.max(12,ow+dx*2));else{e.x=Math.max(e.width/2,Math.min(100-e.width/2,ox+dx));e.y=Math.max(10,Math.min(90,oy+dy));if(Math.abs(e.x-50)<2)e.x=50;if(Math.abs(e.y-50)<2)e.y=50;}el.style.left=e.x+'%';el.style.top=e.y+'%';el.style.width=e.width+'%';q('.ed-guide-x').hidden=e.x!==50;q('.ed-guide-y').hidden=e.y!==50;};el.onpointerup=()=>{el.onpointermove=null;q('.ed-guide-x').hidden=q('.ed-guide-y').hidden=true;state.active=e.id;state.panel='element';render();timelineFocus();};};(e.tracking?q('#ed-screen'):q('#ed-layers')).append(el);}icons();}

const styles=[['clean','Clean'],['highlight','Highlight'],['word','One word'],['karaoke','Karaoke'],['boxed','Soft box'],['outline','Outline'],['editorial','Editorial'],['stack','Stacked'],['marker','Marker'],['minimal','Minimal'],['bold','Bold'],['subtitle','Subtitle']];const fonts='<option value="DM Sans">DM Sans</option><option value="system-ui">Modern sans</option><option value="Georgia">Editorial serif</option><option value="Arial">Classic sans</option><option value="Verdana">Readable</option><option value="monospace">Mono</option>';
function select(id,label,options,value){return '<label>'+label+'<select id="'+id+'">'+options.map(([v,t])=>'<option value="'+v+'" '+(String(value)===String(v)?'selected':'')+'>'+t+'</option>').join('')+'</select></label>';}
function range(id,label,value,min=0,max=100){return '<label>'+label+' <output>'+value+'</output><input type="range" id="'+id+'" min="'+min+'" max="'+max+'" value="'+value+'"></label>';}
function bind(id,fn){const el=q('#'+id);if(el.tagName==='TEXTAREA'||el.type==='text'){el.onfocus=snapshot;el.onblur=()=>{tracks();paint();};el.oninput=()=>{fn(el.value,el);layers();paint();commit();};}else el.onchange=ev=>{const value=ev.target.value,checked=ev.target.checked;transaction(()=>fn(value,{checked}));};}
function open(name){state.panel=name;panel();if(!window.v5PointerSelecting){tracks();paint();}root.querySelectorAll('[data-panel]').forEach(b=>{const active=b.dataset.panel===name||name==='element'&&b.dataset.panel==='elements'||['transcript','caption-edit'].includes(name)&&b.dataset.panel==='captions';b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});commit();}
function addElement(kind){if(kind==='tracking-blur')return window.nativeTracking();if(!state.clips.length)return notice('Import footage first.');if(state.elements.length>=100){notice('100 elements maximum per project.');return;}const texts={title:'A clearer way to work',editorial:'Ideas worth sharing',lower:'Alex Chen · Product',quote:'Keep it simple.',pointer:'Start here ↗',pill:'Good to know',number:'01 / Get started',badge:'NEW',check:'✓',arrow:'→',cover:'Hidden detail',blur:'Blur region',logo:state.style.logo};transaction(()=>{const id=uidV15();state.elements.push({id,kind,text:texts[kind]||'Your text',font:kind==='editorial'?'Georgia':state.style.font,size:20,colour:'#ffffff',x:50,y:kind==='lower'?75:50,width:kind==='check'||kind==='badge'?20:40,start:Math.max(0,Math.min(state.time-.3,total()-.3)),end:Math.min(total(),Math.max(0,Math.min(state.time-.3,total()-.3))+5),animation:['cover','blur'].includes(kind)?'none':kind.startsWith('icon-')?'pop':'fade'});state.active=id;state.panel='element';});}
function panel(){layoutV5();const p=q('#ed-panel');if(panelV6(p)){controlsV6(p);icons();return;}if(panelV4(p)){decorateV5(p);controlsV6(p);icons();return;}if(state.panel==='media'){p.innerHTML='<h3>Your media</h3><p>Add footage, slides and sound. Drag clips to arrange your edit. Originals stay unchanged.</p><button id="ed-import" class="ed-wide">'+icon('upload')+' Add files</button><input type="file" id="ed-files" accept="video/*,image/*,audio/*" multiple hidden>'+state.assets.map(a=>'<div class="ed-asset"><span>'+esc(a.name)+'<small>'+a.kind+'</small></span><button data-asset="'+a.id+'">Add</button><button data-delete-asset="'+a.id+'" aria-label="Delete media from project">Delete</button></div>').join('')+'<p>Clips snap together automatically.</p>';p.querySelectorAll('[data-delete-asset]').forEach(b=>b.onclick=()=>transaction(()=>Object.assign(state,M.removeAsset(state,b.dataset.deleteAsset))));q('#ed-import').onclick=()=>window.nativeImport(false);q('#ed-files').onchange=ev=>importAssets([...ev.target.files]);p.querySelectorAll('[data-asset]').forEach(b=>b.onclick=()=>appendAsset(b.dataset.asset));}
else if(state.panel==='clip'){const c=state.clips[state.selected];p.innerHTML='<h3>Edit clip '+(state.selected+1)+'</h3><p>'+esc(c.name)+' · drag its edges on the timeline to trim.</p><div class="ed-row"><label>Source in<input type="number" id="ed-in" min="0" step=".1" value="'+c.start+'"></label><label>Source out<input type="number" id="ed-out" min=".3" step=".1" value="'+c.end+'"></label></div><button id="ed-trim" class="ed-wide">Apply trim</button><div class="ed-row" style="margin-top:8px"><button id="ed-earlier" '+(!state.selected?'disabled':'')+'>Earlier</button><button id="ed-later" '+(state.selected===state.clips.length-1?'disabled':'')+'>Later</button><button id="ed-duplicate">Duplicate</button></div>'+select('ed-speed','Project playback speed',[['.5','0.5×'],['1','1× Normal'],['1.5','1.5×'],['2','2×']],state.speed)+'<p>Use the + between clips on the timeline to add a transition.</p>';q('#ed-trim').onclick=()=>{const a=+q('#ed-in').value,b=+q('#ed-out').value;if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b>c.limit||b-a<.3){notice('Choose source times between 0 and '+c.limit+' seconds, at least 0.3 seconds apart.');return;}transaction(()=>{c.start=a;c.end=b;});};q('#ed-earlier').onclick=()=>move(-1);q('#ed-later').onclick=()=>move(1);q('#ed-duplicate').onclick=()=>{if(state.clips.length>=200)return notice('200 clips maximum.');transaction(()=>{state.clips.splice(state.selected+1,0,{...c,id:uidV15()});state.selected++;});};bind('ed-speed',v=>state.speed=+v);p.insertAdjacentHTML('beforeend','<label class="ed-check">Mute clip audio<input id="v4-clip-mute" type="checkbox" '+(c.muted?'checked':'')+'></label>');q('#v4-clip-mute').onchange=ev=>transaction(()=>c.muted=ev.target.checked);}
else if(state.panel==='captions'){p.innerHTML='<h3>Captions</h3><label class="ed-check">Show captions<input id="ed-cap-on" type="checkbox" '+(state.captions?'checked':'')+'></label><div class="ed-presets">'+(expandedCaps?styles:styles.slice(0,4)).map(([k,n])=>'<button data-cap="'+k+'" class="ed-preset '+(state.captionStyle===k?'active':'')+'"><span>Make it <em>clear.</em></span><small>'+n+'</small></button>').join('')+'</div><button id="ed-cap-browse" class="ed-wide">'+(expandedCaps?'Show recommended':'Browse all 12 styles')+'</button><details><summary>Customize all captions</summary><label>Font<select id="ed-cap-font">'+fonts+'</select></label>'+range('ed-cap-size','Size',state.captionSize,12,28)+select('ed-cap-place','Placement',[['bottom','Bottom'],['middle','Middle'],['top','Top']],state.captionPosition)+'<p>Highlight colour · smallcase blue</p><label class="ed-check">Contrast background<input id="ed-cap-bg" type="checkbox" '+(state.captionBackground?'checked':'')+'></label><p>Style changes apply to every caption.</p></details>';q('#ed-cap-font').value=state.captionFont;bind('ed-cap-font',v=>state.captionFont=v);bind('ed-cap-size',v=>state.captionSize=+v);bind('ed-cap-place',v=>state.captionPosition=v);bind('ed-cap-bg',(v,c)=>state.captionBackground=c.checked);bind('ed-cap-on',(v,c)=>state.captions=c.checked);q('#ed-cap-browse').onclick=()=>{expandedCaps=!expandedCaps;panel();};p.querySelectorAll('[data-cap]').forEach(b=>b.onclick=()=>transaction(()=>{state.captionStyle=b.dataset.cap;state.captions=true;}));}
else if(state.panel==='transcript'){p.innerHTML='<h3>Words & timing</h3><p>Times refer to the original source. Correct text changes captions only. “Cut this section” removes footage from the selected source clip.</p>'+state.transcript.map((l,i)=>'<div class="ed-transcript-row"><textarea aria-label="Caption '+(i+1)+'" maxlength="180" data-text="'+i+'">'+esc(l.text)+'</textarea><div class="ed-row"><label>Start<input type="number" min="0" max="100000" step=".1" data-tstart="'+i+'" value="'+l.start+'"></label><label>End<input type="number" min="0" max="100000" step=".1" data-tend="'+i+'" value="'+l.end+'"></label></div><div class="ed-row"><button data-jump="'+i+'">Preview</button><button data-cut="'+i+'">Cut this section</button><button data-delete-caption="'+i+'">Delete caption</button></div></div>').join('')+'<button id="ed-transcript-back" class="ed-wide">Back to caption style</button>';p.querySelectorAll('[data-text]').forEach(x=>{x.onfocus=snapshot;x.oninput=()=>{state.transcript[+x.dataset.text].text=x.value;delete state.transcript[+x.dataset.text].words;state.captions=true;paint();commit();};});p.querySelectorAll('[data-tstart],[data-tend]').forEach(x=>x.onchange=()=>{const i=+(x.dataset.tstart??x.dataset.tend),l=state.transcript[i],start=+p.querySelector('[data-tstart="'+i+'"]').value,end=+p.querySelector('[data-tend="'+i+'"]').value;if(start<0||!Number.isFinite(start)||!Number.isFinite(end)||end>(state.assets.find(a=>a.id===l.asset)?.duration||total())||end<=start||state.transcript.some((other,j)=>j!==i&&other.asset===l.asset&&start<other.end&&end>other.start)){notice('Use non-overlapping caption times within the source clip.');panel();return;}transaction(()=>{Object.assign(l,{start,end});delete l.words;});});p.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>{stop();const l=state.transcript[+b.dataset.jump];let offset=0;let t=null;for(const c of state.clips){if(c.asset===l.asset&&l.start>=c.start&&l.start<c.end){t=offset+l.start-c.start;break;}offset+=c.end-c.start;};if(t===null)return notice('This section has been cut. Undo or restore it from Magic Edit.');state.time=t;paint();});p.querySelectorAll('[data-cut]').forEach(b=>b.onclick=()=>{const l=state.transcript[+b.dataset.cut];transaction(()=>removeSource(l.start,l.end,l.asset));notice('Section cut. Undo restores it; caption corrections do not cut footage.');});p.querySelectorAll('[data-delete-caption]').forEach(b=>b.onclick=()=>transaction(()=>state.transcript.splice(+b.dataset.deleteCaption,1)));q('#ed-transcript-back').onclick=()=>open('captions');}
else if(state.panel==='elements'){const items=elementCategory==='titles'?[['title','Modern title'],['editorial','Editorial'],['lower','Lower third'],['quote','Pull quote'],['logo','Logo initials']]:elementCategory==='icons'?[['icon-rocket','Rocket'],['icon-lightbulb','Idea'],['icon-target','Goal'],['icon-circle-check','Complete'],['icon-sparkles','Sparkle'],['icon-chart-column','Chart'],['icon-mouse-pointer-2','Cursor'],['icon-clock','Time'],['icon-download','Download'],['icon-circle-alert','Alert'],['icon-heart','Heart'],['icon-shield-check','Verified']]:elementCategory==='callouts'?[['pointer','Pointer'],['pill','Tip pill'],['number','Step number'],['badge','Badge'],['check','Success'],['arrow','Arrow']]:[['cover','Solid cover'],['blur','Blur region'],['tracking-blur','Tracking blur']];p.innerHTML='<h3>Elements</h3><div class="ed-row">'+['titles','callouts','icons','privacy'].map(x=>'<button data-category="'+x+'" class="'+(elementCategory===x?'active':'')+'">'+x[0].toUpperCase()+x.slice(1)+'</button>').join('')+'</div><p>Click to add. Drag on the preview to position; use the corner handle to resize.</p><div class="ed-presets">'+items.map(([k,n])=>'<button class="ed-preset" data-element="'+k+'"><span style="font-family:'+(k==='editorial'?'Georgia':'inherit')+'">'+(k==='tracking-blur'?icon('scan'):k.startsWith('icon-')?icon(k.slice(5)):({pointer:'↗',check:'✓',arrow:'→',number:'01',cover:'••••',blur:'Blur'}[k]||'Aa'))+'</span><small>'+n+'</small></button>').join('')+'</div>'+(elementCategory==='privacy'?'<p>Privacy covers and blur are rendered into exports.</p>':'');p.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{elementCategory=b.dataset.category;panel();});p.querySelectorAll('[data-element]').forEach(b=>b.onclick=()=>addElement(b.dataset.element));}
else if(state.panel==='element'){const e=state.elements.find(x=>x.id===state.active);if(!e){state.panel='elements';panel();return;}p.innerHTML='<h3>Edit '+esc(e.kind)+'</h3><label>Text<textarea id="ed-text" maxlength="90">'+esc(e.text)+'</textarea></label><label>Font<select id="ed-font">'+fonts+'</select></label>'+range('ed-size','Size',e.size,12,36)+'<div class="ed-row"><button id="ed-center">Centre</button><button id="ed-remove">Remove</button></div><details><summary>Position, timing & entrance</summary>'+range('ed-width','Width %',e.width,12,85)+range('ed-x','Horizontal %',e.x,10,90)+range('ed-y','Vertical %',e.y,10,90)+'<label>Colour <input type="color" id="ed-colour" value="'+e.colour+'"></label><label>Start (s)<input id="ed-elstart" type="number" min="0" step=".1" value="'+Number((e.start/state.speed).toFixed(3))+'"></label><label>End (s)<input id="ed-elend" type="number" min="0" step=".1" value="'+Number((e.end/state.speed).toFixed(3))+'"></label>'+select('ed-animation','Entrance',[['fade','Soft fade'],['slide','Slide up'],['pop','Gentle pop'],['none','None']],e.animation)+'</details><button id="ed-elements-back" class="ed-wide">Browse elements</button>';q('#ed-font').value=e.font;for(const [id,key,num]of[['text','text'],['font','font'],['size','size',true],['width','width',true],['x','x',true],['y','y',true],['colour','colour'],['animation','animation']])bind('ed-'+id,v=>e[key]=num?+v:v);for(const id of ['ed-elstart','ed-elend'])q('#'+id).onchange=()=>{const a=+q('#ed-elstart').value*state.speed,b=+q('#ed-elend').value*state.speed;if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b>total()||b<=a){notice('Element timing must fit inside your video.');panel();return;}transaction(()=>{e.start=a;e.end=b;});};q('#ed-center').onclick=()=>transaction(()=>{e.x=50;e.y=50;});q('#ed-remove').onclick=()=>transaction(()=>{state.elements=state.elements.filter(x=>x.id!==e.id);state.panel='elements';});q('#ed-elements-back').onclick=()=>open('elements');}
else if(state.panel==='zoom'){const f=state.focus;p.innerHTML='<h3>Focus & framing</h3><label class="ed-check">Enable zoom<input id="ed-zoom-on" type="checkbox" '+(state.zoom?'checked':'')+'></label>'+select('ed-focus-mode','Focus mode',[['cursor','Follow recorded cursor'],['manual','Manual focus point']],f.mode)+range('ed-strength','Zoom %',Math.round(state.strength*100),100,180)+(f.mode==='manual'?range('ed-focus-x','Horizontal %',f.x)+range('ed-focus-y','Vertical %',f.y):'<p>Cursor follow uses data captured by this app. For imported videos, use manual focus.</p>')+'<details><summary>Focus timing</summary><label>From (s)<input id="ed-focus-start" type="number" min="0" value="'+Number((f.start/state.speed).toFixed(3))+'"></label><label>Until (s)<input id="ed-focus-end" type="number" min="0" value="'+Number((f.end/state.speed).toFixed(3))+'"></label></details>';bind('ed-zoom-on',(v,c)=>state.zoom=c.checked);bind('ed-focus-mode',v=>f.mode=v);bind('ed-strength',v=>state.strength=+v/100);if(f.mode==='manual'){bind('ed-focus-x',v=>f.x=+v);bind('ed-focus-y',v=>f.y=+v);}['ed-focus-start','ed-focus-end'].forEach(id=>q('#'+id).onchange=()=>{const a=+q('#ed-focus-start').value*state.speed,b=+q('#ed-focus-end').value*state.speed;if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<=a||b>total()){notice('Choose focus times within your video.');return;}transaction(()=>{f.start=a;f.end=b;});});}
else if(state.panel==='audio'){p.innerHTML='<h3>Sound that supports you</h3><p>Independent track controls · settings demo, no audio playback.</p>'+range('ed-voice','Voice volume %',state.audio.voice,0,100)+range('ed-music','Music volume %',state.audio.music)+'<label class="ed-check">Reduce background noise<input id="ed-noise" type="checkbox" '+(state.audio.noise?'checked':'')+'></label><label class="ed-check">Balance voice levels<input id="ed-level" type="checkbox" '+(state.audio.level?'checked':'')+'></label><label class="ed-check">Keep music quiet beneath voice<input id="ed-duck" type="checkbox" '+(state.music?.duck!==false?'checked':'')+'></label><div class="ed-row"><button data-action="music">Music library</button><button id="ed-voiceover">Record voiceover</button></div>'+(state.music?'<button id="ed-remove-music" class="ed-wide">Remove music</button>':'')+(state.voiceover?'<button id="ed-remove-voice" class="ed-wide">Remove voiceover</button>':'');for(const k of ['voice','music'])bind('ed-'+k,v=>state.audio[k]=+v);for(const k of ['noise','level'])bind('ed-'+k,(v,c)=>state.audio[k]=c.checked);bind('ed-duck',(v,c)=>{if(state.music)state.music.duck=c.checked;});q('#ed-voiceover').onclick=()=>window.dispatchEvent(new CustomEvent('vv-voiceover'));if(q('#ed-remove-voice'))q('#ed-remove-voice').onclick=()=>transaction(()=>state.voiceover=null);if(q('#ed-remove-music'))q('#ed-remove-music').onclick=()=>transaction(()=>state.music=null);}
else if(state.panel==='style'){p.innerHTML='<h3>One consistent style</h3><p>A shared font and accent for this project.</p><label>Preset name<input id="ed-style-name" maxlength="35" value="'+esc(state.style.name)+'"></label><label>Font<select id="ed-style-font">'+fonts+'</select></label><label>Accent <input type="color" id="ed-style-colour" value="'+state.style.colour+'"></label><label>Logo initials<input id="ed-style-logo" maxlength="4" value="'+esc(state.style.logo)+'"></label>'+'<button id="ed-style-apply" class="ed-wide primary">Apply to titles & captions</button><button id="ed-style-save" class="ed-wide">Save company preset</button><button id="ed-style-load" class="ed-wide">Use company preset</button>';q('#ed-style-font').value=state.style.font;const read=()=>({name:q('#ed-style-name').value||'Company style',font:q('#ed-style-font').value,colour:q('#ed-style-colour').value,logo:q('#ed-style-logo').value});q('#ed-style-apply').onclick=()=>applyStyle(read());q('#ed-style-save').onclick=()=>{const style=read();applyStyle(style);window.dispatchEvent(new CustomEvent('vv-brand-save',{detail:style}));};q('#ed-style-load').onclick=()=>window.dispatchEvent(new CustomEvent('vv-brand-load'));}
window.nativePanelExtras?.();decorateV5(p);controlsV6(p);icons();}
function applyStyle(style){transaction(()=>{state.style=style;state.captionFont=style.font;state.captionColour=style.colour;state.elements.forEach(e=>{e.font=style.font;if(!['blur','cover'].includes(e.kind))e.colour=style.colour;});});}
function move(d){const i=state.selected,j=i+d;if(j<0||j>=state.clips.length)return;transaction(()=>{[state.clips[i],state.clips[j]]=[state.clips[j],state.clips[i]];state.selected=j;});}
function importAssets(files){window.nativeImport(false);}
function appendAsset(id){const a=state.assets.find(a=>a.id===id);if(!a)return;if(a.kind==='audio'){transaction(()=>{state.audioClips??=[];state.audioClips.push({id:crypto.randomUUID(),name:a.name,asset:a.id,start:state.time,end:state.time+a.duration,sourceIn:0,volume:100});});notice('Audio added to the timeline.');return;}if(state.clips.length>=200)return notice('200 clips maximum.');transaction(()=>{state.clips=state.clips.filter(c=>c.asset!=='blank');state.clips.push({id:uidV15(),asset:a.id,name:a.name,kind:a.kind,start:0,end:a.duration,limit:a.duration});state.selected=state.clips.length-1;state.panel='clip';});}
function render(skip=false){normalizeV7();state.audio.voice=Math.max(0,Math.min(100,state.audio.voice));state.time=Math.min(total(),state.time);q('#ed-undo').disabled=!history.length;q('#ed-redo').disabled=!future.length;root.querySelectorAll('[data-panel]').forEach(b=>{const active=b.dataset.panel===state.panel||state.panel==='element'&&b.dataset.panel==='elements'||['transcript','caption-edit'].includes(state.panel)&&b.dataset.panel==='captions';b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});panel();tracks();layers();paint();if(!skip)commit();}
q('#ed-play').onclick=play;q('#ed-scrub').oninput=e=>{state.time=+e.target.value;paint();};q('#ed-scrub').onchange=commit;q('#ed-undo').onclick=undo;q('#ed-redo').onclick=redo;q('#ed-transcript').onclick=()=>open('transcript');q('#ed-export').onclick=()=>window.dispatchEvent(new CustomEvent('vv-export'));q('#ed-frame').onclick=()=>window.dispatchEvent(new CustomEvent('vv-frame'));root.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>open(b.dataset.panel));q('#ed-split').onclick=()=>{const src=source(),c=src.clip;if(trackLockedV15('video-main'))return notice('Unlock the main video track to split it.');if(src.within<MIN_CLIP_V15||src.duration-src.within<MIN_CLIP_V15)return notice('Move the playhead at least '+MIN_CLIP_V15+' seconds inside a clip.');if(state.clips.length>=200)return notice('200 clips maximum.');transaction(()=>{state.clips.splice(src.index,1,{...c,end:src.t},{...c,id:uidV15(),start:src.t,transitionIn:undefined});state.selected=src.index+1;state.panel='clip';});};q('#ed-delete').onclick=()=>{if(state.clips.length<2)return;transaction(()=>{state.clips.splice(state.selected,1);state.selected=Math.max(0,state.selected-1);});};onKeyV9(ev=>{if(['INPUT','TEXTAREA','SELECT'].includes(ev.target.tagName))return;if((ev.metaKey||ev.ctrlKey)&&ev.key.toLowerCase()==='z'){ev.preventDefault();ev.shiftKey?redo():undo();}if(ev.code==='Space'){ev.preventDefault();play();}});document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
// Editor interactions share the same state and paint path as export.
let timelineSelection=null,timelineScale=1,selectedCaption=0,selectedZoom=null,selectedBoundary=1;
const M=window.editModel;
function timelineFocus(){q('.ed-timeline').focus({preventScroll:true});}
function selectCaption(i){selectedCaption=i;timelineSelection={type:'caption',id:i};state.panel='caption-edit';open('caption-edit');tracks();}
function deleteSelected(){if(deleteV6())return;if(state.panel==='element'&&state.active)timelineSelection={type:'element',id:state.active};else if(state.panel==='caption-edit')timelineSelection={type:'caption',id:selectedCaption};else if(state.panel==='clip')timelineSelection={type:'video',id:state.selected};if(!timelineSelection){timelineSelection={type:'video',id:state.selected};}const sel=timelineSelection;transaction(()=>{if(sel.type==='video'){state.clips.splice(+sel.id,1);state.selected=Math.min(state.selected,Math.max(0,state.clips.length-1));state.panel=state.clips.length?'clip':'media';}if(sel.type==='element'){state.elements=state.elements.filter(e=>e.id!==sel.id);state.panel='elements';}if(sel.type==='caption'){state.transcript.splice(+sel.id,1);state.panel='captions';}if(sel.type==='source'){const c=state.clips.find(c=>c.id===sel.id);if(c)c.muted=true;state.panel='audio';}if(sel.type==='music')state.music=null;if(sel.type==='voiceover')state.voiceover=null;if(sel.type==='zoom')state.zooms=(state.zooms||[]).filter(z=>z.id!==sel.id);timelineSelection=null;});timelineFocus();}
function seekTimeline(event,lane){stop();const r=lane.getBoundingClientRect(),t=(event.clientX-r.left)/r.width*total();let points=[0,total()];let pos=0;for(const c of state.clips){pos+=c.end-c.start;points.push(pos);}state.time=Math.max(0,Math.min(total(),event.altKey?t:window.editorModelV5.snap(t,points,total()/r.width*7)));paint();}
function wireLane(lane){lane.onpointerdown=ev=>{if(ev.button!==0||ev.target.closest('[data-trim],[data-transition],[data-reorder]'))return;timelineFocus();seekTimeline(ev,lane);const capture=ev.target.closest('.vt-block')||lane;capture.setPointerCapture(ev.pointerId);capture.onpointermove=e=>seekTimeline(e,lane);capture.onpointerup=()=>{capture.onpointermove=null;capture.releasePointerCapture(ev.pointerId);commit();};};}
function tracks(){
 const timeline=q('.ed-timeline');timeline.tabIndex=0;timeline.setAttribute('aria-label','Editing timeline. Arrow keys step frames, Shift steps ten frames, Delete removes selection.');
 q('#ed-duration').textContent=V7.formatTime(total()/state.speed);q('#ed-ruler').hidden=true;q('#ed-clips').hidden=true;q('#ed-element-track').hidden=true;q('#ed-audio-track').hidden=true;
 let host=q('#vt-tracks');if(!host){host=document.createElement('div');host.id='vt-tracks';timeline.append(host);}const scroll=host.scrollLeft;host.replaceChildren();
 const surface=document.createElement('div');surface.className='vt-surface';surface.style.minWidth=(Math.max(480,(timeline.clientWidth||700)-24)*timelineScale)+'px';host.append(surface);
 const row=(label,kind)=>{const r=document.createElement('div');r.className='vt-row';const l=document.createElement('span');l.className='vt-label';l.textContent=label;const lane=document.createElement('div');lane.className='vt-lane '+kind;lane.setAttribute('aria-label',label+' track');r.append(l,lane);surface.append(r);wireLane(lane);const head=document.createElement('span');head.className='vt-head';lane.append(head);return lane;};
 const ruler=row('Time','vt-ruler');{// 0.9: ruler labels sit on round times (1 s, 5 s, 30 s ...) instead of eighths of the duration.
  const whole=total()/state.speed||1;let zoomed=1;try{zoomed=timelineScale||1;}catch{}
  const step=[.5,1,2,5,10,15,30,60,120,300,600,900,1800].find(x=>whole/x<=10*zoomed)||3600;
  for(let t=0;t<=whole+1e-6;t+=step){if(t>0&&t/whole>.975)break;const mark=document.createElement('span');mark.className='vt-tick';mark.style.left=(t/whole*100)+'%';mark.textContent=whole<60?(Number.isInteger(t)?t:t.toFixed(1))+'s':Math.floor(t/60)+':'+String(Math.round(t%60)).padStart(2,'0');ruler.append(mark);}}
 const videoLane=row('Video','vt-video');let offset=0;
 function block(lane,label,start,end,type,id,select){const b=document.createElement('button');b.className='vt-block vt-item-'+type+(timelineSelection?.type===type&&String(timelineSelection.id)===String(id)?' selected':'');b.style.left=(start/(total()||1)*100)+'%';b.style.width=((end-start)/(total()||1)*100)+'%';b.textContent=label;b.title=label;b.setAttribute('aria-label',label);b.onpointerdown=()=>{timelineSelection={type,id};window.v5PointerSelecting=true;try{select?.();}finally{window.v5PointerSelecting=false;}lane.querySelectorAll('.selected').forEach(n=>n.classList.remove('selected'));b.classList.add('selected');};b.dataset.v7Start=start;b.dataset.v7End=end;lane.append(b);dragBlockV6(b,lane,type,id);if(['source','music','voiceover'].includes(type)){b.dataset.waveAsset=type==='source'?state.clips.find(c=>c.id===id)?.asset:id;if(type==='source')b.dataset.sourceClip=id;}return b;}
 state.clips.forEach((c,i)=>{const start=offset,end=offset+c.end-c.start,b=block(videoLane,c.name,start,end,'video',i,()=>{state.selected=i;open('clip');});b.dataset.clip=i;b.dataset.visualAsset=c.asset;

 for(const side of ['start','end']){const h=document.createElement('span');h.dataset.trim=side;h.className='vt-trim '+side;b.append(h);h.onpointerdown=ev=>{ev.stopPropagation();if(state.lockedTracks?.['Video track']||state.timelineTracks?.find(t=>t.id==='video-main')?.locked)return;stop();snapshot();const priorClips=clone(state.clips);const x=ev.clientX,old=c[side],base=total(),scale=base/videoLane.getBoundingClientRect().width,points=snapPointsV15(e=>e.type==='video'||e.type==='source',c.id);h.setPointerCapture(ev.pointerId);h.onpointermove=e=>{let t=old+(e.clientX-x)*scale;if(side==='end'){const off=clipOffsetV15(c.id);t=snapV15(off+t-c.start,points,8*scale,e)-off+c.start;}c[side]=side==='start'?Math.max(0,Math.min(c.end-MIN_CLIP_V15,t)):Math.min(c.limit,Math.max(c.start+MIN_CLIP_V15,t));b.title=(c.end-c.start).toFixed(2)+'s';relayoutMainV15(base);dragTipV15(e,c.end-c.start);paint();};h.onpointerup=()=>{h.onpointermove=null;hideSnapLineV15();dragTipV15(null);retimeV6(priorClips);settleTracksV15();state.selected=i;render();};};}
 if(i>0){const t=document.createElement('button');t.dataset.transition=i;t.className='vt-transition';t.style.left=start/(total()||1)*100+'%';t.textContent=c.transitionIn?.type&&c.transitionIn.type!=='cut'?'◆':'+';t.setAttribute('aria-label','Transition before clip '+(i+1));t.onclick=()=>{selectedBoundary=i;open('transition');};videoLane.append(t);}offset=end;});
 extraTracksV6(row,block);const sourceAudio=state.clips.some(c=>state.assets.find(a=>a.id===c.asset)?.hasAudio)||state.voiceover||state.panel==='audio'?row('Audio','vt-audio'):null;offset=0;for(const c of state.clips){const d=c.end-c.start;if(state.assets.find(a=>a.id===c.asset)?.hasAudio&&!c.muted)block(sourceAudio,'Source · '+c.name,offset,offset+d,'source',c.id,()=>open('audio'));offset+=d;}
 for(const [key,label]of [['music','Music'],['voiceover','Voiceover']]){const track=state[key];if(!track&&state.panel!=='audio')continue;const lane=row(key==='voiceover'?'Narration':label,'vt-audio');if(track){const a=state.assets.find(a=>a.id===track.asset);block(lane,track.name,track.start||0,key==='music'?total():Math.min(total(),(track.start||0)+(a?.duration||0)*state.speed),key,track.asset,()=>open('audio'));}}
 const elements=state.elements;elements.forEach((e,i)=>{const lane=row(['cover','blur','tracking-blur'].includes(e.kind)?'Effects':i?'':'Graphics','vt-text');if(e){const ranges=e.tracking?M.occurrences(state,{asset:e.tracking.asset,start:e.tracking.start,end:e.tracking.end}):[{start:e.start,end:e.end}];for(const r of ranges)block(lane,e.kind.startsWith('icon-')?e.kind.slice(5):e.tracking?'Tracking blur':e.kind==='blur'?'Blur region':e.kind==='cover'?'Solid cover':e.text||e.kind,r.start,r.end,'element',e.id,()=>{state.active=e.id;open('element');});}});
 if(state.captions||state.transcript.length||['captions','caption-edit'].includes(state.panel)){const lane=row('Captions','vt-captions');state.transcript.forEach((l,i)=>{for(const r of M.occurrences(state,l)){const b=block(lane,l.text,r.start,r.end,'caption',i,()=>{selectedCaption=i;open('caption-edit');});b.ondblclick=()=>{selectCaption(i);q('#v4-caption-text')?.focus();};}});}
 const zoomLane=state.zooms?.length?row('Effects','vt-zoom'):null;for(const z of state.zooms||[])block(zoomLane,z.mode==='cursor'?'Follow cursor':'Zoom in',z.start,z.end,'zoom',z.id,()=>{selectedZoom=z.id;open('zoom');});
 host.scrollLeft=scroll;decorateTracksV5();q('#ed-delete').disabled=!state.clips.length&&!timelineSelection;q('#ed-delete').onclick=()=>deleteSelected();q('#ed-delete').title='Delete selected items';q('#ed-delete').textContent='Delete selection';
 if(!q('#vt-scale')){const controls=document.createElement('div');controls.className='vt-controls';controls.innerHTML='<span>Click or drag any track to scrub · ← → 1 frame · Shift 10 frames · Delete selection</span><label>Timeline zoom <input id="vt-scale" type="range" min="1" max="5" step=".5" value="1"></label>';timeline.append(controls);q('#vt-scale').oninput=e=>{timelineScale=+e.target.value;tracks();paint();};}
}
// 0.15: the tracking blur's start and end (video time), within what was tracked.
function trackRangeV15(e){const r=(window.trackModelV8?.entries(state)||[]).find(x=>x.type==='element'&&x.id===e.id)?.ranges?.[0];return r?{from:r.start,until:r.end}:null;}
function trackRangeFieldsV15(e){const r=trackRangeV15(e);if(!r)return '';const f=t=>(t/state.speed).toFixed(2);return '<div class="ed-row v15-track-range"><label>From (s)<input id="v15-track-from" type="number" step=".1" min="0" value="'+f(r.from)+'"></label><label>Until (s)<input id="v15-track-until" type="number" step=".1" min="0" value="'+f(r.until)+'"></label></div>';}
function wireTrackRangeV15(e){const r=trackRangeV15(e);if(!r)return;const L=trackLimitsV15(e);const apply=()=>{const from=+q('#v15-track-from').value*state.speed,until=+q('#v15-track-until').value*state.speed;if(!Number.isFinite(from)||!Number.isFinite(until)||until-from<.1)return notice('Until must be after From.');const ns=Math.max(L.start,e.tracking.start+(from-r.from)),ne=Math.min(L.end,e.tracking.end+(until-r.until));if(ne-ns<.1)return notice('That range is outside what was tracked. Use Correct tracking from playhead to track further.');transaction(()=>{const item=state.elements.find(x=>x.id===e.id);if(item)item.tracking={...item.tracking,start:ns,end:ne};});};for(const id of ['v15-track-from','v15-track-until'])q('#'+id).onchange=apply;}
function panelV4Base(p){
 if(state.panel==='element'&&state.elements.find(e=>e.id===state.active)?.tracking){const e=state.elements.find(e=>e.id===state.active);p.innerHTML='<h3>Tracking blur</h3><p>This mask follows the selected source region. Review the entire clip: tracking can drift or lose its subject.</p>'+(e.tracking.lostAt!=null?'<p>Tracking was lost at '+e.tracking.lostAt.toFixed(2)+'s. The remaining range is fully blurred.</p>':'')+trackRangeFieldsV15(e)+'<button id="v4-track-again" class="ed-wide">Correct tracking from playhead</button><button id="v4-mask-remove" class="ed-wide">Remove mask</button>';wireTrackRangeV15(e);q('#v4-track-again').onclick=()=>window.nativeTracking(e.id);q('#v4-mask-remove').onclick=()=>{timelineSelection={type:'element',id:e.id};deleteSelected();};return true;}

 if(state.panel==='clip'&&!state.clips.length){state.panel='media';return false;}
 if(state.panel==='caption-edit'){
  const l=state.transcript[selectedCaption];if(!l){state.panel='captions';return false;}p.innerHTML='<h3>Edit caption</h3><p>Edit the words shown on your video. Times refer to the source clip.</p><label>Caption<textarea id="v4-caption-text" maxlength="500">'+esc(l.text)+'</textarea></label><div class="ed-row"><label>Start (s)<input type="number" id="v4-cap-start" step=".01" value="'+l.start+'"></label><label>End (s)<input type="number" id="v4-cap-end" step=".01" value="'+l.end+'"></label></div><button id="v4-cap-save" class="ed-wide primary">Save caption</button><button id="v4-cap-delete" class="ed-wide">Delete caption</button><button id="v4-cap-style" class="ed-wide">Caption styles</button>';
  let captionBaseline=structuredClone(l);q('#v4-caption-text').onfocus=()=>{snapshot();captionBaseline=structuredClone(l);};q('#v4-caption-text').onblur=()=>{tracks();paint();};q('#v4-caption-text').oninput=e=>{Object.assign(l,window.editorModelV5.wordEdit(captionBaseline,e.target.value));paint();commit();};q('#v4-cap-save').onclick=()=>{const a=+q('#v4-cap-start').value,b=+q('#v4-cap-end').value,limit=state.assets.find(a=>a.id===l.asset)?.duration||0;if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<=a||b>limit||state.transcript.some((x,i)=>i!==selectedCaption&&x.asset===l.asset&&a<x.end&&b>x.start))return notice('Use non-overlapping times within the source.');transaction(()=>{const changed=l.start!==a||l.end!==b;l.start=a;l.end=b;if(changed)delete l.words;});};q('#v4-cap-delete').onclick=()=>{timelineSelection={type:'caption',id:selectedCaption};deleteSelected();};q('#v4-cap-style').onclick=()=>open('captions');return true;
 }
 if(state.panel==='transition'){
 const c=state.clips[selectedBoundary];if(!c||selectedBoundary===0){state.panel='clip';return false;}const t=c.transitionIn||{type:'cut',duration:.5};p.innerHTML='<h3>Between clips '+selectedBoundary+' and '+(selectedBoundary+1)+'</h3><p>A short transition keeps presentations clear.</p>'+select('v4-transition','Transition',[['cut','Clean cut'],['black','Dip to black'],['white','Dip to white'],['slide','Slide left']],t.type)+range('v4-transition-duration','Duration (tenths of a second)',Math.round(t.duration*10),2,12)+'<button id="v4-transition-preview" class="ed-wide">Preview transition</button>';
 const apply=()=>transaction(()=>{c.transitionIn={type:q('#v4-transition').value,duration:+q('#v4-transition-duration').value/10};state.transition='cut';});q('#v4-transition').onchange=apply;q('#v4-transition-duration').onchange=apply;q('#v4-transition-preview').onclick=()=>{state.time=Math.max(0,state.clips.slice(0,selectedBoundary).reduce((n,c)=>n+c.end-c.start,0)-state.speed);play();};return true;
 }
 if(state.panel==='zoom'){
  const pos=M.clipAt(state,state.time),hasCursor=state.assets.find(a=>a.id===pos?.clip.asset)?.cursor?.length;
  p.innerHTML='<h3>Focus & zoom</h3><p>Add a smooth zoom at the playhead, then adjust its duration on this panel.</p><button id="v4-cursor" class="ed-wide" '+(!hasCursor?'disabled':'')+'>Follow recorded cursor</button><button id="v4-add-zoom" class="ed-wide primary" '+(!state.clips.length?'disabled':'')+'>Add zoom</button>'+(!hasCursor?'<p>Cursor following needs a Video Visor screen or area recording.</p>':'');
  function add(mode){transaction(()=>{state.zooms??=[];const start=Math.min(state.time,Math.max(0,total()-.5*state.speed));const z={id:crypto.randomUUID(),mode,x:50,y:50,strength:1.4,start,end:Math.min(total(),start+3*state.speed)};state.zooms.push(z);selectedZoom=z.id;timelineSelection={type:'zoom',id:z.id};state.zoom=false;});}
  q('#v4-cursor').onclick=()=>add('cursor');q('#v4-add-zoom').onclick=()=>add('manual');const z=(state.zooms||[]).find(z=>z.id===selectedZoom);
  if(z){p.insertAdjacentHTML('beforeend','<hr><h4>'+ (z.mode==='cursor'?'Cursor zoom':'Animated zoom')+'</h4>'+range('v4-zoom-strength','Zoom %',Math.round(z.strength*100),110,200)+'<label>From (s)<input id="v4-zstart" type="number" step=".1" value="'+(z.start/state.speed).toFixed(2)+'"></label><label>Until (s)<input id="v4-zend" type="number" step=".1" value="'+(z.end/state.speed).toFixed(2)+'"></label><button id="v4-zsave" class="ed-wide">Apply timing</button><button id="v4-zpreview" class="ed-wide">Preview zoom</button><button id="v4-zdelete" class="ed-wide">Remove zoom</button>');bind('v4-zoom-strength',v=>z.strength=+v/100);q('#v4-zsave').onclick=()=>{const a=+q('#v4-zstart').value*state.speed,b=+q('#v4-zend').value*state.speed;if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<=a||b>total())return notice('Choose times inside the video.');transaction(()=>{z.start=a;z.end=b;});};q('#v4-zpreview').onclick=()=>{state.time=z.start;play();};q('#v4-zdelete').onclick=()=>{timelineSelection={type:'zoom',id:z.id};deleteSelected();};}
  return true;
 }
 return false;
}
function paintV4(src){
 root.querySelectorAll('.vt-head').forEach(h=>h.style.left=state.time/(total()||1)*100+'%');
 paintV5(src);canvasV6(src);
 for(const e of state.elements.filter(e=>e.tracking)){
  const el=root.querySelector('.ed-layer[data-id="'+e.id+'"]');if(!el)continue;let r=src.clip.asset===e.tracking.asset?M.trackingAt(e.tracking,src.t):null;if(r&&!r.lost){const pad=.015;r={...r,x:Math.max(0,r.x-pad),y:Math.max(0,r.y-pad),width:Math.min(1,r.x+r.width+pad)-Math.max(0,r.x-pad),height:Math.min(1,r.y+r.height+pad)-Math.max(0,r.y-pad)};}el.hidden=!r||previewOriginal||!!state.hiddenTracks?.effects;if(!r)continue;
  const a=state.assets.find(a=>a.id===src.clip.asset),canvas=q('#ed-canvas'),w=canvas.clientWidth,h=canvas.clientHeight,scale=(state.fit==='cover'?Math.max:Math.min)(w/a.width,h/a.height),vw=a.width*scale,vh=a.height*scale;
  el.style.left=((w-vw)/2+(r.x+r.width/2)*vw)/w*100+'%';el.style.top=((h-vh)/2+(r.y+r.height/2)*vh)/h*100+'%';el.style.width=(r.width*vw/w*100)+'%';el.style.height=(r.height*vh/h*100)+'%';el.style.opacity=1;el.style.scale=1;el.style.translate='';
 }
}
function wireV4(){
 q('#ed-captions').ondblclick=()=>{const src=source(),i=state.transcript.findIndex(l=>l.asset===src.clip.asset&&src.t>=l.start&&src.t<l.end);if(i>=0){stop();selectCaption(i);q('#v4-caption-text')?.focus();}};
 root.tabIndex=-1;onKeyV9(ev=>{if(['INPUT','TEXTAREA','SELECT'].includes(ev.target.tagName)||ev.target.isContentEditable)return;if((ev.key==='Delete'||ev.key==='Backspace')&&!ev.metaKey&&!ev.ctrlKey){ev.preventDefault();deleteSelected();}if(['ArrowLeft','ArrowRight'].includes(ev.key)&&!ev.metaKey&&!ev.ctrlKey){ev.preventDefault();stop();state.time=M.frameStep(state,state.time,(ev.key==='ArrowLeft'?-1:1)*(ev.shiftKey?10:1));paint();commit();}});
}

const V5=window.editorModelV5,visualsV5=new Map();
function layoutV5(){
 const layout=q('.ed-layout');if(!q('#v5-library')){const library=document.createElement('aside');library.id='v5-library';library.className='ed-panel';layout.prepend(library);layout.append(q('.ed-timeline'));const bar=document.createElement('div');bar.id='v5-canvasbar';bar.innerHTML='<button id="v5-canvas">Canvas</button><span id="v5-ratio"></span><button id="v5-before">Hold to see original</button>';q('.ed-main').prepend(bar);q('#v5-canvas').onclick=()=>open('canvas');q('#v5-before').onpointerdown=()=>{previewOriginal=true;paint();};for(const event of ['pointerup','pointerleave','pointercancel'])q('#v5-before')[`on${event}`]=()=>{previewOriginal=false;paint();};}
 const controls=q('#ed-panel');q('#v5-library').hidden=true;controls.classList.add('v5-browse');q('#v5-ratio').textContent=ratioLabelV9(state.ratio)+' · '+(state.fit==='cover'?'Fill':'Fit');
}
function libraryV5(){const lib=q('#v5-library');lib.innerHTML='<h3>Project media</h3><p>Preview a source or add another clip.</p>'+state.assets.filter(a=>a.kind!=='audio').map(a=>'<article class="v5-media"><button class="v5-poster" data-media-preview="'+a.id+'" aria-label="Preview '+esc(a.name)+'">'+icon('play')+'</button><strong>'+esc(a.name)+'</strong><button data-add="'+a.id+'">Add to timeline</button></article>').join('')+'<button id="v5-library-add" class="ed-wide">Add files</button>';lib.querySelectorAll('[data-media-preview]').forEach(b=>b.onclick=()=>window.previewMediaV5?.(state.assets.find(a=>a.id===b.dataset.mediaPreview)));lib.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>appendAsset(b.dataset.add));q('#v5-library-add').onclick=()=>window.nativeImport(false);hydrateVisualsV5();}
function panelV4(p){
 if(state.panel==='media'){
 p.innerHTML='<h3>Your media</h3><p>Click a thumbnail to preview. Add places another copy on the timeline.</p><button id="ed-import" class="ed-wide primary">'+icon('upload')+' Add files</button><div class="v5-media-grid">'+state.assets.map(a=>'<article class="v5-media"><button class="v5-poster" data-media-preview="'+a.id+'" aria-label="Preview '+esc(a.name)+'">'+icon(a.kind==='audio'?'audio-lines':'play')+'</button><strong>'+esc(a.name)+'</strong><small>'+(a.kind==='image'?'Image':window.timelineModelV7.formatTime(a.duration||0))+' · '+(a.width?(a.width>a.height?'Landscape':a.width<a.height?'Portrait':'Square'):a.kind)+'</small><div class="ed-row"><button data-asset="'+a.id+'">Add</button><button data-delete-asset="'+a.id+'">Delete</button></div></article>').join('')+'</div>';
 q('#ed-import').onclick=()=>window.nativeImport(false);p.querySelectorAll('[data-asset]').forEach(b=>b.onclick=()=>appendAsset(b.dataset.asset));p.querySelectorAll('[data-delete-asset]').forEach(b=>b.onclick=()=>transaction(()=>Object.assign(state,M.removeAsset(state,b.dataset.deleteAsset))));p.querySelectorAll('[data-media-preview]').forEach(b=>b.onclick=()=>window.previewMediaV5?.(state.assets.find(a=>a.id===b.dataset.mediaPreview)));hydrateVisualsV5();return true;
 }
 if(state.panel==='canvas'){
 p.innerHTML='<h3>Canvas</h3><p>Choose where this video will be shared. Fit preserves the full frame; Fill crops to the canvas.</p>'+select('v5-ratio-select','Shape',[[state.originalRatio||'16/9','Original'],['16/9','16:9 · Presentation'],['9/16','9:16 · Vertical'],['1/1','1:1 · Square'],['4/5','4:5 · Portrait'],['custom','Custom']],state.ratio)+select('v5-fit','Framing',[['contain','Fit · whole frame'],['cover','Fill · crop edges']],state.fit||'contain')+'<details><summary>Custom dimensions</summary><label>Width<input id="v5-width" type="number" min="100" max="4096" value="1920"></label><label>Height<input id="v5-height" type="number" min="100" max="4096" value="1080"></label><button id="v5-custom">Apply size</button></details>';
 q('#v5-ratio-select').onchange=e=>{if(e.target.value!=='custom')transaction(()=>state.ratio=e.target.value);else p.querySelector('details').open=true;};q('#v5-fit').onchange=e=>transaction(()=>state.fit=e.target.value);q('#v5-custom').onclick=()=>{const w=+q('#v5-width').value,h=+q('#v5-height').value;if(w<100||h<100||w>4096||h>4096||w/h<.25||w/h>4)return notice('Choose dimensions from 100 to 4096, with a ratio between 1:4 and 4:1.');transaction(()=>state.ratio=w+'/'+h);};return true;
 }
 if(state.panel==='adjustments'){
 const selected=state.clips[state.selected];const a=selected?.adjustments||{};p.innerHTML='<h3>Adjustments</h3><p>Adjust your footage gently. Hold “see original” above the preview to compare.</p>'+[['exposure','Exposure',-50,50],['contrast','Contrast',-50,50],['saturation','Saturation',-100,100],['temperature','Warmth',-50,50]].map(([k,n,min,max])=>range('v5-'+k,n,a[k]||0,min,max)).join('')+'<button id="v5-reset" class="ed-wide">Reset adjustments</button>';for(const k of ['exposure','contrast','saturation','temperature'])bind('v5-'+k,v=>{if(selected)selected.adjustments={...selected.adjustments,[k]:+v};});q('#v5-reset').onclick=()=>transaction(()=>{if(selected)selected.adjustments={};state.colour=false;});return true;
 }
 if(state.panel==='effects'){
 p.innerHTML='<h3>Effects</h3><p>Bring attention to a detail or protect information.</p><div class="v5-effects">'+[['zoom','scan','Focus & zoom'],['blur','droplets','Blur region'],['tracking-blur','scan-eye','Tracking blur'],['cover','square','Solid cover']].map(([id,i,n])=>'<button data-v5-effect="'+id+'">'+icon(i)+'<span>'+n+'</span></button>').join('')+'</div>';p.querySelectorAll('[data-v5-effect]').forEach(b=>b.onclick=()=>b.dataset.v5Effect==='zoom'?open('zoom'):addElement(b.dataset.v5Effect));return true;
 }
 if(state.panel==='transitions'||state.panel==='transition'){
 const c=state.clips[selectedBoundary],t=c?.transitionIn||{type:'cut',duration:.5};p.innerHTML='<h3>Transitions</h3><p>Choose a clip boundary, then a transition. Short clips limit the duration automatically.</p>'+select('v5-boundary','Between clips',state.clips.slice(1).map((c,i)=>[i+1,(i+1)+' → '+(i+2)+' · '+c.name]),selectedBoundary)+'<details open><summary>Recommended</summary><div class="v5-transitions">'+V5.transitions.filter(([k])=>['cut','dissolve','black','slide-left'].includes(k)).map(transitionTileV5).join('')+'</div></details><details><summary>All '+V5.transitions.length+' transitions</summary><div class="v5-transitions">'+V5.transitions.map(transitionTileV5).join('')+'</div></details>'+'<label>Duration (seconds)<input id="v4-transition-duration" type="number" min=".2" max="2" step=".1" value="'+t.duration+'"></label>'+'<button id="v4-transition-preview" class="ed-wide">Preview transition</button><button id="v5-transition-all" class="ed-wide">Apply to all boundaries</button>';
 q('#v5-boundary').onchange=e=>{selectedBoundary=+e.target.value;panel();};p.querySelectorAll('[data-v5-transition]').forEach(b=>{b.classList.toggle('active',b.dataset.v5Transition===t.type);b.disabled=!c;b.onclick=()=>transaction(()=>{c.transitionIn={type:b.dataset.v5Transition,duration:t.duration};state.transition='cut';});});q('#v4-transition-duration').onchange=e=>{if(c)transaction(()=>c.transitionIn={...t,duration:Math.max(.2,Math.min(2,+e.target.value||.5))});};q('#v5-transition-all').disabled=!c;q('#v5-transition-all').onclick=()=>transaction(()=>state.clips.slice(1).forEach(c=>c.transitionIn={...t}));q('#v4-transition-preview').disabled=!c;q('#v4-transition-preview').onclick=()=>{stop();state.time=Math.max(0,state.clips.slice(0,selectedBoundary).reduce((n,c)=>n+c.end-c.start,0)-state.speed);play();};animateTilesV5(p);return true;
 }
 return panelV4Base(p);
}
function transitionTileV5([k,n]){return '<button data-v5-transition="'+k+'" title="'+n+'"><span class="v5-transition-demo"><i>A</i><b>B</b></span><small>'+n+'</small></button>';}
function animateTilesV5(p){p.querySelectorAll('[data-v5-transition]').forEach(b=>{let raf;const run=ts=>{if(!b.isConnected)return;const p=(ts%1800)/1800,k=b.dataset.v5Transition,x=V5.transforms(k,p);Object.assign(b.querySelector('i').style,x.outgoing);Object.assign(b.querySelector('b').style,x.incoming);if(['black','white','cut'].includes(k))b.querySelector('b').style.opacity=p>.5?1:0;raf=requestAnimationFrame(run);};b.onmouseenter=()=>raf=requestAnimationFrame(run);b.onmouseleave=()=>{cancelAnimationFrame(raf);b.querySelector('i').removeAttribute('style');b.querySelector('b').removeAttribute('style');};});}
function decorateV5(p){
 if(state.panel==='captions'&&!q('#v5-language')){const c=state.captionLanguage||{};p.insertAdjacentHTML('afterbegin','<div id="v5-language">'+select('v5-language-select','Spoken language',[['auto','Automatic'],['en','English'],['hi','Hindi / Hindi + English']],c.language||'auto')+select('v5-script','Caption script',[['original','Original script'],['roman','Roman Hindi · Aap kaise hain?']],c.script||'original')+'<p>Roman Hindi keeps Hindi words in English letters. Review names and spelling after generation.</p></div>');for(const id of ['v5-language-select','v5-script'])q('#'+id).onchange=()=>transaction(()=>state.captionLanguage={language:q('#v5-language-select').value,script:q('#v5-script').value});}
 if(state.panel==='element'&&!q('#v5-weight')){const e=state.elements.find(e=>e.id===state.active);if(e&&!e.tracking&&!e.kind.startsWith('icon-')&&!['blur','cover'].includes(e.kind)){p.insertAdjacentHTML('beforeend',select('v5-weight','Weight',[[400,'Regular'],[500,'Medium'],[600,'Semibold'],[700,'Bold']],e.weight||600)+select('v5-align','Alignment',[['left','Left'],['center','Centre'],['right','Right']],e.align||'center')+'<label>Background<input id="v5-background" type="color" value="'+(/^#[0-9a-f]{6}$/i.test(e.background||'')?e.background:'#ffffff')+'"></label>');bind('v5-weight',v=>e.weight=+v);bind('v5-align',v=>e.align=v);bind('v5-background',v=>e.background=v);}}
 if(state.panel==='audio'&&!q('#v5-replace')){p.insertAdjacentHTML('beforeend','<hr><button id="v5-replace" class="ed-wide">Import replacement narration</button><p>Replacement narration mutes the original clip audio. You can restore it on the Audio track.</p>');q('#v5-replace').onclick=()=>window.replaceNarrationV5?.();p.insertAdjacentHTML('beforeend','<button id="v5-restore-audio" class="ed-wide">Restore original clip audio</button>');q('#v5-restore-audio').onclick=()=>transaction(()=>{state.clips.forEach(c=>c.muted=false);state.hiddenTracks={...state.hiddenTracks,audio:false};});}
 p.querySelectorAll('[data-element]').forEach(b=>{b.classList.add('v5-template');const k=b.dataset.element;if(['title','editorial','lower','quote','pointer','pill','number','badge','logo'].includes(k)){b.querySelector('span').textContent={title:'Your next big idea',editorial:'Less, but better.',lower:'Ananya · Product',quote:'“Make it clear.”',pointer:'Start here ↗',pill:'Good to know',number:'01',badge:'NEW',logo:'SC'}[k];b.dataset.kind=k;}});
}
function hydrateVisualsV5(){for(const a of state.assets){if(!['video','image','audio'].includes(a.kind))continue;if(!visualsV5.has(a.id)){visualsV5.set(a.id,null);root.querySelectorAll('[data-media-preview="'+a.id+'"]').forEach(n=>n.setAttribute('aria-busy','true'));window.native?.mediaVisuals(a.id).then(v=>{visualsV5.set(a.id,v);root.querySelectorAll('[data-media-preview="'+a.id+'"]').forEach(n=>{n.removeAttribute('aria-busy');if(!v.frames?.length)n.title='Thumbnail unavailable · click to preview';});applyVisualsV5(a.id,v);}).catch(()=>visualsV5.delete(a.id));}else if(visualsV5.get(a.id))applyVisualsV5(a.id,visualsV5.get(a.id));}}
function applyVisualsV5(id,v){root.querySelectorAll('[data-media-preview="'+id+'"]').forEach(n=>{if(v.frames?.length)n.innerHTML='<img class="v6-poster-image" alt="Video thumbnail" src="'+v.frames[0]+'">';});root.querySelectorAll('[data-visual-asset="'+id+'"]').forEach(n=>{if(n.querySelector('.v5-filmstrip')||!v.frames?.length)return;const strip=document.createElement('span');strip.className='v5-filmstrip';for(const src of v.frames){const img=document.createElement('img');img.src=src;strip.append(img);}n.prepend(strip);});root.querySelectorAll('[data-wave-asset="'+id+'"]').forEach(n=>{if(n.querySelector('.v5-wave')||!v.waveform)return;const wave=document.createElement('span');wave.className='v5-wave';v.waveform.forEach(x=>{const bar=document.createElement('i');bar.style.height=Math.max(5,x*100)+'%';wave.append(bar);});n.prepend(wave);});}
function decorateTracksV5(){
 const host=q('#vt-tracks');host.querySelectorAll('.vt-label').forEach(l=>{const name=l.textContent,key={Video:'video',Audio:'audio',Music:'music',Graphics:'graphics',Captions:'captions',Effects:'effects','Audio clip':'audio','Overlay':'overlay'}[name];if(!key)return;const b=document.createElement('button');b.className='v5-track-toggle';const off=state.hiddenTracks?.[key];b.innerHTML=icon(['audio','music'].includes(key)?(off?'volume-x':'volume-2'):(off?'eye-off':'eye'));b.title=(['audio','music'].includes(key)?'Mute / unmute ':'Hide / show ')+name;b.setAttribute('aria-label',b.title);b.onclick=()=>transaction(()=>{state.hiddenTracks={...state.hiddenTracks,[key]:!off};});l.append(b);const lock=document.createElement('button');const lane=l.nextElementSibling;const key2=lane.getAttribute('aria-label');lock.innerHTML=icon(state.lockedTracks?.[key2]?'lock':'lock-open');lock.title='Lock / unlock '+name;lock.onclick=()=>transaction(()=>{state.lockedTracks??={};state.lockedTracks[key2]=!state.lockedTracks[key2];});l.append(lock);});hydrateVisualsV5();
 if(!q('#v5-fit-timeline')){const b=document.createElement('button');b.id='v5-fit-timeline';b.textContent='Fit timeline';b.onclick=()=>{timelineScale=1;tracks();paint();q('#vt-scale').value=1;};q('.ed-timeline-top').append(b);}
}
function paintV5(src){
 const fade=q('#ed-fade'),tr=V5.transition(state,state.time);fade.style.opacity=tr&&['black','white'].includes(tr.type)?1-Math.abs(tr.p*2-1):0;fade.style.background=tr?.type==='white'?'#fff':'#000';const a=src.clip.adjustments||state.adjustments||{},screen=q('#ed-screen');screen.style.filter='none';for(const media of screen.querySelectorAll('video,img'))media.style.filter=previewOriginal?'none':'brightness('+((state.colour?1.08:1)*(1+(a.exposure||0)/100))+') contrast('+(1+(a.contrast||0)/100)+') saturate('+((state.colour?1.06:1)*(1+(a.saturation||0)/100))+') sepia('+Math.abs(a.temperature||0)/200+') hue-rotate('+((a.temperature||0)<0?180:0)+'deg)';screen.style.visibility=state.hiddenTracks?.video?'hidden':'';if(state.hiddenTracks?.effects&&!previewOriginal)screen.style.transform='none';q('#v5-ratio').textContent=ratioLabelV9(state.ratio)+' · '+(state.fit==='cover'?'Fill':'Fit');
}
function wireV5(){const nav=q('.ed-tabs');nav.innerHTML=[['media','folder','Media'],['elements','type','Text & graphics'],['captions','captions','Captions'],['audio','audio-lines','Audio'],['effects','sparkles','Effects'],['transitions','between-horizontal-start','Transitions'],['adjustments','sliders-horizontal','Adjustments'],['style','palette','Style']].map(([k,i,n])=>'<button data-panel="'+k+'">'+icon(i)+'<span>'+n+'</span></button>').join('');nav.querySelectorAll('button').forEach(b=>b.onclick=()=>open(b.dataset.panel));layoutV5();const timeline=q('.ed-timeline'),handle=document.createElement('div');handle.className='v5-resize';handle.title='Drag to resize timeline';// 0.10: both dividers can be dragged, and their positions are remembered between sessions.
 const grid=q('.ed-layout'),saved=(()=>{try{return JSON.parse(localStorage.getItem('vv-editor-layout'))||{};}catch{return{};}})(),remember=()=>{try{localStorage.setItem('vv-editor-layout',JSON.stringify(saved));}catch{}};
 const applyLayout=()=>{const box=grid.getBoundingClientRect();if(saved.timeline&&box.height)grid.style.setProperty('--v10-timeline-h',Math.max(170,Math.min(box.height-230,saved.timeline))+'px');if(saved.panel&&box.width)grid.style.setProperty('--v10-panel-w',Math.max(230,Math.min(Math.max(230,box.width-420),saved.panel))+'px');};
 handle.onpointerdown=e=>{const y=e.clientY,h=timeline.getBoundingClientRect().height;handle.setPointerCapture(e.pointerId);handle.onpointermove=v=>{saved.timeline=h+y-v.clientY;applyLayout();};handle.onpointerup=()=>{handle.onpointermove=null;remember();};};handle.ondblclick=()=>{delete saved.timeline;grid.style.removeProperty('--v10-timeline-h');remember();};timeline.prepend(handle);
 const side=document.createElement('div');side.className='v10-resize-x';side.title='Drag to resize the side panel';side.onpointerdown=e=>{const x=e.clientX,w=q('#ed-panel').getBoundingClientRect().width;side.setPointerCapture(e.pointerId);side.onpointermove=v=>{saved.panel=w+v.clientX-x;applyLayout();};side.onpointerup=()=>{side.onpointermove=null;remember();};};side.ondblclick=()=>{delete saved.panel;grid.style.removeProperty('--v10-panel-w');remember();};grid.append(side);
 requestAnimationFrame(applyLayout);window.addEventListener('resize',applyLayout);}

// Consistent selection and direct manipulation; persisted state also drives export.
function dragBlockV6(b,lane,type,id){
 const previous=b.onpointerdown;
 b.onpointerdown=ev=>{
  if(ev.button!==0||ev.target.closest('[data-trim],[data-transition],[data-reorder]'))return;
  ev.stopPropagation();previous(ev);stop();timelineFocus();
  let item=type==='element'?state.elements.find(x=>x.id===id):type==='zoom'?(state.zooms||[]).find(x=>x.id===id):type==='caption'?state.transcript[id]:null;
  if(!item||item.tracking)return;
  const side=ev.target.dataset.edge,original=structuredClone(item),x=ev.clientX,scale=total()/lane.getBoundingClientRect().width,rect=b.getBoundingClientRect();let changed=false;
  b.setPointerCapture(ev.pointerId);
  b.onpointermove=e=>{const delta=(e.clientX-x)*scale;if(Math.abs(e.clientX-x)<3&&!changed)return;if(!changed){snapshot();changed=true;}
   const limit=type==='caption'?(state.assets.find(a=>a.id===item.asset)?.duration||total()):total();
   const d=side==='start'?Math.max(-original.start,Math.min(original.end-original.start-.05,delta)):side==='end'?Math.max(original.start+.05-original.end,Math.min(limit-original.end,delta)):Math.max(-original.start,Math.min(limit-original.end,delta));
   item.start=original.start+(side==='end'?0:d);item.end=original.end+(side==='start'?0:d);
   if(original.words){if(!side)item.words=original.words.map(w=>({...w,start:w.start+d,end:w.end+d}));else delete item.words;}
   b.style.left=(rect.left-lane.getBoundingClientRect().left+(side==='end'?0:d/scale))+'px';b.style.width=(rect.width+(side==='start'?-d/scale:side==='end'?d/scale:0))+'px';paint();
  };
  const finish=()=>{b.onpointermove=null;if(changed){render();commit();}};b.onpointerup=finish;b.onpointercancel=()=>{Object.assign(item,original);finish();};
 };
 if(['element','caption','zoom'].includes(type))for(const side of ['start','end']){const h=document.createElement('span');h.className='v6-edge '+side;h.dataset.edge=side;b.append(h);}
}
function controlsV6(p){
 const destinations={element:'elements','caption-edit':'captions',zoom:'effects',transition:'transitions',clip:'media',canvas:'media'};
 if(destinations[state.panel]){const back=document.createElement('button');back.textContent='← Back';back.className='ed-wide';back.onclick=()=>open(destinations[state.panel]);p.prepend(back);}
 if(state.panel==='clip'){
  const c=state.clips[state.selected];if(!c)return;
  const box=document.createElement('section');box.innerHTML='<h3>Transform</h3>'+[['x','Position X',-100,100,0],['y','Position Y',-100,100,0],['scale','Scale',10,400,100],['rotation','Rotation',-180,180,0],['opacity','Opacity',0,100,100]].map(([k,n,min,max,value])=>range('v6-'+k,n,c.transform?.[k]??value,min,max)).join('')+'<button id="v6-reset">Reset transform</button>';p.prepend(box);
  for(const k of ['x','y','scale','rotation','opacity'])bind('v6-'+k,v=>{c.transform={...c.transform,[k]:+v};});q('#v6-reset').onclick=()=>transaction(()=>c.transform={});
 }
 p.querySelector('#v5-replace')?.remove();p.querySelector('#v5-restore-audio')?.remove();
 p.querySelectorAll('p').forEach(n=>{if(n.textContent.startsWith('Replacement narration'))n.remove();});
}
let multiV6=[],copyV6=null;
function itemV6(type,id){return type==='video'?state.clips[+id]:type==='source'?state.clips.find(c=>c.id===id):type==='element'?state.elements.find(x=>x.id===id):type==='caption'?state.transcript[+id]:type==='zoom'?(state.zooms||[]).find(x=>x.id===id):type==='audioClip'?(state.audioClips||[]).find(x=>x.id===id):type==='overlay'?(state.overlays||[]).find(x=>x.id===id):state[type];}
const originalDragV6=dragBlockV6;
dragBlockV6=function(b,lane,type,id){
 const select=b.onpointerdown;
 b.onpointerdown=ev=>{if(ev.button!==0||ev.target.closest('[data-trim],[data-transition],[data-reorder]'))return;ev.stopPropagation();if(state.lockedTracks?.[lane.getAttribute('aria-label')])return;stop();select(ev);paint();timelineFocus();
 if(ev.shiftKey){multiV6.push({type,id});b.classList.add('selected');return;}multiV6=[{type,id}];
 const item=itemV6(type,id);if(!item||item.tracking||type==='source')return;
 const side=ev.target.dataset.edge,old=clone(item),x=ev.clientX,scale=total()/lane.getBoundingClientRect().width,left=parseFloat(b.style.left),width=parseFloat(b.style.width),duration=total(),beforeClips=clone(state.clips);let changed=false;
 
 window.onpointermove=e=>{if(Math.abs(e.clientX-x)<4&&!changed)return;if(!changed){snapshot();changed=true;}let d=(e.clientX-x)*scale;
 if(type==='video'){b.style.translate=(e.clientX-x)+'px';return;}
 const max=type==='caption'?(state.assets.find(a=>a.id===old.asset)?.duration||duration):duration;
 if(!side){d=Math.max(-old.start,Math.min(Math.max(0,max-(old.end||duration)),d));item.start=old.start+d;item.end=(old.end||duration)+d;if(old.words)item.words=old.words.map(w=>({...w,start:w.start+d,end:w.end+d}));}
 else{const lim=side==='start'?old.end-.05:max;item[side]=Math.max(side==='start'?0:old.start+.05,Math.min(lim,old[side]+d));d=item[side]-old[side];if(type==='audioClip'||type==='overlay'){if(side==='start')item.sourceIn=Math.max(0,(old.sourceIn||0)+d);const a=state.assets.find(a=>a.id===item.asset);item.end=Math.min(item.end,item.start+(a?.duration||duration)-(item.sourceIn||0));}if(old.words)delete item.words;}
 b.style.left=(left+(side==='end'?0:d/duration*100))+'%';b.style.width=(width+(side==='start'?-d:side==='end'?d:0)/duration*100)+'%';paint();
 };
 window.onpointerup=e=>{window.onpointermove=null;window.onpointerup=null;if(changed&&type==='video'){let offset=0;const target=(e.clientX-lane.getBoundingClientRect().left)*scale;let to=state.clips.findIndex(c=>{offset+=c.end-c.start;return target<offset;});if(to<0)to=state.clips.length-1;const [c]=state.clips.splice(+id,1);state.clips.splice(to,0,c);state.selected=to;retimeV6(beforeClips);}window.onpointercancel=null;if(changed){render();commit();}};
 window.onpointercancel=()=>{window.onpointermove=null;window.onpointerup=null;window.onpointercancel=null;Object.assign(item,old);render();};
 };
 if(['element','caption','zoom','audioClip','overlay'].includes(type))for(const side of ['start','end']){const h=document.createElement('span');h.className='v6-edge '+side;h.dataset.edge=side;b.append(h);}
};
function extraTracksV6(row,block){for(const [key,type,label] of [['overlays','overlay','Overlay'],['audioClips','audioClip','Audio clip']])for(const a of state[key]||[]){const lane=row(label,'vt-'+(type==='overlay'?'video':'audio'));const b=block(lane,a.name||label,a.start,a.end,type,a.id,()=>{timelineSelection={type,id:a.id};state.active=a.id;open(type);});if(type==='overlay')b.dataset.visualAsset=a.asset;else b.dataset.waveAsset=a.asset;}}
function panelV6(p){
 if(state.panel==='clip'){
 const c=state.clips[state.selected];if(!c)return false;
 p.innerHTML='<h3>'+esc(c.name)+'</h3><p>Drag clip edges to trim. Drag the clip to reorder.</p><button id="v6-detach">Detach audio</button><button id="v6-duplicate">Duplicate clip</button><button id="v6-gap">Delete, keep gap</button><button id="v6-ripple">Delete & close gap</button><details><summary>Exact trim & playback</summary><label>Source in<input id="v6-in" type="number" step=".01" value="'+c.start+'"></label><label>Source out<input id="v6-out" type="number" step=".01" value="'+c.end+'"></label><button id="v6-trim">Apply trim</button>'+select('v6-speed','Project speed',[[.5,'0.5×'],[1,'1×'],[1.5,'1.5×'],[2,'2×']],state.speed)+'</details>';
 q('#v6-trim').onclick=()=>{const a=+q('#v6-in').value,b=+q('#v6-out').value;if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b-a<.05||b>c.limit)return notice('Use a range within the source.');transaction(()=>{c.start=a;c.end=b;});};bind('v6-speed',v=>state.speed=+v);
 p.insertAdjacentHTML('beforeend',select('v6-motion','Animation',[["none","None"],["zoom","Gentle zoom"],["fade","Fade in"]],c.motion||'none'));bind('v6-motion',v=>c.motion=v);q('#v6-detach').onclick=()=>transaction(()=>{if(!state.assets.find(a=>a.id===c.asset)?.hasAudio)return;state.audioClips??=[];let at=state.clips.slice(0,state.selected).reduce((n,x)=>n+x.end-x.start,0);state.audioClips.push({id:crypto.randomUUID(),asset:c.asset,name:c.name,start:at,end:at+c.end-c.start,sourceIn:c.start,volume:100});c.muted=true;});
 q('#v6-duplicate').onclick=()=>transaction(()=>state.clips.splice(state.selected+1,0,{...clone(c),id:crypto.randomUUID()}));
 q('#v6-gap').onclick=()=>transaction(()=>{c.gap=true;c.muted=true;c.name='Gap';});q('#v6-ripple').onclick=()=>{timelineSelection={type:'video',id:state.selected};deleteSelected();};return true;
 }
 if(['audioClip','overlay'].includes(state.panel)){
 const type=state.panel,a=itemV6(type,state.active);if(!a)return false;
 p.innerHTML='<h3>'+esc(a.name)+'</h3>'+range('v6-level',type==='overlay'?'Size %':'Volume %',type==='overlay'?(a.scale||35):(a.volume??100),0,type==='overlay'?100:150)+range('v6-fade-in','Fade in (seconds)',a.fadeIn||0,0,5)+range('v6-fade-out','Fade out (seconds)',a.fadeOut||0,0,5)+'<button id="v6-delete-object">Remove</button>';
 bind('v6-level',v=>a[type==='overlay'?'scale':'volume']=+v);bind('v6-fade-in',v=>a.fadeIn=+v);bind('v6-fade-out',v=>a.fadeOut=+v);q('#v6-delete-object').onclick=()=>{timelineSelection={type,id:a.id};deleteSelected();};return true;
 }
 return false;
}
function deleteV6(){const names={video:'Video',source:'Audio',element:'Graphics',caption:'Captions',zoom:'Effects',audioClip:'Audio clip',overlay:'Overlay'};if(timelineSelection&&state.lockedTracks?.[names[timelineSelection.type]+' track']){notice('Unlock this track to edit it.');return true;}const s=timelineSelection;if(!s)return false;if(multiV6.length>1){const chosen=multiV6.slice();multiV6=[];transaction(()=>{for(const x of chosen.filter(x=>x.type!=='video')){const k={element:'elements',zoom:'zooms',audioClip:'audioClips',overlay:'overlays'}[x.type];if(k)state[k]=state[k].filter(a=>a.id!==x.id);}for(const x of chosen.filter(x=>x.type==='caption').sort((a,b)=>b.id-a.id))state.transcript.splice(+x.id,1);for(const x of chosen.filter(x=>x.type==='video').sort((a,b)=>b.id-a.id))state.clips.splice(+x.id,1);timelineSelection=null;state.panel='media';});return true;}const key={audioClip:'audioClips',overlay:'overlays'}[s.type];if(!key)return false;transaction(()=>{state[key]=state[key].filter(x=>x.id!==s.id);timelineSelection=null;state.panel='media';});return true;}
const baseControlsV6=controlsV6;
controlsV6=function(p){baseControlsV6(p);
 if(state.panel==='media'){
 p.querySelectorAll('[data-asset]').forEach(b=>{const a=state.assets.find(x=>x.id===b.dataset.asset);if(a?.kind!=='audio'){const overlay=document.createElement('button');overlay.textContent='Overlay';overlay.onclick=()=>transaction(()=>{state.overlays??=[];state.overlays.push({id:crypto.randomUUID(),asset:a.id,name:a.name,start:state.time,end:Math.min(total(),state.time+(a.duration||5)),sourceIn:0,x:65,y:65,scale:35});});b.after(overlay);}});
 }
 if(state.panel==='captions'){
 p.insertAdjacentHTML('beforeend',select('v6-cap-group','Words per caption',[[3,'3 words'],[4,'4 words']],state.captionGroup||3)+'<details><summary>Correct captions</summary><div id="v6-caption-list"></div></details>');bind('v6-cap-group',v=>state.captionGroup=+v);const list=q('#v6-caption-list');state.transcript.forEach((line,i)=>{const b=document.createElement('button');b.className='ed-wide';b.textContent=line.text;b.onclick=()=>selectCaption(i);list.append(b);});
 }
 if(state.panel==='caption-edit'){
 const l=state.transcript[selectedCaption];if(l){p.insertAdjacentHTML('beforeend','<button id="v6-caption-split">Split at playhead</button><button id="v6-caption-merge">Merge with next</button>');q('#v6-caption-split').onclick=()=>{const src=source();if(src.clip.asset!==l.asset||src.t<=l.start||src.t>=l.end)return notice('Place playhead inside this caption.');transaction(()=>{const words=l.text.trim().split(/\s+/),cut=Math.max(1,Math.min(words.length-1,Math.round(words.length*(src.t-l.start)/(l.end-l.start))));if(words.length<2)return;state.transcript.splice(selectedCaption,1,{...l,end:src.t,text:words.slice(0,cut).join(' '),words:undefined},{...l,start:src.t,text:words.slice(cut).join(' '),words:undefined});});};q('#v6-caption-merge').onclick=()=>{const next=state.transcript[selectedCaption+1];if(!next||next.asset!==l.asset)return notice('No following caption from this source.');transaction(()=>state.transcript.splice(selectedCaption,2,{...l,end:next.end,text:l.text+' '+next.text,words:undefined}));};}
 }
 // No duplicate Privacy library; effects live in one place.
 p.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='Privacy')b.remove();});
};
function canvasV6(src){
 const canvas=q('#ed-canvas');let box=q('#v6-transform-box');if(!box){box=document.createElement('div');box.id='v6-transform-box';box.innerHTML='<button type="button" class="v6-corner" aria-label="Scale selected clip" title="Drag to scale"></button><button type="button" class="v6-rotate" aria-label="Rotate selected clip" title="Drag to rotate">↻</button>';canvas.append(box);box.onpointerdown=ev=>{if(ev.button!==0)return;ev.preventDefault();ev.stopPropagation();stop();snapshot();const c=state.clips[state.selected];if(!c)return;const old={x:0,y:0,scale:100,rotation:0,...c.transform},rect=canvas.getBoundingClientRect(),x=ev.clientX,y=ev.clientY,mode=ev.target.className;box.setPointerCapture(ev.pointerId);box.onpointermove=e=>{const dx=(e.clientX-x)/rect.width*100,dy=(e.clientY-y)/rect.height*100;c.transform={...old};if(mode==='v6-corner')c.transform.scale=Math.max(10,Math.min(400,old.scale+dx*2));else if(mode==='v6-rotate')c.transform.rotation=Math.max(-180,Math.min(180,old.rotation+dx*2));else{c.transform.x=old.x+dx;c.transform.y=old.y+dy;}paint();};box.onpointerup=()=>{box.onpointermove=null;panel();commit();};box.onpointercancel=()=>{box.onpointermove=null;c.transform=old;paint();panel();commit();};};}
 box.hidden=window.exporting||state.panel!=='clip'||src.index!==state.selected||!!src.clip.gap;
 const t=src.clip.transform||{};box.style.transform='translate('+(t.x||0)+'%,'+(t.y||0)+'%) rotate('+(t.rotation||0)+'deg) scale('+((t.scale??100)/100)+')';
 if(src.clip.gap)q('#ed-captions').hidden=true;
}
function wireV6(){
 onKeyV9(ev=>{if(['INPUT','TEXTAREA','SELECT'].includes(ev.target.tagName))return;if(!(ev.metaKey||ev.ctrlKey))return;
 if(ev.key.toLowerCase()==='c'){copyV6=(multiV6.length?multiV6:[timelineSelection]).filter(s=>s&&['video','element','zoom','audioClip','overlay'].includes(s.type)&&itemV6(s.type,s.id)).map(s=>({type:s.type,item:clone(itemV6(s.type,s.id))}));ev.preventDefault();}
 if(ev.key.toLowerCase()==='v'&&copyV6){ev.preventDefault();transaction(()=>{for(const {type,item} of copyV6){item.id=crypto.randomUUID();if(type==='video')state.clips.splice(state.selected+1,0,clone(item));else{const key={element:'elements',zoom:'zooms',audioClip:'audioClips',overlay:'overlays'}[type];if(!key)continue;const d=item.end-item.start;item.start=state.time;item.end=Math.min(total(),item.start+d);state[key]??=[];state[key].push(clone(item));}}});}
 });
}

const fullVisualsV6=applyVisualsV5,rangeVisualsV15=new Map();
applyVisualsV5=function(id,v){fullVisualsV6(id,v);root.querySelectorAll('[data-visual-asset="'+id+'"],[data-wave-asset="'+id+'"]').forEach(b=>{let c=b.dataset.clip!=null?state.clips[+b.dataset.clip]:null;if(!c&&b.classList.contains('vt-item-source'))c=state.clips.find(x=>x.id===b.dataset.sourceClip);if(!c||!window.native)return;const key=id+':'+c.start+':'+c.end;if(b.dataset.range===key)return;b.dataset.range=key;const draw=r=>{if(!b.isConnected||b.dataset.range!==key)return;const strip=b.querySelector('.v5-filmstrip');if(strip&&r.frames?.length)strip.innerHTML=r.frames.map(src=>'<img src="'+src+'">').join('');const wave=b.querySelector('.v5-wave');if(wave&&r.waveform)wave.innerHTML=r.waveform.map(x=>'<i style="height:'+Math.max(5,x*100)+'%"></i>').join('');};
  // 0.15: thumbnails and waveforms are kept per clip range, so a redraw paints them at once instead of asking again.
  const known=rangeVisualsV15.get(key);if(known&&!(known instanceof Promise)){draw(known);return;}
  const task=known||window.native.mediaVisuals(id,{start:c.start,end:c.end}).then(r=>{rangeVisualsV15.set(key,r);return r;},e=>{rangeVisualsV15.delete(key);throw e;});rangeVisualsV15.set(key,rangeVisualsV15.get(key)||task);task.then(draw).catch(()=>{});});};
function retimeV6(before,refs){window.timelineRetime.retime(before,state,refs);}

const V7=window.timelineModelV7;
let selectionV7=[];
const trackKeysV7={element:'elements',zoom:'zooms',audioClip:'audioClips',overlay:'overlays'};
const sameRefV7=(a,b)=>a.type===b.type&&a.id===b.id;
function normalizeV7(){const ids=new Set();for(const l of state.transcript){if(!l.id||ids.has(l.id))l.id=crypto.randomUUID();ids.add(l.id);}}
function itemV7(ref){if(ref.type==='video')return state.clips.find(c=>c.id===ref.id);if(ref.type==='caption')return state.transcript.find(l=>l.id===ref.id);return trackKeysV7[ref.type]?state[trackKeysV7[ref.type]]?.find(e=>e.id===ref.id):state[ref.type];}
function lockedV7(ref){const names={video:'Video',caption:'Captions',element:['cover','blur','tracking-blur'].includes(itemV7(ref)?.kind)?'Effects':'Graphics',zoom:'Effects',audioClip:'Audio clip',overlay:'Overlay',music:'Music',voiceover:'Narration'};return !!state.lockedTracks?.[names[ref.type]+' track'];}
function cleanSelectionV7(){selectionV7=selectionV7.filter(s=>itemV7(s));multiV6=[];}
function markSelectionV7(){cleanSelectionV7();q('#vt-tracks')?.querySelectorAll('[data-v7-type]').forEach(b=>{const on=selectionV7.some(s=>s.type===b.dataset.v7Type&&s.id===b.dataset.v7Id);b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on);});const count=q('#v7-selection-count');if(count)count.textContent=selectionV7.length?selectionV7.length+' selected':'';}
function primaryV7(ref,at,clickTime){
 const item=itemV7(ref);if(!item)return;previewOriginal=false;previewEffect=null;
 const bar=document.querySelector('#flow-reviewbar');if(bar)bar.hidden=true;
 let name;
 if(ref.type==='video'){
  state.selected=state.clips.findIndex(c=>c.id===ref.id);timelineSelection={type:'video',id:state.selected};name='clip';
  const start=V7.duration(state.clips.slice(0,state.selected)),end=start+item.end-item.start;
  if(state.time<start||state.time>=end)state.time=Number.isFinite(clickTime)?Math.max(start,Math.min(end-.001,clickTime)):start;
 }else if(ref.type==='caption'){
  selectedCaption=state.transcript.findIndex(l=>l.id===ref.id);timelineSelection={type:'caption',id:selectedCaption};name='caption-edit';state.captions=true;
  const ranges=M.occurrences(state,item),r=ranges.find(r=>at!=null&&at>=r.start-.001&&at<r.end)||ranges.find(r=>state.time>=r.start&&state.time<r.end)||ranges[0];
  if(r&&(state.time<r.start||state.time>=r.end))state.time=r.start+.0001;
 }else{timelineSelection=ref;state.active=ref.id;name=ref.type==='element'?'element':ref.type==='zoom'?'zoom':['audioClip','overlay'].includes(ref.type)?ref.type:'audio';if(ref.type==='zoom')selectedZoom=ref.id;}
 window.v5PointerSelecting=true;try{open(name);}finally{window.v5PointerSelecting=false;}paint();markSelectionV7();
}
let activePointerV7=null;
function pointerV7(move,finish,cancel,origin){
 activePointerV7?.();let ended=false;
 const matches=e=>origin?.pointerId==null||e.pointerId===origin.pointerId;
 const cleanup=()=>{ended=true;if(activePointerV7===abort)activePointerV7=null;window.removeEventListener('pointermove',drag);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancelPointer);window.removeEventListener('pointerdown',abort,true);window.removeEventListener('blur',abort);};
 const abort=e=>{if(ended)return;cleanup();cancel?.(e);};
 const drag=e=>{if(!matches(e)||ended)return;if(!(e.buttons&1))return abort(e);move(e);};
 const up=e=>{if(!matches(e)||ended)return;cleanup();finish(e);};
 const cancelPointer=e=>{if(matches(e))abort(e);};
 activePointerV7=abort;window.addEventListener('pointermove',drag);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancelPointer);window.addEventListener('pointerdown',abort,true);window.addEventListener('blur',abort);
}
function clearGhostsV7(){q('#vt-tracks')?.querySelectorAll('.vt-block').forEach(b=>b.style.translate='');q('#v7-insert-marker')?.remove();}
function indicatorV7(lane,time){let n=q('#v7-insert-marker');if(!n){n=document.createElement('span');n.id='v7-insert-marker';lane.append(n);}n.style.left=time/(total()||1)*100+'%';}
function translateSelectionV7(delta,chosen){
 for(const ref of chosen){const e=itemV7(ref);if(!e||e.tracking||ref.type==='video')continue;e.start+=delta;if(Number.isFinite(e.end))e.end+=delta;if(e.words)e.words=e.words.map(w=>({...w,start:w.start+delta,end:w.end+delta}));}
}
function moveSelectionV7(delta,index){
 const videos=selectionV7.filter(s=>s.type==='video').map(s=>s.id);
 if(videos.length){
  const extras=selectionV7.filter(s=>trackKeysV7[s.type]&&!itemV7(s)?.tracking).map(ref=>({ref,item:clone(itemV7(ref))}));
  const first=state.clips.findIndex(c=>videos.includes(c.id)),oldStart=V7.duration(state.clips.slice(0,first));
  const input={...state};for(const key of Object.values(trackKeysV7))input[key]=(state[key]||[]).filter(e=>!extras.some(x=>trackKeysV7[x.ref.type]===key&&x.item.id===e.id));
  const next=V7.reorder(input,videos,index),shift=next.time-oldStart;
  if(next===input)return;
  for(const {ref,item}of extras){item.start=Math.max(0,item.start+shift);item.end=item.start+(itemV7(ref).end-itemV7(ref).start);next[trackKeysV7[ref.type]].push(item);}
  transaction(()=>Object.assign(state,next));
 }else transaction(()=>translateSelectionV7(delta,selectionV7));
 markSelectionV7();
}
dragBlockV6=function(b,lane,type,id){
 const ref=type==='video'?{type,id:state.clips[+id].id}:type==='source'?{type:'video',id}:{type,id:type==='caption'?state.transcript[+id].id:id};
 b.dataset.v7Type=ref.type;b.dataset.v7Id=ref.id;
 b.onpointerdown=ev=>{
  if(ev.button!==0||ev.target.closest('[data-trim],[data-transition]'))return;ev.preventDefault();ev.stopPropagation();if(lockedV7(ref))return notice('Unlock this track to edit it.');stop();
  if(ev.shiftKey||ev.metaKey){selectionV7=selectionV7.some(s=>sameRefV7(s,ref))?selectionV7.filter(s=>!sameRefV7(s,ref)):[...selectionV7,ref];markSelectionV7();timelineFocus();return;}
  if(!selectionV7.some(s=>sameRefV7(s,ref)))selectionV7=[ref];{const r=lane.getBoundingClientRect();primaryV7(ref,+b.dataset.v7Start,(ev.clientX-r.left)/r.width*total());}timelineFocus();
  const x=ev.clientX,rect=lane.getBoundingClientRect(),seconds=(total()||1)/rect.width,old=clone(itemV7(ref)),edge=ev.target.closest('[data-edge]')?.dataset.edge;
  // 0.15: a tracking blur can't be moved in time (it follows the tracked footage), but both its ends can be trimmed.
  if(!old||(old.tracking&&!edge))return;
  let moved=false,delta=0,index=0,liftV15=null;
  pointerV7(e=>{
   // 0.15: a drag starts after 4 px in any direction, so dragging a clip straight up to another track works.
   if(Math.hypot(e.clientX-x,e.clientY-ev.clientY)<4&&!moved)return;moved=true;delta=(e.clientX-x)*seconds;
   const host=q('#vt-tracks'),bounds=host.getBoundingClientRect();if(e.clientX>bounds.right-25)host.scrollLeft+=16;if(e.clientX<bounds.left+110)host.scrollLeft-=16;
   if(edge){delta=edgeDeltaV15(ref,old,edge,delta,seconds,e,b);const len=(+b.dataset.v7End)-(+b.dataset.v7Start);b.style.width=(len+(edge==='start'?-delta:delta))/total()*100+'%';if(edge==='start')b.style.left=(Number(b.dataset.v7Start)+delta)/total()*100+'%';dragTipV15(e,len+(edge==='start'?-delta:delta));return;}
   if(selectionV7.some(s=>s.type==='video')){liftV15=liftTargetV15(e,(+b.dataset.v7Start)+delta);if(liftV15)q('#v7-insert-marker')?.remove();else{const videoLane=q('.vt-video'),r=videoLane.getBoundingClientRect();index=V7.boundary(state.clips,(e.clientX-r.left)/r.width*total());indicatorV7(videoLane,V7.duration(state.clips.slice(0,index)));}}
   else{let lo=-Infinity,hi=Infinity;for(const s of selectionV7){const v=itemV7(s);if(!v||v.tracking)continue;lo=Math.max(lo,-v.start);const limit=s.type==='caption'?(state.assets.find(a=>a.id===v.asset)?.duration||total()):total();hi=Math.min(hi,limit-(v.end||v.start));}const anchor=Number(b.dataset.v7Start),points=[0,total(),state.time];q('#vt-tracks').querySelectorAll('[data-v7-start]:not(.selected)').forEach(n=>points.push(+n.dataset.v7Start,+n.dataset.v7End));points.push(...clipEdgesV15());const one=selectionV7.length===1?neighbourLimitsV15(ref,+b.dataset.v7Start,+b.dataset.v7End):null;if(one){lo=Math.max(lo,one.lo-(+b.dataset.v7Start));hi=Math.min(hi,one.hi-(+b.dataset.v7End));}delta=snapDeltaV15(anchor,+b.dataset.v7End,delta,points,seconds*8,e);delta=Math.max(lo,Math.min(hi,delta));}
   q('#vt-tracks').querySelectorAll('.vt-block.selected').forEach(n=>n.style.translate=delta/seconds+'px');
  },()=>{clearGhostsV7();hideSnapLineV15();dragTipV15(null);clearLiftV15();if(moved){if(edge)transaction(()=>applyEdgeV15(ref,old,edge,delta));else if(liftV15)liftClipV15(selectionV7.filter(s=>s.type==='video').map(s=>s.id),liftV15.track,liftV15.at);else moveSelectionV7(delta,index);}markSelectionV7();},()=>{clearGhostsV7();hideSnapLineV15();dragTipV15(null);clearLiftV15();tracks();paint();},ev);
 };
 b.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();if(!selectionV7.some(s=>sameRefV7(s,ref)))selectionV7=[ref];primaryV7(ref,+b.dataset.v7Start);contextV7(e.clientX,e.clientY);};
 if(ref.type==='caption')b.ondblclick=()=>{primaryV7(ref,+b.dataset.v7Start);q('#v4-caption-text')?.focus();};
 if(['element','caption','zoom','audioClip','overlay','music'].includes(type))for(const side of ['start','end']){const h=document.createElement('span');h.className='v6-edge '+side;h.dataset.edge=side;b.append(h);}
};
function marqueeV7(ev){
 if(ev.button!==0||ev.target.closest('button,input,.vt-label,.vt-ruler,.vt-head'))return;
 ev.preventDefault();stop();timelineFocus();const x=ev.clientX,y=ev.clientY,prior=ev.shiftKey?selectionV7.slice():[];let moved=false;
 const box=document.createElement('div');box.className='v7-marquee';document.body.append(box);
 pointerV7(e=>{if(Math.hypot(e.clientX-x,e.clientY-y)<4&&!moved)return;moved=true;const left=Math.min(x,e.clientX),top=Math.min(y,e.clientY),right=Math.max(x,e.clientX),bottom=Math.max(y,e.clientY);Object.assign(box.style,{left:left+'px',top:top+'px',width:right-left+'px',height:bottom-top+'px'});selectionV7=prior.slice();
  q('#vt-tracks').querySelectorAll('[data-v7-type]').forEach(b=>{const r=b.getBoundingClientRect(),ref={type:b.dataset.v7Type,id:b.dataset.v7Id};if(r.right>=left&&r.left<=right&&r.bottom>=top&&r.top<=bottom&&!lockedV7(ref)&&!selectionV7.some(s=>sameRefV7(s,ref)))selectionV7.push(ref);});markSelectionV7();
 },e=>{box.remove();if(!moved){selectionV7=[];seekTimeline(e,q('.vt-video'));commit();}else if(selectionV7[0])primaryV7(selectionV7[0]);markSelectionV7();},()=>{box.remove();selectionV7=prior;markSelectionV7();},ev);
}
wireLane=function(lane){
 lane.onpointerdown=ev=>{if(ev.button!==0)return;if(lane.classList.contains('vt-ruler')||ev.target.closest('.vt-head')){ev.preventDefault();ev.stopPropagation();stop();timelineFocus();seekTimeline(ev,lane);pointerV7(e=>seekTimeline(e,lane),()=>commit(),()=>commit(),ev);}else marqueeV7(ev);};
 lane.ondragover=ev=>{if(!ev.dataTransfer.types.includes('application/x-video-visor-media'))return;ev.preventDefault();ev.dataTransfer.dropEffect='copy';const r=lane.getBoundingClientRect();indicatorV7(lane,Math.max(0,Math.min(total(),(ev.clientX-r.left)/r.width*total())));};
 lane.ondragleave=()=>q('#v7-insert-marker')?.remove();
 lane.ondrop=ev=>{const id=ev.dataTransfer.getData('application/x-video-visor-media');if(!id)return;ev.preventDefault();ev.stopPropagation();const r=lane.getBoundingClientRect();state.time=Math.max(0,Math.min(total(),(ev.clientX-r.left)/r.width*total()));q('#v7-insert-marker')?.remove();appendAsset(id,state.time);};
};
const tracksBeforeV7=tracks;
tracks=function(){normalizeV7();tracksBeforeV7();const host=q('#vt-tracks'),surface=host.querySelector('.vt-surface');let pad=document.createElement('div');pad.className='v7-select-space';pad.textContent='Drag in empty space to select clips';surface.append(pad);host.onpointerdown=e=>{if(e.target===host||e.target===surface||e.target===pad)marqueeV7(e);};
 if(!q('#v7-actions')){const b=document.createElement('button');b.id='v7-actions';b.textContent='Clip actions';b.onclick=()=>{const r=b.getBoundingClientRect();contextV7(r.left,r.bottom);};q('.ed-timeline-top').append(b);const count=document.createElement('span');count.id='v7-selection-count';q('.ed-timeline-top').append(count);}
 q('.vt-controls span').textContent='Drag ruler to scrub · Drag empty space to select · Shift-click to add · Delete removes selection';markSelectionV7();
};
// 0.9: "Add" puts footage at the end of the timeline. Dropping onto the timeline passes a time and inserts
// there (the model snaps to a clip edge rather than leave a sliver). Audio goes at the playhead and never
// runs past the end of the video.
appendAsset=function(id,at){const a=state.assets.find(a=>a.id===id);if(!a)return;if(a.kind==='audio'){if(!state.clips.some(c=>c.asset!=='blank'))return notice('Add footage first.');const whole=total();let start=at==null?state.time:at;if(start>whole-.25)start=0;const end=Math.min(whole,start+a.duration),unused=a.duration-(end-start);transaction(()=>{state.audioClips??=[];state.audioClips.push({id:crypto.randomUUID(),name:a.name,asset:a.id,start,end,sourceIn:0,volume:100});});notice(unused>.05?'Audio added. It is longer than the video, so the last '+unused.toFixed(1)+' s is not used.':'Audio added at the playhead.');return;}
 if(state.lockedTracks?.['Video track'])return notice('Unlock the video track to insert footage.');if(state.clips.length>=199)return notice('This project supports up to 200 clips.');
 const next=V7.insert(state,a,at==null?total():at);selectionV7=[{type:'video',id:next.clips[next.selected].id}];transaction(()=>Object.assign(state,next));markSelectionV7();
};
// 0.15: after a delete you stay in the tab you were working in; only a panel for the deleted item closes.
function panelAfterDeleteV15(chosen){
 const p=state.panel,has=type=>chosen.some(c=>c.type===type);
 if(p==='element'&&state.active&&chosen.some(c=>c.type==='element'&&c.id===state.active)){const e=state.elements.find(e=>e.id===state.active);return e&&(e.tracking||['blur','cover'].includes(e.kind))?'effects':'elements';}
 if(p==='caption-edit'&&has('caption'))return 'captions';
 if(p==='clip'&&has('video'))return 'media';
 if(p==='overlay'&&has('overlay'))return 'media';
 if(p==='audioClip'&&has('audioClip'))return 'audio';
 return p;
}
deleteSelected=function(keepGap=false){keepGap=keepGap===true;
 cleanSelectionV7();if(!selectionV7.length){if(state.panel==='caption-edit'&&state.transcript[selectedCaption])selectionV7=[{type:'caption',id:state.transcript[selectedCaption].id}];else if(state.panel==='element'&&state.active)selectionV7=[{type:'element',id:state.active}];else if(state.panel==='clip'&&state.clips[state.selected])selectionV7=[{type:'video',id:state.clips[state.selected].id}];}
 // 0.15: with nothing selected, Delete does nothing (it used to remove the clip under the playhead).
 if(!selectionV7.length)return notice('Select something on the timeline to delete it.');
 const chosen=selectionV7.filter(s=>!lockedV7(s));if(!chosen.length)return notice('Select an unlocked clip first.');for(const r of [...chosen])if(r.type==='overlay')for(const a of state.audioClips||[])if(a.linkOverlay===r.id&&!chosen.some(c=>c.type==='audioClip'&&c.id===a.id))chosen.push({type:'audioClip',id:a.id});const nextPanel=panelAfterDeleteV15(chosen);
 transaction(()=>{for(const ref of chosen.filter(s=>s.type!=='video')){if(trackKeysV7[ref.type])state[trackKeysV7[ref.type]]=(state[trackKeysV7[ref.type]]||[]).filter(e=>e.id!==ref.id);else if(ref.type==='caption')state.transcript=state.transcript.filter(e=>e.id!==ref.id);else state[ref.type]=null;}
  Object.assign(state,V7.remove(state,chosen.filter(s=>s.type==='video').map(s=>s.id),keepGap));selectionV7=[];timelineSelection=null;state.panel=nextPanel;});timelineFocus();
};
function contextV7(x,y){
 q('#v7-context')?.remove();cleanSelectionV7();if(!selectionV7.length&&state.clips[state.selected])selectionV7=[{type:'video',id:state.clips[state.selected].id}];markSelectionV7();
 const menu=document.createElement('div');menu.id='v7-context';menu.setAttribute('role','menu');root.append(menu);Object.assign(menu.style,{left:Math.min(x,innerWidth-230)+'px',top:Math.min(y,innerHeight-270)+'px'});
 const action=(text,fn)=>{const b=document.createElement('button');b.textContent=text;b.setAttribute('role','menuitem');b.onclick=()=>{menu.remove();fn();};menu.append(b);};
 const videos=selectionV7.filter(s=>s.type==='video'&&!lockedV7(s));
 if(videos.length){action('Split at playhead',()=>q('#ed-split').click());action('Duplicate selected clips',()=>transaction(()=>{for(const ref of [...videos].reverse()){const i=state.clips.findIndex(c=>c.id===ref.id);state.clips.splice(i+1,0,{...clone(state.clips[i]),id:crypto.randomUUID()});}}));action('Detach audio',()=>transaction(()=>{state.audioClips??=[];let offset=0;for(const c of state.clips){if(videos.some(s=>s.id===c.id)&&state.assets.find(a=>a.id===c.asset)?.hasAudio&&!c.muted){state.audioClips.push({id:crypto.randomUUID(),asset:c.asset,name:c.name,start:offset,end:offset+c.end-c.start,sourceIn:c.start,volume:100});c.muted=true;}offset+=c.end-c.start;}}));action('Delete and keep gap',()=>deleteSelected(true));}
 action('Delete selection',()=>deleteSelected());action('Cancel',()=>{});menu.firstElementChild?.focus();
 const outside=e=>{if(!menu.contains(e.target)){menu.remove();document.removeEventListener('pointerdown',outside);}};setTimeout(()=>document.addEventListener('pointerdown',outside),0);menu.onkeydown=e=>{if(e.key==='Escape'){menu.remove();timelineFocus();}};
}
const panelBeforeV7=panelV6;
panelV6=function(p){if(state.panel==='clip'){if(!state.clips[state.selected]){state.panel='media';return false;}p.innerHTML='';return true;}return panelBeforeV7(p);};
const controlsBeforeV7=controlsV6;
controlsV6=function(p){controlsBeforeV7(p);if(state.panel==='media'){p.querySelector('p').textContent='Preview a source. Add inserts it at the playhead.';root.querySelectorAll('[data-media-preview]').forEach(b=>{b.draggable=true;b.ondragstart=ev=>{ev.dataTransfer.setData('application/x-video-visor-media',b.dataset.mediaPreview);ev.dataTransfer.effectAllowed='copy';};});}if(state.panel==='clip'){p.querySelectorAll('output').forEach(n=>n.textContent=Number(Number(n.textContent).toFixed(1)));} };
selectCaption=function(i){normalizeV7();const l=state.transcript[i];if(!l)return;selectionV7=[{type:'caption',id:l.id}];primaryV7(selectionV7[0]);tracks();paint();};
function wireV7(){
 onKeyV9(ev=>{if(['INPUT','TEXTAREA','SELECT'].includes(ev.target.tagName)||ev.target.isContentEditable)return;
 if(ev.key==='Escape'){q('#v7-context')?.remove();selectionV7=[];markSelectionV7();}
 if((ev.metaKey||ev.ctrlKey)&&ev.key.toLowerCase()==='a'&&ev.target.closest('.ed-timeline')){ev.preventDefault();selectionV7=state.clips.map(c=>({type:'video',id:c.id})).filter(s=>!lockedV7(s));markSelectionV7();}
 if((ev.metaKey||ev.ctrlKey)&&ev.key.toLowerCase()==='c'){copyV6=selectionV7.filter(s=>itemV7(s)).map(s=>({type:s.type,item:clone(itemV7(s))}));ev.preventDefault();}
 if((ev.metaKey||ev.ctrlKey)&&ev.key.toLowerCase()==='v'&&copyV6?.length){ev.preventDefault();pasteV15(copyV6);}
 });
 q('#ed-scrub').oninput=e=>{stop();state.time=+e.target.value;paint();};
}

// START EDITOR V8
// This module is included inside the editor closure by patch_v8.py.
const T8=window.trackModelV8,A8=window.titleModelV8;
let titleCategoryV8='titles',liveGestureV8=null,lastTrackFocusV8=null;
const bindBeforeV8=bind;
bind=function(id,fn){
 const el=q('#'+id);if(!el)return;
 if(!['range','color'].includes(el.type))return bindBeforeV8(id,fn);
 const begin=()=>{if(liveGestureV8?.el===el)return;liveGestureV8?.finish();stop();previewOriginal=false;previewEffect=null;liveGestureV8={el,before:clone(state),changed:false,finish};};
 const apply=()=>{begin();fn(el.value,el);liveGestureV8.changed=true;const out=el.closest('label')?.querySelector('output');if(out)out.value=Number.isFinite(+el.value)?String(Math.round(+el.value*10)/10):el.value;layers();paint();};
 function finish(){if(liveGestureV8?.el!==el)return;const g=liveGestureV8;liveGestureV8=null;if(!g.changed)return;history.push(g.before);if(history.length>25)history.shift();future=[];q('#ed-undo').disabled=false;q('#ed-redo').disabled=true;tracks();paint();commit();}
 function cancel(){if(liveGestureV8?.el!==el)return;const before=liveGestureV8.before;liveGestureV8=null;state=before;render();}
 el.oninput=apply;el.onchange=()=>{if(!liveGestureV8)apply();finish();};el.onblur=finish;el.onpointercancel=cancel;
 el.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}});
};
const panelBeforeV8=panel;
panel=function(){
 panelBeforeV8();const p=q('#ed-panel');
 // Keep actionable tracking warnings; remove static prose repeated in every tab.
 p.querySelectorAll('p').forEach(n=>{if(!/Tracking was lost/.test(n.textContent))n.remove();});p.querySelectorAll('hr').forEach(n=>n.remove());
 if(state.panel==='elements'){
  const current=['icons','legacy-callouts'].includes(titleCategoryV8)?titleCategoryV8:A8.categories.some(([k])=>k===titleCategoryV8)?titleCategoryV8:'titles';
  p.innerHTML='<h3>Text & graphics</h3><div class="v8-categories" role="group" aria-label="Template category">'+[...A8.categories,['icons','Icons']].map(([k,n])=>'<button data-v8-category="'+k+'" class="'+(current===k?'active':'')+'" aria-pressed="'+(current===k)+'">'+n+'</button>').join('')+'</div><div class="v8-template-grid"></div>';
  p.querySelectorAll('[data-v8-category]').forEach(b=>b.onclick=()=>{titleCategoryV8=b.dataset.v8Category;panel();});
  const grid=p.querySelector('.v8-template-grid');
  if(current==='icons'){
   for(const [k,n]of [['rocket','Launch'],['lightbulb','Idea'],['target','Goal'],['circle-check','Complete'],['sparkles','Highlight'],['chart-column','Growth'],['mouse-pointer-2','Click'],['clock','Time'],['download','Download'],['circle-alert','Notice'],['heart','Like'],['shield-check','Protected']]){const b=document.createElement('button');b.className='v8-template';b.innerHTML='<span class="v8-icon-tile">'+icon(k)+'</span><small>'+n+'</small>';b.onclick=()=>addElement('icon-'+k);templateDragV8(b,'icon:'+k);grid.append(b);}
  }else for(const t of A8.catalog.filter(t=>t.category===current)){
   const b=document.createElement('button');b.className='v8-template';b.dataset.template=t.id;b.setAttribute('aria-label','Add '+t.name);b.innerHTML='<span class="v8-template-demo" data-design="'+t.design+'"><span>'+esc(t.text)+'</span><small>'+esc(t.subtitle)+'</small></span><small>'+esc(t.name)+'</small>';b.onclick=()=>addTemplateV8(t.id);templateDragV8(b,t.id);
   let timer=0;const animate=()=>{cancelAnimationFrame(timer);const start=performance.now();const frame=now=>{if(!b.isConnected)return;const age=((now-start)/1000)%2.8,sample={start:0,end:2.6,animation:t.motion,animationSpeed:1,text:t.text};animateTitleV8(b.querySelector('.v8-template-demo'),sample,age);timer=requestAnimationFrame(frame);};timer=requestAnimationFrame(frame);};const stop=()=>{cancelAnimationFrame(timer);b.querySelector('.v8-template-demo').removeAttribute('style');b.querySelectorAll('.v8-template-demo>*').forEach(n=>n.removeAttribute('style'));};b.onmouseenter=animate;b.onmouseleave=stop;b.onfocus=animate;b.onblur=stop;grid.append(b);
  }
 }
 if(state.panel==='element'){
  const e=state.elements.find(e=>e.id===state.active);if(e?.templateId){
   if(q('#ed-size')){q('#ed-size').max='60';q('#ed-size').value=e.size;}
   q('#ed-animation')?.closest('label')?.remove();
   const box=document.createElement('section');box.className='v8-title-settings';box.innerHTML='<label>Supporting text<input id="v8-subtitle" type="text" maxlength="180" value="'+esc(e.subtitle||'')+'"></label>'+select('v8-motion','Animation',[['reveal','Masked reveal'],['rise','Gentle rise'],['slide','Slide in'],['stagger','Staggered text'],['underline','Underline reveal'],['words','Word build'],['typewriter','Type on'],['wipe','Panel wipe'],['pop','Soft scale'],['count','Number count'],['none','None']],e.animation)+range('v8-motion-speed','Animation speed',e.animationSpeed||1,.5,2)+'<label class="ed-check">Animate out<input id="v8-out" type="checkbox" '+(e.animateOut!==false?'checked':'')+'></label>';p.append(box);q('#v8-motion-speed').step='.1';q('#v8-motion-speed').value=e.animationSpeed||1;bind('v8-subtitle',v=>e.subtitle=v);bind('v8-motion',v=>e.animation=v);bind('v8-motion-speed',v=>e.animationSpeed=+v);bind('v8-out',(v,c)=>e.animateOut=c.checked);
  }else if(e&&(e.kind.startsWith('icon-')||['blur','cover'].includes(e.kind))){
   // 0.9: icons and privacy regions have no text or font, so those fields are not shown.
   const isIcon=e.kind.startsWith('icon-'),size=q('#ed-size')?.closest('label'),colour=q('#ed-colour')?.closest('label');
   q('#ed-text')?.closest('label')?.remove();q('#ed-font')?.closest('label')?.remove();
   const heading=p.querySelector('h3');if(heading)heading.textContent=isIcon?'Edit icon':e.kind==='blur'?'Edit blur region':'Edit cover';
   if(isIcon){if(q('#ed-size')){q('#ed-size').max='60';q('#ed-size').value=e.size;}if(size&&colour)size.after(colour);}
   else{if(size?.firstChild)size.firstChild.textContent='Height ';colour?.remove();q('#ed-animation')?.closest('label')?.remove();}
  }
 }
 window.audioPreviewPanelV8?.(p);icons();
};
function templateDragV8(node,id){node.draggable=true;node.ondragstart=e=>{e.dataTransfer.setData('application/x-video-visor-template',id);e.dataTransfer.effectAllowed='copy';};node.ondragend=()=>{q('#v7-insert-marker')?.remove();q('.v8-drop-target')?.classList.remove('v8-drop-target');};}
function addTemplateV8(id,time=state.time,trackId){
 if(!state.clips.length||total()<.1)return notice('Add footage first.');if(state.elements.length>=100)return notice('100 elements maximum per project.');
 // 0.15: from the panel, a title starts 0.4 s before the playhead so it is already visible there; the playhead does not move.
 const start=Math.max(0,Math.min(total()-.1,time===state.time&&!trackId?time-.4:time)),end=Math.min(total(),start+5);
 if(id.startsWith('icon:')){const old=state.time;state.time=start+.3;addElement('icon-'+id.slice(5));const e=state.elements.find(e=>e.id===state.active);if(e&&trackId){e.trackId=trackId;T8.normalize(state);tracks();commit();}state.time=old;paint();return;}
 const e=A8.create(id,start,end,state.ratio);if(!e)return;transaction(()=>{if(trackId)e.trackId=trackId;state.elements.push(e);state.active=e.id;state.panel='element';});selectionV7=[{type:'element',id:e.id}];markSelectionV7();
}
function animateTitleV8(el,e,time){
 const {p,out,raw}=A8.progress(e,time),motion=e.animation||'reveal';let opacity=out,x=0,y=0,scale=1,clip='none';
 if(motion==='none')opacity=1;else if(['reveal','wipe'].includes(motion)){clip='inset(0 '+((1-p)*100)+'% 0 0)';x=motion==='wipe'?(1-p)*-8:0;}
 else if(motion==='slide'){x=(1-p)*-25;opacity*=p;}else if(motion==='rise'||motion==='stagger'){y=(1-p)*20;opacity*=p;}
 else if(motion==='pop'){scale=.88+.12*p;opacity*=p;}else opacity*=p;
 el.style.opacity=opacity;el.style.translate=x+'% '+y+'%';el.style.scale=scale;el.style.clipPath=clip;
 const main=el.querySelector('.v8-title-main')||el.firstElementChild,sub=el.querySelector('.v8-title-sub')||el.children[1];
 if(sub)sub.style.opacity=motion==='stagger'?Math.max(0,Math.min(1,(raw-.35)/.65)):1;
 if(main){if(motion==='typewriter')main.style.clipPath='inset(0 '+(100-Math.floor(raw*(e.text?.length||20))/(e.text?.length||20)*100)+'% 0 0)';else main.style.clipPath='none';
  main.querySelectorAll('.v8-word').forEach((w,i,list)=>{const v=Math.max(0,Math.min(1,raw*(list.length+1)-i));w.style.opacity=motion==='words'?v:1;w.style.translate=motion==='words'?'0 '+((1-v)*25)+'%':'';});
  if(motion==='count'&&e.text)main.textContent=A8.countText(e.text,p);
 }
 el.style.setProperty('--v8-reveal',String(p));
}
const layersBeforeV8=layers;
layers=function(){layersBeforeV8();for(const e of state.elements){if(!e.templateId)continue;const el=q('.ed-layer[data-id="'+e.id+'"]'),t=A8.catalog.find(t=>t.id===e.templateId);if(!el||!t)continue;el.dataset.design=t.design;el.dataset.templateMotion=e.animation;el.classList.add('v8-title');el.style.borderLeft='';el.style.setProperty('--v8-accent',e.accent||'#1f7ae0');el.style.background=e.background||'transparent';el.style.fontSize=(e.size/(Number(state.ratio.split('/')[0])/Number(state.ratio.split('/')[1])<1?3:6))+'cqw';const handle=el.querySelector('.ed-handle');el.replaceChildren();const main=document.createElement('span');main.className='v8-title-main';main.innerHTML=e.animation==='words'?e.text.trim().split(/\s+/).map(w=>'<span class="v8-word">'+esc(w)+'</span>').join(' '):esc(e.text);const sub=document.createElement('span');sub.className='v8-title-sub';sub.textContent=e.subtitle||'';el.append(main,sub);if(handle)el.append(handle);}}
const paintBeforeV8=paint;
// 0.9: long titles shrink to stay inside the frame (preview and export share this code).
function fitTitleV9(el,e){
 const box=el.offsetParent;if(!box||el.hidden)return;const H=box.clientHeight,W=box.clientWidth;if(!H)return;
 const ratio=state.ratio.split('/').map(Number),base=e.size/(ratio[0]/ratio[1]<1?3:6),key=[e.text,e.subtitle,e.size,e.width,e.font,e.weight,e.y,state.ratio,W,H].join('|');
 if(el.dataset.fitV9===key)return;
 const main=el.querySelector('.v8-title-main');if(e.animation==='count'&&main)main.textContent=e.text;
 let size=base;el.style.fontSize=size+'cqw';
 for(let i=0;i<18&&el.offsetHeight>H*.84&&size>base*.3;i++){size*=.9;el.style.fontSize=size+'cqw';}
 const half=el.offsetHeight/H*50;el.style.top=Math.max(Math.min(half+3,50),Math.min(Math.max(97-half,50),e.y))+'%';
 el.dataset.fitV9=key;
}
paint=function(){paintBeforeV8();for(const e of state.elements){if(!e.templateId||e.engine==='v11')continue;const el=q('.ed-layer[data-id="'+e.id+'"]');if(el){el.dataset.panel=e.background&&e.background!=='transparent'?'solid':'none';fitTitleV9(el,e);animateTitleV8(el,e,state.time);}} };
const lockedBeforeV8=lockedV7;
lockedV7=function(ref){const e=T8.entries(state).find(e=>e.type===ref.type&&e.id===ref.id),track=state.timelineTracks?.find(t=>t.id===e?.item[e.field]);return track?!!track.locked:lockedBeforeV8(ref);};
const baseDragV8=dragBlockV6;
dragBlockV6=function(b,lane,type,id){
 b.querySelectorAll('.v6-edge').forEach(n=>n.remove());baseDragV8(b,lane,type,id);
 if(['video','source','caption'].includes(type)){const down=b.onpointerdown;b.onpointerdown=e=>{if(state.timelineTracks?.find(t=>t.id===lane.dataset.trackId)?.locked)return notice('Unlock this track to edit it.');down(e);};return;}
 const oldDown=b.onpointerdown,ref={type,id};
 b.onpointerdown=ev=>{
  if(ev.button!==0||ev.target.closest('[data-edge]')||ev.shiftKey||ev.metaKey)return oldDown(ev);
  if(lockedV7(ref))return notice('Unlock this track to edit it.');ev.preventDefault();ev.stopPropagation();stop();
  if(!selectionV7.some(s=>sameRefV7(s,ref)))selectionV7=[ref];primaryV7(ref,+b.dataset.v7Start);timelineFocus();
  const chosen=selectionV7.filter(s=>!lockedV7(s)),entry=T8.entries(state).find(e=>e.type===type&&e.id===id),x=ev.clientX,y=ev.clientY,rect=lane.getBoundingClientRect(),seconds=total()/rect.width,scroll=q('#vt-tracks').scrollLeft;
  let moved=false,delta=0,target=null,allowed=false,lowerV15=false;
  const clean=()=>{clearGhostsV7();hideSnapLineV15();q('#vt-tracks').querySelectorAll('.v8-drop-target,.v8-drop-denied').forEach(n=>n.classList.remove('v8-drop-target','v8-drop-denied'));};
  pointerV7(e=>{
   if(!moved&&Math.hypot(e.clientX-x,e.clientY-y)<4)return;moved=true;clean();
   const host=q('#vt-tracks'),bounds=host.getBoundingClientRect();if(e.clientX>bounds.right-25)host.scrollLeft+=12;if(e.clientX<bounds.left+130)host.scrollLeft-=12;if(e.clientY>bounds.bottom-20)host.scrollTop+=8;if(e.clientY<bounds.top+20)host.scrollTop-=8;
   delta=Math.abs(e.clientX-x)<6?0:(e.clientX-x+host.scrollLeft-scroll)*seconds;if(entry?.item.tracking||entry?.item.linkId)delta=0;
   const entries=T8.entries(state).filter(a=>chosen.some(s=>s.type===a.type&&s.id===a.id)),ranges=entries.flatMap(e=>e.ranges),lo=Math.min(...ranges.map(r=>r.start)),hi=Math.max(...ranges.map(r=>r.end));
   if(delta)delta=snapDeltaV15(lo,hi,delta,snapPointsV15(a=>entries.includes(a)),seconds*8,e);else hideSnapLineV15();
   delta=Math.max(-lo,Math.min(total()-hi,delta));const over=document.elementFromPoint(e.clientX,e.clientY)?.closest('.vt-lane[data-track-id]');target=over?.dataset.trackId||null;lowerV15=target==='video-main'&&chosen.length===1&&chosen[0].type==='overlay'&&!trackLockedV15('video-main');allowed=lowerV15||(!!target&&T8.canPlace(state,chosen,target,delta));
   over?.classList.add(allowed?'v8-drop-target':'v8-drop-denied');host.querySelectorAll('.vt-block.selected').forEach(n=>{const dy=allowed?over.getBoundingClientRect().top-n.parentElement.getBoundingClientRect().top:0;n.style.translate=delta/seconds+'px '+dy+'px';});
  },()=>{clean();if(moved){if(allowed&&lowerV15)lowerOverlayV15(chosen[0].id,delta);else if(allowed)transaction(()=>{T8.place(state,chosen,target,delta);moveLinkedAudioV15(chosen,delta);});else notice('That spot is taken or locked. Drop onto an empty space on a matching, unlocked track.');}markSelectionV7();},()=>{clean();markSelectionV7();},ev);
 };
};
const tracksBeforeV8=tracksBeforeV7;
function stripV10(group,items){
 const tab={video:'media',audio:'audio',graphics:'elements',captions:'captions',effects:'effects'}[group],mine=items.filter(e=>e.group===group),row=document.createElement('button');
 row.type='button';row.className='v10-strip';row.dataset.group=group;row.title='Show '+T8.labels[group]+' ('+mine.length+')';row.setAttribute('aria-label',row.title);
 const label=document.createElement('span');label.className='v10-strip-label';label.innerHTML=icon('chevron-right')+'<span>'+T8.labels[group]+'</span><small>'+mine.length+'</small>';
 const lane=document.createElement('span');lane.className='v10-strip-lane';const whole=total()||1;
 for(const e of mine)for(const r of e.ranges){const mark=document.createElement('i');mark.style.left=(r.start/whole*100)+'%';mark.style.width=Math.max(.25,(r.end-r.start)/whole*100)+'%';lane.append(mark);}
 row.append(label,lane);row.onclick=()=>open(tab);return row;
}
// ---------- 0.15 timeline editing (Phase 1) ----------
const MIN_CLIP_V15=.25; // shortest clip piece for trim and split
const realClipsV15=()=>state.clips.filter(c=>c.asset!=='blank'&&!c.gap).length;
// Snapping: on by default (N toggles it, Alt while dragging skips it). A thin yellow line shows the snap point.
let snapOnV15=(()=>{try{return localStorage.getItem('vv-snap')!=='off';}catch{return true;}})();
function toggleSnapV15(){snapOnV15=!snapOnV15;try{localStorage.setItem('vv-snap',snapOnV15?'on':'off');}catch{}snapButtonV15();notice(snapOnV15?'Snapping on (N to turn off).':'Snapping off (N to turn on).');}
function snapButtonV15(){let b=q('#v15-snap');if(!b){b=document.createElement('button');b.id='v15-snap';b.type='button';b.onclick=toggleSnapV15;}b.innerHTML=icon('magnet')+'<span>Snap</span>';b.classList.toggle('active',snapOnV15);b.setAttribute('aria-pressed',snapOnV15);b.title=snapOnV15?'Snapping on (N)':'Snapping off (N)';b.setAttribute('aria-label',b.title);icons();return b;}
onKeyV9(ev=>{const t=ev.target;if(['INPUT','TEXTAREA','SELECT'].includes(t.tagName)||t.isContentEditable||ev.metaKey||ev.ctrlKey||ev.altKey)return;if(ev.key==='n'||ev.key==='N'){ev.preventDefault();toggleSnapV15();}});
function clipEdgesV15(){const out=[0];let off=0;for(const c of state.clips){off+=c.end-c.start;out.push(off);}return out;}
function clipOffsetV15(id){let off=0;for(const c of state.clips){if(c.id===id)return off;off+=c.end-c.start;}return off;}
// Points to snap to: start and end, the playhead, clip boundaries and the edges of every other item.
// With clipId (trimming a main clip), only boundaries up to that clip are used, since later ones move.
function snapPointsV15(exclude,clipId){
 const pts=[0,total(),state.time];let off=0;for(const c of state.clips){pts.push(off);if(clipId&&c.id===clipId)break;off+=c.end-c.start;}if(!clipId)pts.push(off);
 for(const e of T8.entries(state)){if(e.type==='video'||e.type==='source'||exclude?.(e))continue;for(const r of e.ranges)pts.push(r.start,r.end);}
 return pts;
}
function snapV15(t,points,tol,ev){if(!snapOnV15||ev?.altKey){hideSnapLineV15();return t;}let best=null,d=tol;for(const p of points){const k=Math.abs(p-t);if(k<d){d=k;best=p;}}if(best==null){hideSnapLineV15();return t;}showSnapLineV15(best);return best;}
// Snap whichever end of a moving block (start or end) is closer to a snap point.
function snapDeltaV15(start,end,delta,points,tol,ev){if(!snapOnV15||ev?.altKey){hideSnapLineV15();return delta;}let best=null,bd=tol;for(const p of points)for(const edge of [start,end]){const d=p-(edge+delta);if(Math.abs(d)<bd){bd=Math.abs(d);best={adj:d,at:p};}}if(!best){hideSnapLineV15();return delta;}showSnapLineV15(best.at);return delta+best.adj;}
function showSnapLineV15(t){const surface=q('#vt-tracks .vt-surface'),lane=q('#vt-tracks .vt-video');if(!surface||!lane)return;let l=q('#v15-snapline');if(!l){l=document.createElement('div');l.id='v15-snapline';}if(l.parentElement!==surface)surface.append(l);const r=lane.getBoundingClientRect(),sr=surface.getBoundingClientRect();l.style.left=(r.left-sr.left+t/(total()||1)*r.width)+'px';l.hidden=false;}
function hideSnapLineV15(){const l=q('#v15-snapline');if(l)l.hidden=true;}
function dragTipV15(ev,len){let tip=document.getElementById('v15-tip');if(!ev){tip?.remove();return;}if(!tip){tip=document.createElement('div');tip.id='v15-tip';document.body.append(tip);}tip.textContent=(len/state.speed).toFixed(2)+' s';tip.style.left=(ev.clientX+14)+'px';tip.style.top=(ev.clientY-30)+'px';}
// The free space around an item on its own track: it can't be trimmed or moved over its neighbours.
function neighbourLimitsV15(ref,t0,t1){
 const all=T8.entries(state),me=all.find(e=>e.type===ref.type&&e.id===ref.id);if(!me)return {lo:-Infinity,hi:Infinity};
 const track=me.item[me.field];let lo=-Infinity,hi=Infinity;
 for(const e of all){if(e===me||e.item[e.field]!==track)continue;for(const r of e.ranges){if(r.end<=t0+1e-6)lo=Math.max(lo,r.end);else if(r.start>=t1-1e-6)hi=Math.min(hi,r.start);}}
 return {lo,hi};
}
function trackLimitsV15(item){const t=item.tracking||{};return {start:t.limitStart??t.frames?.[0]?.t??t.start,end:t.limitEnd??t.end};}
// Trimming an item's edge (timeline seconds): stays inside its media, its neighbours and the video, then snaps.
function edgeDeltaV15(ref,old,edge,delta,seconds,ev,b){
 const t0=+b.dataset.v7Start,t1=+b.dataset.v7End,minLen=.1,dur=id=>state.assets.find(a=>a.id===id)?.duration;
 let lo=edge==='start'?0:t0+minLen,hi=edge==='start'?t1-minLen:total();
 if(['audioClip','overlay'].includes(ref.type)){const d=dur(old.asset);if(edge==='start')lo=Math.max(lo,t0-(old.sourceIn||0));else if(d)hi=Math.min(hi,t0+d-(old.sourceIn||0));}
 if(ref.type==='caption'){const d=dur(old.asset);if(edge==='start')lo=Math.max(lo,t0-old.start);else if(d)hi=Math.min(hi,t1+d-old.end);}
 if(old.tracking){const L=trackLimitsV15(old);if(edge==='start')lo=Math.max(lo,t0-(old.tracking.start-L.start));else hi=Math.min(hi,t1+(L.end-old.tracking.end));}
 const nb=neighbourLimitsV15(ref,t0,t1);if(edge==='start')lo=Math.max(lo,nb.lo);else hi=Math.min(hi,nb.hi);
 const from=edge==='start'?t0:t1;let pos=Math.max(lo,Math.min(hi,from+delta));
 const snapped=snapV15(pos,snapPointsV15(e=>e.type===ref.type&&e.id===ref.id),seconds*8,ev);if(snapped>=lo-1e-9&&snapped<=hi+1e-9)pos=snapped;else hideSnapLineV15();
 return pos-from;
}
function applyEdgeV15(ref,old,edge,delta){
 const item=itemV7(ref);if(!item)return;
 if(item.tracking){item.tracking={...item.tracking,[edge]:old.tracking[edge]+delta};if(Number.isFinite(old[edge]))item[edge]=old[edge]+delta;return;}
 if(ref.type==='music'){const s0=old.start||0,e0=Number.isFinite(old.end)?old.end:total();if(edge==='start'){item.start=s0+delta;item.end=e0;item.sourceIn=Math.max(0,(old.sourceIn||0)+delta);}else{item.start=s0;item.end=e0+delta;}return;}
 item[edge]=old[edge]+delta;if(edge==='start'&&['audioClip','overlay'].includes(ref.type))item.sourceIn=Math.max(0,(old.sourceIn||0)+delta);if(ref.type==='caption')delete item.words;
 if(ref.type==='overlay')for(const a of state.audioClips||[])if(a.linkOverlay===item.id){a[edge]=item[edge];if(edge==='start')a.sourceIn=item.sourceIn;}
}
// While a main clip is trimmed, the clips after it, their audio and the transition markers follow live.
function relayoutMainV15(base){const lane=q('#vt-tracks .vt-video');if(!lane)return;let off=0;state.clips.forEach((c,i)=>{const L=off/base*100+'%',W=(c.end-c.start)/base*100+'%';const blk=lane.querySelector('.vt-block[data-clip="'+i+'"]');if(blk){blk.style.left=L;blk.style.width=W;}q('#vt-tracks').querySelectorAll('.vt-item-source[data-source-clip="'+c.id+'"]').forEach(n=>{n.style.left=L;n.style.width=W;});const t=lane.querySelector('[data-transition="'+i+'"]');if(t)t.style.left=L;off+=c.end-c.start;});}
// Moving a main clip up onto another video track: it becomes a full-frame layer above the main video,
// leaving a gap on the main track (as in Premiere), so nothing else moves. Its sound becomes a linked audio clip.
function liftTargetV15(e,at){
 clearLiftV15();const over=document.elementFromPoint(e.clientX,e.clientY)?.closest('.vt-lane[data-track-id]');
 if(!over||over.dataset.group!=='video'||over.dataset.trackId==='video-main')return null;
 if(selectionV7.filter(s=>s.type==='video').length!==1||trackLockedV15(over.dataset.trackId)||realClipsV15()<2){over.classList.add('v15-lift-target','v8-drop-denied');return null;}
 over.classList.add('v15-lift-target','v8-drop-target');return {track:over.dataset.trackId,at:Math.max(0,at)};
}
function clearLiftV15(){q('#vt-tracks')?.querySelectorAll('.v15-lift-target').forEach(n=>n.classList.remove('v15-lift-target','v8-drop-target','v8-drop-denied'));}
function liftClipV15(ids,trackId,at){
 const c=state.clips.find(c=>c.id===ids[0]);if(!c)return;if(realClipsV15()<2)return notice('Keep at least one clip on the main video track.');
 const a=state.assets.find(x=>x.id===c.asset),len=c.end-c.start;let newId=null;
 transaction(()=>{
  Object.assign(state,V7.remove(state,[c.id],true));
  const T=total(),start=Math.max(0,Math.min(at,T-len)),end=Math.min(T,start+len);
  const o={id:uidV15(),asset:c.asset,name:c.name,start,end,sourceIn:c.start,x:50,y:50,scale:100,trackId};newId=o.id;
  state.overlays=[...(state.overlays||[]),o];
  if(a?.hasAudio&&!c.muted)state.audioClips=[...(state.audioClips||[]),{id:uidV15(),asset:c.asset,name:c.name,start,end,sourceIn:c.start,volume:100,linkOverlay:o.id}];
 });
 if(newId){selectionV7=[{type:'overlay',id:newId}];markSelectionV7();notice('Moved to its own video track. The gap it left on the main track can be deleted to close it up.');}
}
// Moving a layer down onto the main track: it goes back into the main sequence at the drop point (into a gap
// if it fits there), and its linked audio clip is joined back to it.
function lowerOverlayV15(id,delta){
 const o=(state.overlays||[]).find(x=>x.id===id);if(!o)return;const a=state.assets.find(x=>x.id===o.asset),len=o.end-o.start,at=o.start+delta;
 transaction(()=>{
  const link=(state.audioClips||[]).findIndex(x=>x.linkOverlay===o.id);
  const clip={id:uidV15(),asset:o.asset,name:o.name||a?.name||'Clip',kind:a?.kind||'video',start:o.sourceIn||0,end:(o.sourceIn||0)+len,limit:a?.duration||((o.sourceIn||0)+len)};
  if(a?.hasAudio&&link<0)clip.muted=true;
  state.overlays.splice(state.overlays.indexOf(o),1);if(link>=0)state.audioClips.splice(link,1);
  let off=0,placed=false;for(let i=0;i<state.clips.length;i++){const g=state.clips[i],d=g.end-g.start;if(at>=off-1e-6&&at<off+d&&g.gap&&d>=len-1e-6){state.clips.splice(i,1,clip,...(d-len>=.05?[{...g,start:g.start+len}]:[]));placed=true;break;}off+=d;}
  if(!placed)state.clips.splice(V7.boundary(state.clips,at),0,clip);
 });
}
// Locks: nothing on a locked track may change (checked for every edit in transaction()).
function trackLockedV15(id){return !!state.timelineTracks?.find(t=>t.id===id)?.locked;}
function lockedTrackIdsV15(){return (state.timelineTracks||[]).filter(t=>t.locked).map(t=>t.id);}
function lockedItemsV15(ids){if(!ids?.length||!window.trackModelV8)return '';const set=new Set(ids);return JSON.stringify(window.trackModelV8.entries(state).filter(e=>set.has(e.item[e.field])).map(e=>[e.type,e.id,e.item]));}
// After every edit: drop tracking masks whose footage is no longer on the timeline; the first clip has no transition.
function tidyV15(){state.elements=(state.elements||[]).filter(e=>!e.tracking||state.clips.some(c=>c.asset===e.tracking.asset&&Math.min(c.end,e.tracking.end)>Math.max(c.start,e.tracking.start)+1e-3));if(state.clips[0]?.transitionIn)delete state.clips[0].transitionIn;}
// The caption / transition panels follow their item by id, so Undo or a regenerate never points them at another one.
function focusIdsOfV15(){return {caption:state.transcript?.[selectedCaption]?.id,boundary:state.clips?.[selectedBoundary]?.id};}
function refocusV15(ids){if(!ids)return;if(ids.caption){const i=state.transcript.findIndex(l=>l.id===ids.caption);if(i>=0)selectedCaption=i;else if(state.panel==='caption-edit')state.panel='captions';}if(ids.boundary){const i=state.clips.findIndex(c=>c.id===ids.boundary);if(i>0)selectedBoundary=i;else if(state.panel==='transition')state.panel='transitions';}}
// 0.15: the panel of an item on a locked track is read-only (sliders change items without going through transaction()).
function lockPanelV15(p){const ref=state.panel==='element'&&state.active?{type:'element',id:state.active}:state.panel==='caption-edit'&&state.transcript[selectedCaption]?{type:'caption',id:state.transcript[selectedCaption].id}:state.panel==='zoom'&&selectedZoom?{type:'zoom',id:selectedZoom}:state.panel==='overlay'&&timelineSelection?.type==='overlay'?{type:'overlay',id:timelineSelection.id}:state.panel==='clip'?{type:'video',id:state.clips[state.selected]?.id}:null;if(!ref||!itemV7(ref)||!lockedV7(ref))return;p.querySelectorAll('input,select,textarea,button').forEach(n=>{if(!/Back|Browse/.test(n.textContent))n.disabled=true;});const note=document.createElement('div');note.className='v15-locked-note';note.textContent='This track is locked. Unlock it on the timeline to edit.';p.prepend(note);}
function trackLabelV15(track,group){const same=state.timelineTracks.filter(t=>t.group===group);if(group==='video'){if(track.id==='video-main')return 'V1';return 'V'+(same.filter(t=>t.id!=='video-main').indexOf(track)+2);}const n=same.indexOf(track)+1;if(group==='audio')return 'A'+n;const name={graphics:'Text',captions:'Captions',effects:'Effects'}[group];return same.length>1?name+' '+n:name;}
function followPlayheadV15(){const host=q('#vt-tracks'),lane=q('#vt-tracks .vt-video');if(!host||!lane)return;const lr=lane.getBoundingClientRect(),hr=host.getBoundingClientRect(),labelW=lane.offsetLeft||110,x=lr.left-hr.left+host.scrollLeft+state.time/(total()||1)*lr.width;if(x>host.scrollLeft+host.clientWidth-40||x<host.scrollLeft+labelW)host.scrollLeft=Math.max(0,x-labelW-40);}
function zoomRangeV15(host){const z=q('#vt-scale');if(!z)return;const max=Math.min(400,Math.max(5,Math.ceil(total()*30*8/Math.max(400,host.clientWidth))));z.max=String(max);z.step='any';if(+z.value>max){z.value=max;timelineScale=max;}}
const isEmptyV15=()=>!state.clips.some(c=>c.asset!=='blank');
function emptyTimelineV15(){const lane=q('#vt-tracks .vt-video');if(!lane)return;state.clips.forEach((c,i)=>lane.querySelector('.vt-block[data-clip="'+i+'"]')?.classList.toggle('v15-gap',!!c.gap));const empty=isEmptyV15();lane.querySelectorAll('.vt-block').forEach(b=>b.hidden=empty);lane.querySelector('.v15-empty-main')?.remove();const dur=q('#ed-duration');if(dur&&empty)dur.textContent='';if(empty){const d=document.createElement('div');d.className='v15-empty-main';d.textContent='Add footage to start: use Add files, or drag a video here';lane.append(d);}}
function moveLinkedAudioV15(chosen,delta){for(const r of chosen){if(r.type!=='overlay')continue;for(const a of state.audioClips||[])if(a.linkOverlay===r.id&&!chosen.some(c=>c.type==='audioClip'&&c.id===a.id)){a.start+=delta;a.end+=delta;}}}
function pasteV15(list){
 const clipsN=list.filter(c=>c.type==='video').length,elN=list.filter(c=>c.type==='element').length;
 if(state.clips.length+clipsN>200)return notice('200 clips maximum.');if(state.elements.length+elN>100)return notice('100 elements maximum per project.');
 let skipped=0;
 transaction(()=>{let pasteIndex=state.selected+1;for(const copy of list){const e={...clone(copy.item),id:uidV15()};delete e.trackId;
  if(copy.type==='video'){delete e.transitionIn;state.clips.splice(pasteIndex++,0,e);}
  else if(copy.type==='caption'){const src=source(),d=e.end-e.start,limit=state.assets.find(a=>a.id===src.clip.asset)?.duration??src.t+d;e.asset=src.clip.asset;e.start=Math.max(0,Math.min(src.t,limit-d));e.end=Math.min(limit,e.start+d);delete e.words;if(e.end-e.start>=.1)state.transcript.push(e);}
  else if(trackKeysV7[copy.type]&&!e.tracking){const d=e.end-e.start,T=total();e.start=Math.max(0,Math.min(state.time,T-d));e.end=Math.min(T,e.start+d);if(e.end-e.start>=.1){state[trackKeysV7[copy.type]]??=[];state[trackKeysV7[copy.type]].push(e);}}
  else skipped++;}});
 if(skipped)notice('Some items could not be pasted (music, narration and tracking blur are added from their own panels).');
}
// 0.15 track layout. Top to bottom: Text & graphics, Captions, Effects, video tracks (V2, V3… above the
// main video), then audio. Media (and clip / canvas / overlay panels) shows every layer that has content;
// another tab shows video + audio + its own layer, and any other layer with content as a thin strip.
const GROUP_ORDER_V15=['graphics','captions','effects','video','audio'];
const PLACEHOLDER_V15={graphics:'Titles and graphics you add appear here',captions:'Captions appear here after you generate or import them',effects:'Zooms, blurs and covers you add appear here'};
function shownGroupsV15(focus,items){
 const shown=new Set(['video','audio']);if(['graphics','captions','effects'].includes(focus))shown.add(focus);
 if(['media','clip','canvas','overlay'].includes(state.panel))for(const e of items)shown.add(e.group);
 return shown;
}
function orderTracksV15(group,list){if(group!=='video')return list;const main=list.filter(t=>t.id==='video-main'),others=list.filter(t=>t.id!=='video-main');return [...others.reverse(),...main];}
function placeholderRowV15(group){
 const row=document.createElement('div');row.className='vt-row v15-placeholder';row.dataset.group=group;
 const label=document.createElement('span');label.className='vt-label';label.textContent=T8.labels[group];
 const lane=document.createElement('div');lane.className='vt-lane v15-placeholder-lane';lane.dataset.group=group;lane.textContent=PLACEHOLDER_V15[group];
 if(group==='graphics'){lane.ondragover=ev=>{if(!ev.dataTransfer.types.includes('application/x-video-visor-template'))return;ev.preventDefault();ev.dataTransfer.dropEffect='copy';lane.classList.add('v8-drop-target');};lane.ondragleave=()=>lane.classList.remove('v8-drop-target');lane.ondrop=ev=>{const template=ev.dataTransfer.getData('application/x-video-visor-template');if(!template)return;ev.preventDefault();lane.classList.remove('v8-drop-target');const r=lane.getBoundingClientRect();addTemplateV8(template,Math.max(0,Math.min(total()-.05,(ev.clientX-r.left)/r.width*total())));};}
 row.append(label,lane);return row;
}
// Bring the current tab's layer into view only when it is out of view; never jump otherwise.
function revealGroupV15(host,surface,focus){
 const head=surface.querySelector('.v8-track-group[data-group="'+focus+'"]'),rows=[...surface.querySelectorAll('.vt-row')].filter(r=>!r.hidden&&(r.querySelector('.vt-lane[data-group="'+focus+'"]')||r.dataset.group===focus));
 const first=head||rows[0];if(!first)return;const base=surface.getBoundingClientRect().top,top=first.getBoundingClientRect().top-base,bottom=(rows.at(-1)||first).getBoundingClientRect().bottom-base,ruler=surface.querySelector('.vt-ruler')?.parentElement.offsetHeight||26;
 if(top>=host.scrollTop+ruler&&bottom<=host.scrollTop+host.clientHeight)return;
 host.scrollTop=Math.max(0,Math.min(top-ruler,bottom-host.clientHeight+4));
}
function groupForPanelV8(){return({elements:'graphics',element:state.elements.find(e=>e.id===state.active)?.tracking||['blur','cover'].includes(state.elements.find(e=>e.id===state.active)?.kind)?'effects':'graphics',captions:'captions','caption-edit':'captions',transcript:'captions',effects:'effects',zoom:'effects',audio:'audio',audioClip:'audio',overlay:'video'})[state.panel]||'video';}
tracks=function(){
 normalizeV7();T8.normalize(state,{assignOnly:true});const scrollTop=q('#vt-tracks')?.scrollTop||0;tracksBeforeV8();const host=q('#vt-tracks'),surface=host.querySelector('.vt-surface'),ruler=surface.querySelector('.vt-ruler').parentElement,main=surface.querySelector('.vt-video').parentElement;
 const items=T8.entries(state),blocks=[...surface.querySelectorAll('.vt-block')].map(b=>{const type=b.classList.contains('vt-item-source')?'source':b.dataset.v7Type,id=type==='source'?b.dataset.sourceClip:b.dataset.v7Id;return{b,entry:items.find(e=>e.type===type&&e.id===id)};});
 surface.replaceChildren(ruler);surface.style.minWidth=(Math.max(480,host.clientWidth-2)*timelineScale)+'px';const all=state.timelineView==='all',focus=groupForPanelV8();const shownV10=shownGroupsV15(focus,items),stripsV10=[];
 for(const group of GROUP_ORDER_V15){
  const firstTrack=state.timelineTracks.find(t=>t.group===group)?.id,list=orderTracksV15(group,state.timelineTracks.filter(t=>t.group===group&&(t.id===firstTrack||t.manual||items.some(e=>e.item[e.field]===t.id)))),populated=list.filter(t=>items.some(e=>e.item[e.field]===t.id));
  // 0.10: outside "Show all tracks", only the layers for the current tab are opened; other layers that
  // contain something are drawn as thin strips at the bottom (click one to switch to its tab).
  if(!all&&!shownV10.has(group)){if(items.some(e=>e.group===group))stripsV10.push(stripV10(group,items));continue;}
  const expanded=state.collapsedTrackGroups?.[group]!==true;
  const header=document.createElement('div');header.className='v8-track-group';header.dataset.group=group;
  const collapse=document.createElement('button');collapse.className='v8-group-collapse';collapse.innerHTML=icon(expanded?'chevron-down':'chevron-right')+'<span>'+T8.labels[group]+'</span><small>'+populated.length+'</small>';collapse.setAttribute('aria-expanded',expanded);collapse.onclick=()=>{state.collapsedTrackGroups={...state.collapsedTrackGroups,[group]:expanded};tracks();paint();commit();};header.append(collapse);
  const key=group==='video'?'video':group==='graphics'?'graphics':group;const toggle=document.createElement('button');toggle.className='v8-group-mute';toggle.title=(group==='audio'?'Mute / unmute ':'Hide / show ')+T8.labels[group];toggle.setAttribute('aria-label',toggle.title);toggle.innerHTML=icon(group==='audio'?(state.hiddenTracks?.[key]?'volume-x':'volume-2'):(state.hiddenTracks?.[key]?'eye-off':'eye'));toggle.onclick=()=>transaction(()=>{const off=!state.hiddenTracks?.[key];state.hiddenTracks={...state.hiddenTracks,[key]:off,...(group==='audio'?{music:off}:group==='video'?{overlay:off}:{})};});header.append(toggle);if(group!=='captions'){const add=document.createElement('button');add.className='v8-add-track';add.innerHTML=icon('plus');add.title='Add '+T8.labels[group]+' track';add.setAttribute('aria-label',add.title);add.onclick=()=>transaction(()=>{let i=1;while(state.timelineTracks.some(t=>t.id===group+'-'+i))i++;state.timelineTracks.push({id:group+'-'+i,group,name:T8.labels[group]+' '+i,manual:true});state.collapsedTrackGroups={...state.collapsedTrackGroups,[group]:false};});header.append(add);}surface.append(header);
  if(!list.length&&expanded&&PLACEHOLDER_V15[group])surface.append(placeholderRowV15(group));
  for(const track of list){
   const assigned=blocks.filter(x=>x.entry?.item[x.entry.field]===track.id);let row,lane;
   if(track.id==='video-main'){row=main;lane=row.querySelector('.vt-lane');row.querySelector('.vt-label').replaceChildren();}
   else{row=document.createElement('div');row.className='vt-row';const label=document.createElement('span');label.className='vt-label';lane=document.createElement('div');lane.className='vt-lane '+({video:'vt-overlay',audio:'vt-audio',graphics:'vt-text',captions:'vt-captions',effects:'vt-zoom'})[group];row.append(label,lane);const head=document.createElement('span');head.className='vt-head';lane.append(head);wireLane(lane);}
   row.dataset.trackId=track.id;row.hidden=!expanded;lane.dataset.trackId=track.id;lane.dataset.group=group;lane.setAttribute('aria-label',track.name+' track');
   const label=row.querySelector('.vt-label'),text=document.createElement('span');text.textContent=trackLabelV15(track,group);text.title=track.id==='video-main'?'Main video (V1)':track.name;label.append(text);const lock=document.createElement('button');lock.innerHTML=icon(track.locked?'lock':'lock-open');lock.title=(track.locked?'Unlock ':'Lock ')+track.name;lock.setAttribute('aria-label',lock.title);lock.onclick=()=>transaction(()=>track.locked=!track.locked);label.append(lock);
   for(const {b,entry:e}of assigned){if(e.type==='video')continue;lane.append(b);dragBlockV6(b,lane,e.type,e.type==='caption'?state.transcript.indexOf(e.item):e.id);}
   lane.ondragover=ev=>{const template=ev.dataTransfer.types.includes('application/x-video-visor-template'),media=ev.dataTransfer.types.includes('application/x-video-visor-media');if(!template&&!media)return;ev.preventDefault();const okay=!track.locked&&(template?group==='graphics':['audio','video'].includes(group));ev.dataTransfer.dropEffect=okay?'copy':'none';lane.classList.toggle('v8-drop-target',okay);if(okay){const r=lane.getBoundingClientRect();indicatorV7(lane,Math.max(0,Math.min(total(),(ev.clientX-r.left)/r.width*total())));}};
   lane.ondragleave=()=>{lane.classList.remove('v8-drop-target');q('#v7-insert-marker')?.remove();};
   lane.ondrop=ev=>{const template=ev.dataTransfer.getData('application/x-video-visor-template'),media=ev.dataTransfer.getData('application/x-video-visor-media');if(!template&&!media)return;ev.preventDefault();ev.stopPropagation();lane.classList.remove('v8-drop-target');q('#v7-insert-marker')?.remove();if(track.locked)return notice('Unlock this track first.');const r=lane.getBoundingClientRect(),fps=state.assets.find(a=>a.id===source().clip.asset)?.fps||30,at=Math.max(0,Math.min(total()-.05,Math.round((ev.clientX-r.left)/r.width*total()*fps)/fps));if(template){if(group!=='graphics')return notice('Drop titles onto Text & graphics.');return addTemplateV8(template,at,track.id);}const a=state.assets.find(a=>a.id===media);if(!a)return;if(a.kind==='audio'){if(group!=='audio')return notice('Drop audio onto an Audio track.');transaction(()=>{state.audioClips??=[];state.audioClips.push({id:crypto.randomUUID(),asset:a.id,name:a.name,start:at,end:Math.min(total(),at+a.duration),sourceIn:0,volume:100,trackId:track.id});});}else if(group==='video'){if(track.id==='video-main'){state.time=at;appendAsset(media,at);}else transaction(()=>{state.overlays??=[];state.overlays.push({id:crypto.randomUUID(),asset:a.id,name:a.name,start:at,end:Math.min(total(),at+(a.duration||5)),sourceIn:0,x:50,y:50,scale:50,trackId:track.id});});}else notice('Drop footage onto a Video track.');};
   surface.append(row);
  }
 }
 stripsV10.forEach((strip,i)=>{strip.style.bottom=((stripsV10.length-1-i)*20)+'px';surface.append(strip);});
 const pad=document.createElement('div');pad.className='v7-select-space';surface.append(pad);host.onpointerdown=e=>{if(e.target===pad||e.target===surface||e.target===host)marqueeV7(e);};host.scrollTop=scrollTop;
 q('#v7-actions')?.remove();q('.vt-controls span').textContent='';const top=q('.ed-timeline-top');if(!q('#v7-selection-count')){const count=document.createElement('span');count.id='v7-selection-count';top.append(count);}let actions=q('#v8-timeline-actions');if(!actions){actions=document.createElement('div');actions.id='v8-timeline-actions';actions.className='ed-row';top.append(actions);}for(const [id,label,name]of [['ed-split','Split at playhead','scissors'],['ed-delete','Delete selection','trash-2']]){const b=q('#'+id);b.innerHTML=icon(name);b.setAttribute('aria-label',label);b.title=label;actions.append(b);}actions.append(snapButtonV15());q('#ed-transcript').hidden=true;
 let end=q('#v8-timeline-view');if(!end){end=document.createElement('div');end.id='v8-timeline-view';end.className='ed-row';top.append(end);}let view=q('#v8-show-tracks');if(!view){view=document.createElement('button');view.id='v8-show-tracks';end.append(view);}view.textContent=all?'Focus tracks':'Show all tracks';view.onclick=()=>{state.timelineView=all?'auto':'all';state.collapsedTrackGroups={};tracks();paint();commit();};end.append(q('#v5-fit-timeline'));const zoom=q('.vt-controls label');if(zoom)end.append(zoom);q('.vt-controls').hidden=true;
 top.querySelectorAll('.ed-row').forEach(n=>{if(!n.childElementCount)n.remove();});emptyTimelineV15();zoomRangeV15(host);markSelectionV7();icons();if(focus!==lastTrackFocusV8&&!window.exporting){revealGroupV15(host,surface,focus);lastTrackFocusV8=focus;}
};
const openBeforeV8=open;
open=function(name){liveGestureV8?.finish();const focus=({elements:'graphics',captions:'captions',effects:'effects',audio:'audio'})[name];if(focus&&state.collapsedTrackGroups)delete state.collapsedTrackGroups[focus];openBeforeV8(name);};
window.addEventListener('blur',()=>liveGestureV8?.finish());

// END EDITOR V8

// START EDITOR V10
// Playback bar, shortcuts, on-video text editing, clearer panels and real thumbnails.
let lastPanelV10=null,previewMutedV10=false;
const typingV10=ev=>['INPUT','TEXTAREA','SELECT'].includes(ev.target.tagName)||ev.target.isContentEditable;
function shortcutsV10(){
 const rows=[['Space or K','Play / pause'],['← →','Previous / next frame (hold Shift for 10)'],['J · L','Back / forward one second'],['Home · End','Start / end of the video'],['S','Split at the playhead'],['Delete','Delete the selection'],['⌘Z · ⇧⌘Z','Undo / redo'],['⌘C · ⌘V','Copy / paste the selection'],['+ · −','Zoom the timeline in / out'],['Esc','Clear the selection or leave large preview'],['?','Show this list']];
 window.nativeShell?.modal('Keyboard shortcuts','<table class="v10-keys">'+rows.map(([k,d])=>'<tr><th>'+k+'</th><td>'+d+'</td></tr>').join('')+'</table><p class="v-small v-muted">Shortcuts are off while you type in a field. Double-click a title on the video to edit its text.</p>');
}
function largePreviewV10(on){
 on=on??!root.classList.contains('v10-large');root.classList.toggle('v10-large',on);
 const b=q('#v10-large');if(b){b.innerHTML=icon(on?'minimize-2':'maximize-2');b.title=on?'Back to editing (Esc)':'Large preview';b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',on);icons();}
}
function zoomTimelineV10(direction){const z=q('#vt-scale');if(!z)return;const next=Math.max(+z.min,Math.min(+z.max,direction>0?+z.value*1.4:+z.value/1.4));if(next===+z.value)return;z.value=next;z.dispatchEvent(new Event('input',{bubbles:true}));z.dispatchEvent(new Event('change',{bubbles:true}));}
function editTitleV10(e,el,field){
 if(e.tracking)return;stop();q('#v10-inline')?.remove();
 const node=el.querySelector(field==='subtitle'?'.v8-title-sub,.v11-sub':'.v8-title-main,.v11-main')||el,canvas=q('#ed-canvas'),box=canvas.getBoundingClientRect(),r=el.getBoundingClientRect(),n=node.getBoundingClientRect(),cs=getComputedStyle(node),input=document.createElement('textarea');
 input.id='v10-inline';input.value=e[field]||'';input.maxLength=180;input.rows=1;input.setAttribute('aria-label',field==='subtitle'?'Supporting text':'Title text');
 Object.assign(input.style,{left:(r.left-box.left)+'px',top:(n.top-box.top-5)+'px',width:r.width+'px',minHeight:(n.height+10)+'px',fontFamily:cs.fontFamily,fontSize:cs.fontSize,fontWeight:cs.fontWeight,fontStyle:cs.fontStyle,letterSpacing:cs.letterSpacing,textAlign:cs.textAlign,textTransform:cs.textTransform});
 canvas.append(input);
 const grow=()=>{input.style.height='auto';input.style.height=input.scrollHeight+'px';};
 let done=false;const finish=save=>{if(done)return;done=true;const value=input.value.replace(/\s+$/,'');input.remove();if(save&&value!==(e[field]||'')&&(field==='subtitle'||value.trim()))transaction(()=>{const target=state.elements.find(x=>x.id===e.id);if(target)target[field]=value;});else render(true);};
 input.oninput=grow;input.onpointerdown=ev=>ev.stopPropagation();input.onblur=()=>finish(true);
 input.onkeydown=ev=>{ev.stopPropagation();if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();finish(true);}else if(ev.key==='Escape'){ev.preventDefault();finish(false);}};
 input.focus();input.select();grow();
}
const layersBeforeV10=layers;
// Selecting a layer redraws it between mouse-down and mouse-up, so the browser never reports a click or a
// double-click on it. A second press on the same title within 400 ms is treated as the double-click.
let lastPressV10={id:null,at:0,x:0,y:0};
layers=function(){layersBeforeV10();for(const e of state.elements){if(!e.templateId)continue;const el=q('.ed-layer[data-id="'+e.id+'"]');if(!el)continue;el.title='Double-click to edit the text';el.ondblclick=null;
 el.addEventListener('pointerdown',ev=>{if(ev.button!==0||ev.target.classList.contains('ed-handle'))return;const now=performance.now(),again=lastPressV10.id===e.id&&now-lastPressV10.at<400&&Math.hypot(ev.clientX-lastPressV10.x,ev.clientY-lastPressV10.y)<6;lastPressV10={id:e.id,at:now,x:ev.clientX,y:ev.clientY};if(!again)return;ev.preventDefault();ev.stopImmediatePropagation();lastPressV10.id=null;editTitleV10(e,q('.ed-layer[data-id="'+e.id+'"]')||el,ev.target.closest('.v8-title-sub,.v11-sub')?'subtitle':'text');},true);}};
function transitionThumbV10(button){
 const type=button.dataset.v5Transition,demo=button.querySelector('.v5-transition-demo');if(!demo||type==='cut')return;const out=demo.querySelector('i'),inc=demo.querySelector('b');if(!out||!inc)return;
 const show=p=>{if(type==='black'||type==='white'){demo.style.background=type;out.style.opacity=Math.max(0,1-2*p);inc.style.opacity=Math.max(0,2*p-1);inc.style.transform='none';return;}const t=window.editorModelV5.transforms(type,p);Object.assign(inc.style,{opacity:t.incoming.opacity,transform:t.incoming.transform||'none',clipPath:t.incoming.clipPath||'none'});Object.assign(out.style,{opacity:t.outgoing.opacity,transform:t.outgoing.transform||'none',clipPath:t.outgoing.clipPath||'none'});};
 const still=type==='black'||type==='white'?.3:type==='dissolve'?.6:.5;show(still);let timer=0;const run=()=>{cancelAnimationFrame(timer);const start=performance.now();const frame=now=>{if(!button.isConnected)return;const age=((now-start)/1000)%1.6;show(Math.min(1,age/.9));timer=requestAnimationFrame(frame);};timer=requestAnimationFrame(frame);},rest=()=>{cancelAnimationFrame(timer);show(still);};
 button.onmouseenter=run;button.onmouseleave=rest;button.onfocus=run;button.onblur=rest;
}
const panelBeforeV10=panel;
panel=function(){
 panelBeforeV10();const p=q('#ed-panel');
 // Panels open at the top instead of wherever the previous one was scrolled to.
 const key=state.panel+'|'+(state.panel==='element'?state.active:'');if(key!==lastPanelV10){p.scrollTop=0;lastPanelV10=key;}
 if(state.panel==='element'){
  const e=state.elements.find(e=>e.id===state.active);
  if(e?.templateId&&q('#ed-size')&&!p.querySelector('.v10-colours')){
   // Colours sit right under the size slider instead of inside a collapsed section.
   const box=document.createElement('div');box.className='v10-colours';const text=q('#ed-colour')?.closest('label'),bg=q('#v5-background')?.closest('label');
   if(text){text.firstChild.textContent='Text ';box.append(text);}
   const accent=document.createElement('label');accent.innerHTML='Accent <input id="v10-accent" type="color" value="'+(/^#[0-9a-f]{6}$/i.test(e.accent||'')?e.accent:'#1f7ae0')+'">';box.append(accent);
   if(bg){bg.firstChild.textContent='Panel ';box.append(bg);const none=document.createElement('label');none.className='ed-check';none.innerHTML='No panel<input id="v10-nobg" type="checkbox" '+(!e.background||e.background==='transparent'?'checked':'')+'>';box.append(none);}
   q('#ed-size').closest('label').after(box);bind('v10-accent',v=>e.accent=v);if(bg)bind('v10-nobg',(v,c)=>e.background=c.checked?'transparent':q('#v5-background').value);
   const hint=document.createElement('small');hint.className='v10-hint';hint.textContent='Tip: double-click the title on the video to edit it there.';q('#ed-text')?.closest('label')?.after(hint);
  }
 }
 if(state.panel==='captions')p.querySelectorAll('[data-cap]').forEach(b=>{
  // Each style button shows the real caption style.
  const first=b.querySelector('span');if(!first||first.classList.contains('v10-cap-thumb'))return;const style=b.dataset.cap,thumb=document.createElement('span');thumb.className='v10-cap-thumb';
  thumb.innerHTML='<span class="ed-captions" data-style="'+style+'" style="--ed-cap:#1f7ae0;font-family:'+esc(state.captionFont||'DM Sans')+'"><span>'+(style==='word'?'<b class="current">clear.</b>':'<b class="spoken">Make</b> <b class="current spoken">it</b> <b>clear.</b>')+'</span></span>';first.replaceWith(thumb);b.classList.replace('ed-preset','v10-preset');
 });
 if(state.panel==='transitions'||state.panel==='transition')p.querySelectorAll('[data-v5-transition]').forEach(transitionThumbV10);
 p.querySelectorAll('button').forEach(b=>{if(/^(Remove|Delete)\b/.test(b.textContent.trim()))b.classList.add('v10-danger');});
};
const tracksBeforeV10=tracks;
tracks=function(){tracksBeforeV10();for(const [id,text]of [['ed-split','Split'],['ed-delete','Delete']]){const b=q('#'+id);if(b&&!b.querySelector('span')){const label=document.createElement('span');label.textContent=text;b.append(label);}}};
function wireV10(){
 layoutV5();
 const bar=q('.ed-transport'),scrub=q('#ed-scrub'),time=q('#ed-time'),playButton=q('#ed-play'),frame=q('#ed-frame'),before=q('#v5-before');
 const make=(id,name,label,fn)=>{const b=document.createElement('button');b.id=id;b.type='button';b.innerHTML=icon(name);b.title=label;b.setAttribute('aria-label',label);b.onclick=fn;return b;};
 const group=cls=>{const d=document.createElement('div');d.className=cls;return d;};
 const step=n=>{stop();state.time=M.frameStep(state,state.time,n);paint();commit();};
 const row=group('v10-transport-row'),left=group('v10-transport-left'),middle=group('v10-transport-middle'),right=group('v10-transport-right');
 left.append(time,...[q('#v5-canvas'),q('#v5-ratio')].filter(Boolean));
 middle.append(make('v10-prev','step-back','Previous frame (←)',()=>step(-1)),playButton,make('v10-next','step-forward','Next frame (→)',()=>step(1)));
 const mute=make('v10-mute','volume-2','Mute preview sound',()=>{previewMutedV10=!previewMutedV10;window.native?.previewMute?.(previewMutedV10);mute.innerHTML=icon(previewMutedV10?'volume-x':'volume-2');mute.title=previewMutedV10?'Unmute preview sound':'Mute preview sound';mute.setAttribute('aria-label',mute.title);mute.setAttribute('aria-pressed',previewMutedV10);icons();});
 if(before){before.innerHTML=icon('eye');before.title='Hold to see the original, without effects';before.setAttribute('aria-label',before.title);}
 frame.title='Save this frame as an image';frame.setAttribute('aria-label',frame.title);
 right.append(mute,...(before?[before]:[]),frame,make('v10-large','maximize-2','Large preview',()=>largePreviewV10()),make('v10-keys','keyboard','Keyboard shortcuts (?)',shortcutsV10));
 row.append(left,middle,right);bar.classList.add('v10-transport');bar.replaceChildren(scrub,row);icons();
 onKeyV9(ev=>{
  if(typingV10(ev))return;
  if(ev.metaKey||ev.ctrlKey){if(ev.key.toLowerCase()==='s'){ev.preventDefault();notice('Your project saves automatically.');}return;}
  if(ev.altKey)return;const k=ev.key.toLowerCase();
  if(k==='s'){ev.preventDefault();q('#ed-split')?.click();}
  else if(k==='k'){ev.preventDefault();play();}
  else if(k==='j'||k==='l'){ev.preventDefault();stop();state.time=Math.max(0,Math.min(total(),state.time+(k==='j'?-1:1)*state.speed));paint();commit();}
  else if(ev.key==='Home'||ev.key==='End'){ev.preventDefault();stop();state.time=ev.key==='Home'?0:Math.max(0,total()-.001);paint();commit();}
  else if(ev.key==='+'||ev.key==='='){ev.preventDefault();zoomTimelineV10(1);}
  else if(ev.key==='-'||ev.key==='_'){ev.preventDefault();zoomTimelineV10(-1);}
  else if(ev.key==='?'){ev.preventDefault();shortcutsV10();}
  else if(ev.key==='Escape'&&root.classList.contains('v10-large'))largePreviewV10(false);
 });
}
// END EDITOR V10

// START EDITOR V11
// Titles, callouts and icons drawn by the 0.11 engine (engines/titles-v11.js). Elements made by it carry
// engine:'v11'; titles from earlier versions keep using the previous renderer.
const A11=window.titleModelV11,SVGNS='http://www.w3.org/2000/svg';
let categoryV11='titles',iconQueryV11='',safeGuidesV11=false;
const isV11=e=>e?.engine==='v11',portraitV11=()=>{const r=state.ratio.split('/').map(Number);return r[0]/r[1]<1;};
const pascalV11=name=>name.split('-').map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join('');
const kebabV11=name=>name.replace(/([a-z0-9])([A-Z])/g,'$1-$2').replace(/([A-Za-z])([0-9])/g,'$1-$2').toLowerCase();
const popularIconsV11=['rocket','lightbulb','target','circle-check','sparkles','chart-column','mouse-pointer-2','clock','download','circle-alert','heart','shield-check','star','thumbs-up','zap','bell','play','message-circle','trending-up','users','calendar','mail','map-pin','lock','gift','flag','trophy','camera','mic','search','settings','globe','link','wallet','shopping-cart','percent','arrow-right','arrow-up-right','check','x','plus','eye','smile','flame','award','bookmark','megaphone','headphones','phone','wifi'];
function textUnitsV11(node,text,spec,role,units){
 node.replaceChildren();const mask=!!spec?.mask,space=part=>document.createTextNode(part.includes('\n')?'\n':' ');
 const wrap=(content,block)=>{const outer=document.createElement('span');outer.className='v11-u'+(mask?' v11-mask':'');if(block)outer.style.display='block';const inner=document.createElement('span');inner.className='v11-i';inner.textContent=content;outer.append(inner);return{outer,inner};};
 if(spec?.split==='word'){let index=0;for(const part of String(text).split(/(\s+)/)){if(!part)continue;if(/^\s+$/.test(part)){node.append(space(part));continue;}const w=wrap(part);node.append(w.outer);units.push({node:w.inner,role,spec,index:index++});}return null;}
 if(spec?.split==='char'){let index=0;for(const part of String(text).split(/(\s+)/)){if(!part)continue;if(/^\s+$/.test(part)){node.append(space(part));continue;}const word=document.createElement('span');word.className='v11-word';for(const ch of Array.from(part)){const c=document.createElement('span');c.className='v11-i';c.textContent=ch;word.append(c);units.push({node:c,role,spec,index:index++});}node.append(word);}return null;}
 const w=wrap(text,true);node.append(w.outer);if(spec)units.push({node:w.inner,role,spec,index:0});return w.inner;
}
function buildV11(el,e){
 if(e.kind==='icon')return buildIconV11(el,e);
 const t=A11.preset(e.templateId),layout=t?.layout||'stack',m=A11.motions[e.animation]||A11.motions['mask-up'],units=[],pieces={},panel=!!e.background&&e.background!=='transparent',has=v=>v!=null&&String(v).trim()!=='';
 el.classList.add('v11');el.dataset.layout=layout;el.dataset.legibility=e.legibility||'none';el.dataset.panel=panel?'solid':'none';el.dataset.align=e.align||'center';el.dataset.upper=e.upper?'1':'';
 el.style.borderLeft='';el.style.background='transparent';el.style.setProperty('--v11-accent',e.accent||'#2f8cff');el.style.setProperty('--v11-panel',panel?e.background:'transparent');el.style.fontSize=(e.size/(portraitV11()?3:6))+'cqw';
 const handle=el.querySelector('.ed-handle');el.replaceChildren();const box=document.createElement('span');box.className='v11-box';el.append(box);if(handle)el.append(handle);
 const shape=(name,parent=box)=>{const n=document.createElement('span');n.className='v11-piece v11-'+name;parent.append(n);pieces[name]=n;if(m[name])units.push({node:n,role:name,spec:m[name],index:0});return n;};
 const text=(name,value,parent=box,as=name)=>{const n=document.createElement('span');n.className='v11-piece v11-'+name;parent.append(n);pieces[name]=n;const whole=textUnitsV11(n,value,m[as]||null,as,units);if(as==='num')data.count={node:whole||n,field:name==='num'?'kicker':'text'};return n;};
 const group=cls=>{const n=document.createElement('span');n.className=cls;box.append(n);return n;};
 const data={units,pieces,layout,box,count:null,caret:null},numberMain=!!t?.numberMain||A11.numberLayouts.includes(layout);
 const main=(parent=box)=>has(e.text)?text('main',e.text,parent,numberMain?'num':'main'):null,sub=(parent=box)=>has(e.subtitle)?text('sub',e.subtitle,parent):null,kicker=()=>has(e.kicker)?text('kicker',e.kicker):null;
 if(layout==='rule'||layout==='underbar'){main();shape('bar');sub();}
 else if(layout==='highlight'){const node=main();if(node){const hl=document.createElement('span');hl.className='v11-piece v11-hl';node.prepend(hl);if(m.hl)units.push({node:hl,role:'hl',spec:m.hl,index:0});}sub();}
 else if(layout==='bar-left'||layout==='topline'){shape('bar');kicker();main();sub();}
 else if(layout==='plates'){const a=group('v11-plate v11-plate-a');shape('panel',a);main(a);if(has(e.subtitle)){const b=group('v11-plate v11-plate-b');shape('panel2',b);sub(b);}}
 else if(layout==='card'){shape('panel');shape('bar');kicker();main();sub();}
 else if(['band','pill','metric-card','pointer'].includes(layout)){shape('panel');kicker();main();sub();}
 else if(layout==='chapter'){if(has(e.kicker))text('num',e.kicker,box,'num');shape('bar');const col=group('v11-col');main(col);sub(col);}
 else if(layout==='step'){const badge=shape('badge');badge.textContent=has(e.kicker)?e.kicker:'1';const col=group('v11-col');main(col);sub(col);}
 else if(layout==='quote'){const mark=shape('mark');mark.textContent='“';main();shape('bar');sub();}
 else if(layout==='shape-box'||layout==='shape-circle'){const svg=document.createElementNS(SVGNS,'svg');svg.classList.add('v11-frame');const node=document.createElementNS(SVGNS,layout==='shape-circle'?'ellipse':'rect');node.setAttribute('pathLength','1');svg.append(node);box.append(svg);pieces.frame=node;units.push({node,role:'frame',spec:m.frame||{d:0,t:.8,e:'inOut'},index:0});}
 else if(layout==='shape-spot'){/* the layer itself is the lit area */}
 else{kicker();main();sub();}
 if(m.main?.caret&&pieces.main){const caret=document.createElement('span');caret.className='v11-caret';pieces.main.append(caret);data.caret=caret;}
 if(A11.shapes.includes(layout)){const r=state.ratio.split('/').map(Number);el.style.height=((e.h||30)/(r[0]/r[1]))+'cqw';}
 if(m.all)units.unshift({node:box,role:'all',spec:m.all,index:0});
 el._v11=data;
}
function buildIconV11(el,e){
 el.classList.add('v11');el.dataset.layout='icon';el.dataset.legibility='none';el.dataset.align='center';el.style.background='transparent';el.style.setProperty('--v11-accent',e.accent||'#2f6fe4');el.style.fontSize=(e.size/(portraitV11()?3:6))+'cqw';
 const handle=el.querySelector('.ed-handle');el.replaceChildren();const box=document.createElement('span');box.className='v11-box';const wrap=document.createElement('span');wrap.className='v11-icon';wrap.dataset.style=e.iconStyle||'badge';
 const def=globalThis.lucide?.icons?.[pascalV11(e.icon||'star')]||globalThis.lucide?.icons?.Star,svg=def?globalThis.lucide.createElement(def):document.createElementNS(SVGNS,'svg');svg.setAttribute('aria-hidden','true');
 const paths=[...svg.children];paths.forEach(p=>{p.setAttribute('pathLength','1');p.style.strokeDasharray='1';});wrap.append(svg);box.append(wrap);el.append(box);if(handle)el.append(handle);
 el._v11={layout:'icon',box,wrap,paths,units:[],pieces:{}};
}
function frameV11(el,e,time){
 const data=el._v11;if(!data)return;el.style.translate='';el.style.scale='';
 if(data.layout==='icon'){const f=A11.iconFrame(e,time,data.paths.length);el.style.opacity=f.opacity;data.wrap.style.transform='translate('+f.x.toFixed(2)+'%,'+f.y.toFixed(2)+'%) rotate('+f.rotate.toFixed(2)+'deg) scale('+(f.badge*f.scale).toFixed(4)+')';data.paths.forEach((p,i)=>p.style.strokeDashoffset=String(1-f.draw(i)));return;}
 const c=A11.clock(e,time),lead=data.layout==='pointer'?.4:data.layout==='arrow'?.45:0,mainCount=data.units.filter(u=>u.role==='main').length||1,mainSpec=A11.spec(e,'main'),afterMain=mainSpec?(mainSpec.st||0)*(mainCount-1)+mainSpec.d:0;
 el.style.opacity=data.layout==='shape-spot'?1:c.out;
 let typed=null;
 for(const u of data.units){
  const after=(u.spec.after==='main'?afterMain:0)+lead,{p}=A11.unit(e,time,u.spec,u.index,after);
  if(u.role==='frame'){u.node.style.strokeDashoffset=String(1-p);continue;}
  const s=A11.style(u.spec,p);u.node.style.opacity=s.opacity;u.node.style.transform=s.transform;
  if(u.spec.caret&&p>0)typed=u.node;
 }
 if(data.count){const s=A11.spec(e,'num');if(s?.count)data.count.node.textContent=A11.countText(e[data.count.field]||'',A11.ease.expo(A11.clamp((c.t-(s.d||0))/s.count)));}
 if(data.caret){const total=mainCount*(mainSpec?.st||0)+(mainSpec?.d||0),typing=c.t<total;if(typed&&data.caret.previousSibling!==typed)typed.after(data.caret);data.caret.style.opacity=typing||Math.floor(c.t*2.5)%2===0?1:0;}
 if(data.layout==='shape-spot')el.style.setProperty('--v11-dim',((e.dim??60)/100*A11.ease.out(A11.clamp(c.t/.5))*c.out).toFixed(3));
 if(pieceFrameV11[data.layout])pieceFrameV11[data.layout](el,e,data);
}
// Shape outlines are measured in pixels so corners stay round at any size.
const pieceFrameV11={
 'shape-box':(el,e,data)=>{const w=el.offsetWidth,h=el.offsetHeight,stroke=Math.max(2,(el.offsetParent?.clientWidth||600)*.005),svg=data.pieces.frame.ownerSVGElement;svg.setAttribute('viewBox','0 0 '+w+' '+h);const r=data.pieces.frame;r.setAttribute('x',stroke/2);r.setAttribute('y',stroke/2);r.setAttribute('width',Math.max(0,w-stroke));r.setAttribute('height',Math.max(0,h-stroke));r.setAttribute('rx',stroke*3);r.style.strokeWidth=stroke+'px';},
 'shape-circle':(el,e,data)=>{const w=el.offsetWidth,h=el.offsetHeight,stroke=Math.max(2,(el.offsetParent?.clientWidth||600)*.005),svg=data.pieces.frame.ownerSVGElement;svg.setAttribute('viewBox','0 0 '+w+' '+h);const r=data.pieces.frame;r.setAttribute('cx',w/2);r.setAttribute('cy',h/2);r.setAttribute('rx',Math.max(0,w/2-stroke/2));r.setAttribute('ry',Math.max(0,h/2-stroke/2));r.style.strokeWidth=stroke+'px';}
};
// Pointer line with dot, or hand-drawn arrow, from the label to the anchor point.
function geoV11(el,e,time){
 const layout=el._v11?.layout;if(!A11.geometric.includes(layout)||!e.anchor)return;const stage=el.offsetParent||el.parentElement,host=el.parentElement;if(!stage||!host)return;const W=stage.clientWidth,H=stage.clientHeight;
 let svg=host.querySelector('.v11-geo[data-for="'+e.id+'"]');
 if(!svg){svg=document.createElementNS(SVGNS,'svg');svg.classList.add('v11-geo');svg.dataset.for=e.id;svg.innerHTML=layout==='pointer'?'<line class="v11-geo-line" pathLength="1"/><circle class="v11-geo-ring"/><circle class="v11-geo-dot"/>':'<path class="v11-geo-line" pathLength="1"/><path class="v11-geo-head"/>';host.insertBefore(svg,el);}
 svg.style.display=el.hidden?'none':'';if(el.hidden||!W)return;svg.setAttribute('viewBox','0 0 '+W+' '+H);svg.style.setProperty('--v11-accent',e.accent||'#ffffff');
 const c=A11.clock(e,time),cx=e.x/100*W,cy=e.y/100*H,hw=el.offsetWidth/2+W*.006,hh=el.offsetHeight/2+W*.006,ax=e.anchor.x/100*W,ay=e.anchor.y/100*H,stroke=Math.max(1.5,W*.0042),dx=ax-cx,dy=ay-cy,k=Math.min(hw/Math.max(1e-6,Math.abs(dx)),hh/Math.max(1e-6,Math.abs(dy)),1),sx=cx+dx*k,sy=cy+dy*k,line=svg.querySelector('.v11-geo-line');
 svg.style.opacity=c.out;line.style.strokeWidth=stroke+'px';
 if(layout==='pointer'){
  const dot=A11.ease.spring(A11.clamp(c.t/.45)),draw=A11.ease.inOut(A11.clamp((c.t-.12)/.4)),r=W*.008,pulse=Math.max(0,((c.t-.6)%1.8)/1.8),ring=svg.querySelector('.v11-geo-ring'),d=svg.querySelector('.v11-geo-dot');
  line.setAttribute('x1',ax);line.setAttribute('y1',ay);line.setAttribute('x2',sx);line.setAttribute('y2',sy);line.style.strokeDashoffset=String(1-draw);
  d.setAttribute('cx',ax);d.setAttribute('cy',ay);d.setAttribute('r',Math.max(0,r*dot));d.style.strokeWidth=(stroke*.8)+'px';
  ring.setAttribute('cx',ax);ring.setAttribute('cy',ay);ring.setAttribute('r',r*(1+2.4*pulse));ring.style.strokeWidth=stroke+'px';ring.style.opacity=c.t>.6?(1-pulse)*.7:0;
 }else{
  const length=Math.hypot(ax-sx,ay-sy)||1,nx=-(ay-sy)/length,ny=(ax-sx)/length,bend=length*.2,qx=(sx+ax)/2+nx*bend,qy=(sy+ay)/2+ny*bend,draw=A11.ease.inOut(A11.clamp(c.t/.6)),head=svg.querySelector('.v11-geo-head'),tl=Math.hypot(ax-qx,ay-qy)||1,tx=(ax-qx)/tl,ty=(ay-qy)/tl,size=Math.max(8,W*.024),rot=(vx,vy,a)=>[vx*Math.cos(a)-vy*Math.sin(a),vx*Math.sin(a)+vy*Math.cos(a)],[lx,ly]=rot(-tx,-ty,.5),[rx,ry]=rot(-tx,-ty,-.5),grow=A11.ease.out(A11.clamp((c.t-.5)/.22));
  line.setAttribute('d','M'+sx.toFixed(1)+' '+sy.toFixed(1)+' Q'+qx.toFixed(1)+' '+qy.toFixed(1)+' '+ax.toFixed(1)+' '+ay.toFixed(1));line.style.strokeDashoffset=String(1-draw);line.style.strokeWidth=(stroke*1.5)+'px';
  head.setAttribute('d','M'+(ax+lx*size*grow).toFixed(1)+' '+(ay+ly*size*grow).toFixed(1)+' L'+ax.toFixed(1)+' '+ay.toFixed(1)+' L'+(ax+rx*size*grow).toFixed(1)+' '+(ay+ry*size*grow).toFixed(1));head.style.strokeWidth=(stroke*1.5)+'px';head.style.opacity=grow>0?1:0;
 }
}
function fitV11(el,e){
 const data=el._v11,stage=el.offsetParent;if(!data||!stage||el.hidden||data.layout==='icon'||A11.shapes.includes(data.layout))return;const H=stage.clientHeight,W=stage.clientWidth;if(!H)return;
 const base=e.size/(portraitV11()?3:6),key=[e.text,e.subtitle,e.kicker,e.size,e.width,e.font,e.weight,e.y,e.animation,state.ratio,W,H].join('|');if(el.dataset.fitV11===key)return;
 if(data.count)data.count.node.textContent=e[data.count.field]||'';
 let size=base;el.style.fontSize=size+'cqw';for(let i=0;i<18&&el.offsetHeight>H*.84&&size>base*.3;i++){size*=.9;el.style.fontSize=size+'cqw';}
 const half=el.offsetHeight/H*50;el.style.top=Math.max(Math.min(half+3,50),Math.min(Math.max(97-half,50),e.y))+'%';el.dataset.fitV11=key;
}
const layersBeforeV11=layers;
layers=function(){
 layersBeforeV11();q('#ed-layers').querySelectorAll('.v11-geo,.v11-anchor').forEach(n=>n.remove());
 for(const e of state.elements){
  if(!isV11(e))continue;const el=q('.ed-layer[data-id="'+e.id+'"]');if(!el)continue;buildV11(el,e);el.title=e.kind==='icon'?'':'Double-click to edit the text';
  const layout=el._v11.layout,active=e.id===state.active&&!window.exporting;
  if(active&&A11.geometric.includes(layout)&&e.anchor){
   // The end of the pointer or arrow has its own handle.
   const a=document.createElement('div');a.className='v11-anchor';a.title='Drag to move where this points';a.style.left=e.anchor.x+'%';a.style.top=e.anchor.y+'%';
   a.onpointerdown=ev=>{ev.preventDefault();ev.stopPropagation();stop();snapshot();const box=q('#ed-canvas').getBoundingClientRect();a.setPointerCapture(ev.pointerId);a.onpointermove=v=>{e.anchor={x:Math.max(2,Math.min(98,(v.clientX-box.left)/box.width*100)),y:Math.max(2,Math.min(98,(v.clientY-box.top)/box.height*100))};a.style.left=e.anchor.x+'%';a.style.top=e.anchor.y+'%';paint();};a.onpointerup=()=>{a.onpointermove=null;tracks();commit();};};
   q('#ed-layers').append(a);
  }
  if(active&&A11.shapes.includes(layout)){
   // Shapes resize in both directions from their corner handle.
   const handle=el.querySelector('.ed-handle');if(handle)handle.addEventListener('pointerdown',ev=>{ev.preventDefault();ev.stopImmediatePropagation();stop();snapshot();const box=q('#ed-canvas').getBoundingClientRect(),x0=ev.clientX,y0=ev.clientY,w0=e.width,h0=e.h||30,r=state.ratio.split('/').map(Number);handle.setPointerCapture(ev.pointerId);handle.onpointermove=v=>{e.width=Math.max(6,Math.min(96,w0+(v.clientX-x0)/box.width*200));e.h=Math.max(6,Math.min(96,h0+(v.clientY-y0)/box.height*200));el.style.width=e.width+'%';el.style.height=(e.h/(r[0]/r[1]))+'cqw';paint();};handle.onpointerup=()=>{handle.onpointermove=null;render();};},true);
  }
 }
};
const paintBeforeV11=paint;
paint=function(){paintBeforeV11();for(const e of state.elements){if(!isV11(e))continue;const el=q('.ed-layer[data-id="'+e.id+'"]');if(!el||!el._v11)continue;fitV11(el,e);frameV11(el,e,state.time);geoV11(el,e,state.time);}const safe=q('.v11-safe');if(safe)safe.hidden=!safeGuidesV11||!!window.exporting;};
function addTemplateV11(id,time=state.time,trackId){
 if(!state.clips.length||total()<.1)return notice('Add footage first.');if(state.elements.length>=100)return notice('100 elements maximum per project.');
 // 0.15: from the panel, the title starts 1.6 s (its entrance) before the playhead, so it is fully visible there; the playhead does not move.
 const start=Math.max(0,Math.min(total()-.1,time===state.time&&!trackId?time-1.6:time)),end=Math.min(total(),start+5),e=id.startsWith('icon:')?A11.createIcon(id.slice(5),start,end):A11.create(id,start,end,state.ratio,{captionsAtBottom:!!state.captions&&state.transcript.length>0&&(state.captionPosition||'bottom')==='bottom'});if(!e)return;
 transaction(()=>{if(trackId)e.trackId=trackId;state.elements.push(e);state.active=e.id;state.panel='element';});selectionV7=[{type:'element',id:e.id}];markSelectionV7();
}
const addTemplateBeforeV11=addTemplateV8;
addTemplateV8=function(id,time,trackId){return A11.preset(id)||String(id).startsWith('icon:')?addTemplateV11(id,time,trackId):addTemplateBeforeV11(id,time,trackId);};
function thumbV11(sample){
 // A small stage that uses the real renderer, so a tile looks like the title it adds.
 const stage=document.createElement('span');stage.className='v11-thumb';const layer=document.createElement('span');layer.className='v11-thumb-layer';layer.style.cssText='left:'+sample.x+'%;top:'+sample.y+'%;width:'+sample.width+'%;font-family:"'+sample.font+'";font-weight:'+(sample.weight||600)+';color:'+sample.colour+';';stage.append(layer);
 const draw=t=>{if(!layer._v11)buildV11(layer,sample);frameV11(layer,sample,t);geoV11(layer,sample,t);};
 return{stage,draw};
}
function libraryV11(p){
 const current=[...A11.categories.map(c=>c[0]),'icons'].includes(categoryV11)?categoryV11:'titles';
 p.innerHTML='<h3>Text & graphics</h3><div class="v8-categories" role="group" aria-label="Category">'+[...A11.categories,['icons','Icons']].map(([k,n])=>'<button data-v11-category="'+k+'" class="'+(current===k?'active':'')+'" aria-pressed="'+(current===k)+'">'+n+'</button>').join('')+'</div>'+(current==='icons'?'<input class="v11-search" id="v11-icon-search" type="search" placeholder="Search 1,500+ icons…" aria-label="Search icons" value="'+esc(iconQueryV11)+'"><div class="v11-icon-grid"></div>':'<div class="v11-tiles"></div>');
 p.querySelectorAll('[data-v11-category]').forEach(b=>b.onclick=()=>{categoryV11=b.dataset.v11Category;panel();});
 if(current==='icons'){
  const grid=p.querySelector('.v11-icon-grid'),fill=()=>{const term=iconQueryV11.trim().toLowerCase().replace(/\s+/g,'-'),all=Object.keys(globalThis.lucide?.icons||{}).map(kebabV11),names=term?[...new Set(all.filter(n=>n.includes(term)))].slice(0,80):popularIconsV11;grid.replaceChildren();for(const name of names){if(!globalThis.lucide?.icons?.[pascalV11(name)])continue;const b=document.createElement('button');b.className='v11-icon-tile';b.dataset.icon=name;b.title=name.replace(/-/g,' ');b.setAttribute('aria-label','Add '+b.title+' icon');b.innerHTML=icon(name);b.onclick=()=>addTemplateV11('icon:'+name);templateDragV8(b,'icon:'+name);grid.append(b);}if(!grid.childElementCount)grid.innerHTML='<p>No icons match “'+esc(iconQueryV11)+'”.</p>';icons();};
  const search=q('#v11-icon-search');search.oninput=()=>{iconQueryV11=search.value;fill();};search.onkeydown=ev=>ev.stopPropagation();fill();return;
 }
 const tiles=p.querySelector('.v11-tiles');
 for(const t of A11.catalog.filter(t=>t.category===current)){
  const b=document.createElement('button');b.className='v11-tile';b.dataset.template=t.id;b.setAttribute('aria-label','Add '+t.name);
  const sample={...A11.create(t.id,0,3.6,'16/9'),id:'thumb-'+t.id},lower=t.category==='lower';if(lower){sample.y=62;sample.width=Math.min(86,sample.width*1.7);sample.x=8+sample.width/2;}else if(!A11.geometric.includes(t.layout)){sample.x=50;sample.y=50;sample.width=Math.min(92,sample.width*1.45);}else{sample.width=Math.min(60,sample.width*1.5);}
  sample.size=sample.size*(A11.shapes.includes(t.layout)?1:1.5);const thumb=thumbV11(sample),name=document.createElement('small');name.textContent=t.name;b.append(thumb.stage,name);tiles.append(b);
  let timer=0;const still=()=>{cancelAnimationFrame(timer);thumb.draw(2.2);},run=()=>{cancelAnimationFrame(timer);const begin=performance.now();const tick=now=>{if(!b.isConnected)return;thumb.draw(((now-begin)/1000)%4.2);timer=requestAnimationFrame(tick);};timer=requestAnimationFrame(tick);};
  requestAnimationFrame(still);b.onmouseenter=run;b.onmouseleave=still;b.onfocus=run;b.onblur=still;b.onclick=()=>addTemplateV11(t.id);templateDragV8(b,t.id);
 }
}
function elementPanelV11(p,e){
 const t=A11.preset(e.templateId),layout=t?.layout||(e.kind==='icon'?'icon':'stack'),shape=A11.shapes.includes(layout),hex=v=>/^#[0-9a-f]{6}$/i.test(v||'')?v:'#ffffff',panelOn=!!e.background&&e.background!=='transparent';
 const colour=(id,label,value)=>'<label>'+label+' <input id="'+id+'" type="color" value="'+hex(value)+'"></label>';
 const timing='<details><summary>Position & timing</summary>'+(shape?'':range('ed-width','Width %',e.width,8,96))+range('ed-x','Horizontal %',e.x,2,98)+range('ed-y','Vertical %',e.y,2,98)+'<label>Start (s)<input id="ed-elstart" type="number" min="0" step=".1" value="'+Number((e.start/state.speed).toFixed(3))+'"></label><label>End (s)<input id="ed-elend" type="number" min="0" step=".1" value="'+Number((e.end/state.speed).toFixed(3))+'"></label></details>';
 const actions='<div class="ed-row"><button id="ed-center">Centre</button><button id="ed-remove">Remove</button></div>',back='<button id="v11-back" class="ed-wide">← Browse text & graphics</button>';
 let html=back;
 if(e.kind==='icon'){
  html+='<h3>Edit icon</h3>'+range('ed-size','Size',e.size,10,90)+'<div class="v10-colours">'+colour('ed-colour','Icon',e.colour)+colour('v10-accent','Badge',e.accent)+'</div>'
   +select('v11-icon-style','Style',[['badge','Round badge'],['square','Square badge'],['ring','Ring'],['plain','Icon only']],e.iconStyle||'badge')
   +select('v11-entrance','Entrance',[['draw','Draw on'],['pop','Pop in'],['none','None']],e.entrance||'draw')
   +select('v11-loop','Motion while on screen',[['none','Still'],['pulse','Pulse'],['float','Float'],['wiggle','Wiggle'],['spin','Spin']],e.loop||'none')
   +'<label class="ed-check">Animate out<input id="v8-out" type="checkbox" '+(e.animateOut!==false?'checked':'')+'></label>'+actions+timing;
 }else{
  const textual=!shape,label=layout==='chapter'?'Number':layout==='step'?'Badge':'Small label';
  html+='<h3>'+(shape?'Edit '+t.name.toLowerCase():t?.category==='callouts'?'Edit callout':'Edit title')+'</h3>'
   +(textual?'<label>Text<textarea id="ed-text" maxlength="180">'+esc(e.text)+'</textarea></label>'+(['arrow','pill'].includes(layout)?'':'<label>Supporting text<input id="v8-subtitle" type="text" maxlength="180" value="'+esc(e.subtitle||'')+'"></label>')+(t?.kicker||e.kicker?'<label>'+label+'<input id="v11-kicker" type="text" maxlength="40" value="'+esc(e.kicker||'')+'"></label>':'')
     +select('ed-font','Font',A11.fonts.map(([k,n])=>[k,n+' · '+k]),e.font)+range('ed-size','Size',e.size,10,96)
     +'<div class="v11-row" role="group" aria-label="Alignment">'+[['left','Left'],['center','Centre'],['right','Right']].map(([k,n])=>'<button data-v11-align="'+k+'" aria-pressed="'+((e.align||'center')===k)+'">'+n+'</button>').join('')+'</div>':'')
   +(shape?range('ed-width','Width %',e.width,6,96)+range('v11-height','Height %',e.h||30,6,96):'')
   +'<div class="v10-colours">'+(textual?colour('ed-colour','Text',e.colour):'')+(layout==='shape-spot'?'':colour('v10-accent',shape||A11.geometric.includes(layout)?'Line':'Accent',e.accent))+(textual&&layout!=='arrow'?colour('v5-background','Panel',e.background)+'<label class="ed-check">No panel<input id="v10-nobg" type="checkbox" '+(panelOn?'':'checked')+'></label>':'')+'</div>'
   +(layout==='shape-spot'?range('v11-dim','Darken the rest %',e.dim??60,10,90):'')
   +(textual?select('v11-legibility','Legibility on busy footage',A11.legibility,e.legibility||'none')+select('v8-motion','Animation',A11.motionList,e.animation):'')
   +range('v8-motion-speed','Animation speed',e.animationSpeed||1,.5,2)+'<label class="ed-check">Animate out<input id="v8-out" type="checkbox" '+(e.animateOut!==false?'checked':'')+'></label>'
   +(textual?'<label class="ed-check">All capitals<input id="v11-upper" type="checkbox" '+(e.upper?'checked':'')+'></label><small class="v10-hint">Tip: double-click the text on the video to edit it there.</small>':'')
   +(A11.geometric.includes(layout)?'<small class="v10-hint">Drag the round handle on the video to choose what this points at.</small>':'')+actions+timing;
 }
 p.innerHTML=html;
 const live={'ed-text':v=>e.text=v,'v8-subtitle':v=>e.subtitle=v,'v11-kicker':v=>e.kicker=v,'ed-font':v=>e.font=v,'ed-size':v=>e.size=+v,'ed-width':v=>e.width=+v,'ed-x':v=>e.x=+v,'ed-y':v=>e.y=+v,'v11-height':v=>e.h=+v,'v11-dim':v=>e.dim=+v,'ed-colour':v=>e.colour=v,'v10-accent':v=>e.accent=v,'v5-background':v=>e.background=v,'v11-legibility':v=>e.legibility=v,'v8-motion':v=>e.animation=v,'v8-motion-speed':v=>e.animationSpeed=+v,'v11-icon-style':v=>e.iconStyle=v,'v11-entrance':v=>e.entrance=v,'v11-loop':v=>e.loop=v};
 for(const [id,fn]of Object.entries(live))if(q('#'+id))bind(id,fn);
 if(q('#v8-motion-speed')){q('#v8-motion-speed').step='.1';q('#v8-motion-speed').value=e.animationSpeed||1;}
 if(q('#v8-out'))bind('v8-out',(v,c)=>e.animateOut=c.checked);if(q('#v11-upper'))bind('v11-upper',(v,c)=>e.upper=c.checked);
 if(q('#v10-nobg'))bind('v10-nobg',(v,c)=>e.background=c.checked?'transparent':q('#v5-background').value);
 p.querySelectorAll('[data-v11-align]').forEach(b=>b.onclick=()=>transaction(()=>{e.align=b.dataset.v11Align;}));
 q('#v11-back').onclick=()=>open('elements');q('#ed-center').onclick=()=>transaction(()=>{e.x=50;e.y=50;});q('#ed-remove').onclick=()=>transaction(()=>{state.elements=state.elements.filter(x=>x.id!==e.id);state.active=null;state.panel='elements';});
 for(const id of ['ed-elstart','ed-elend'])q('#'+id).onchange=()=>{const a=+q('#ed-elstart').value*state.speed,b=+q('#ed-elend').value*state.speed;if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b>total()+.001||b<=a){notice('Timing must fit inside your video.');panel();return;}transaction(()=>{e.start=a;e.end=Math.min(total(),b);});};
 p.querySelectorAll('button').forEach(b=>{if(/^(Remove|Delete)\b/.test(b.textContent.trim()))b.classList.add('v10-danger');});
}
const panelBeforeV11=panel;
panel=function(){
 panelBeforeV11();const p=q('#ed-panel');
 if(state.panel==='elements'){libraryV11(p);icons();}
 else if(state.panel==='element'){const e=state.elements.find(e=>e.id===state.active);if(isV11(e)){elementPanelV11(p,e);icons();}}
};
function wireV11(){
 // Fonts used by presets are loaded up front so the first frame (and every export frame) has them.
 for(const [family]of A11.fonts)for(const weight of [400,500,700])document.fonts.load(weight+' 20px "'+family+'"').catch(()=>{});
 document.fonts.ready.then(()=>{if(state.elements.some(isV11)){layers();paint();}});
 const guides=document.createElement('div');guides.className='v11-safe';guides.hidden=true;q('#ed-canvas').append(guides);
 const right=q('.v10-transport-right');if(right){const b=document.createElement('button');b.id='v11-guides';b.type='button';b.innerHTML=icon('scan');b.title='Safe-area guides';b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed','false');b.onclick=()=>{safeGuidesV11=!safeGuidesV11;b.setAttribute('aria-pressed',safeGuidesV11);paint();};right.insertBefore(b,q('#v10-large'));icons();}
}
// END EDITOR V11

// EDITOR V12 — Record explainer: a camera video in a circle over a screen recording.
// The camera is linked to the screen recording (see engines/explainer-v12.js): its timeline pieces are
// worked out from the main track before every redraw, so it stays in sync through any edit.
const X12=window.explainerV12;
const renderBeforeV12=render;
render=function(skip){X12.relink(state);renderBeforeV12(skip);};
// Sliders and colour pickers redraw through layers() while they are being dragged, without a full render.
const layersBeforeV12=layers;
layers=function(){X12.relink(state);layersBeforeV12();};
const linkOfV12=o=>o?.linkId?(state.cameraLinks||[]).find(l=>l.id===o.linkId):null;
function selectOverlayV12(id){if(!(state.overlays||[]).some(o=>o.id===id))return;timelineSelection={type:'overlay',id};state.active=id;open('overlay');}
function explainerV12(o={}){
 const camera=o.asset||state.assets.find(a=>a.id===o.camera),screen=state.assets.find(a=>a.id===o.screen);
 if(!screen||!camera||screen.id===camera.id||camera.kind!=='video'||screen.kind==='audio'){notice('Choose a screen recording and a different camera video.');return false;}
 const id='cam-'+crypto.randomUUID();
 transaction(()=>{
  if(!state.assets.some(a=>a.id===camera.id))state.assets.push(clone(camera));
  // The frame follows the screen recording unless a shape was chosen by hand.
  if(state.ratio===state.originalRatio&&state.ratio===V5.canvasFor(camera)&&screen.kind==='video'){state.ratio=V5.canvasFor(screen);state.originalRatio=state.ratio;}
  // The camera plays inside its shape, not as footage of its own.
  state.clips=state.clips.filter(c=>c.asset!==camera.id&&c.asset!=='blank');
  if(!state.clips.some(c=>c.asset===screen.id))state.clips.push({id:crypto.randomUUID(),asset:screen.id,name:screen.name,kind:screen.kind,start:0,end:screen.duration||5,limit:screen.duration||5});
  state.cameraLinks=[...(state.cameraLinks||[]).filter(l=>l.asset!==camera.id),X12.create(id,screen.id,camera.id,state.ratio,o)];
  state.selected=Math.max(0,state.clips.findIndex(c=>c.asset===screen.id));X12.relink(state);
  const first=state.overlays.find(p=>p.linkId===id);
  if(first){state.active=first.id;timelineSelection={type:'overlay',id:first.id};state.panel='overlay';}
 });
 if(!(state.overlays||[]).some(p=>p.linkId===id))notice('The camera video does not overlap the screen recording. Check the sync offset.');
 return true;
}
function explainerDialogV12(){
 const shell=window.nativeShell,videos=state.assets.filter(a=>a.kind==='video'),find=s=>document.querySelector(s);
 if(videos.length<2){
  shell.modal('Screen + camera explainer','<p class="v-muted">This layout needs two videos: your screen recording and the video of you. Import both, then choose which is which.</p><div class="v-row"><button class="v-button primary" id="v12-import">Import videos</button></div>');
  find('#v12-import').onclick=async()=>{shell.closeModal();await window.nativeImport(false);if(state.assets.filter(a=>a.kind==='video').length>=2)explainerDialogV12();};return;
 }
 // Best guess: the screen recording is the one recorded here, else the larger picture.
 const area=a=>(a.width||0)*(a.height||0),screen=videos.find(a=>a.cursor?.length)||videos.slice().sort((a,b)=>area(b)-area(a))[0],camera=videos.find(a=>a.id!==screen.id);
 const list=(id,label,chosen)=>'<label class="v12-field">'+label+'<select class="v-select" id="'+id+'">'+videos.map(a=>'<option value="'+a.id+'" '+(a.id===chosen.id?'selected':'')+'>'+esc(a.name)+' · '+V7.formatTime(a.duration||0)+'</option>').join('')+'</select></label>';
 const pick=(id,label,options,chosen)=>'<label class="v12-field">'+label+'<select class="v-select" id="'+id+'">'+options.map(([v,t])=>'<option value="'+v+'" '+(v===chosen?'selected':'')+'>'+t+'</option>').join('')+'</select></label>';
 shell.modal('Screen + camera explainer','<p class="v-muted">Your screen recording fills the frame and the video of you sits in a corner. It stays in sync when you cut or reorder.</p><div class="v12-form">'+list('v12-screen','Screen recording',screen)+list('v12-camera','Video of you',camera)+pick('v12-shape','Shape',X12.shapes,'circle')+pick('v12-corner','Corner',X12.corners,'br')+'</div><p class="v-muted v12-small">Both videos should start at the same moment. If they were recorded separately, set Sync offset afterwards in the camera panel.</p><p id="v12-dialog-error" role="alert" hidden></p><div class="v-row"><button class="v-button primary" id="v12-apply">Create layout</button><button class="v-button" id="v12-cancel">Cancel</button></div>');
 find('#v12-cancel').onclick=()=>shell.closeModal();
 find('#v12-apply').onclick=()=>{
  const a=find('#v12-screen').value,b=find('#v12-camera').value,error=find('#v12-dialog-error');
  if(a===b){error.textContent='Choose two different videos.';error.hidden=false;return;}
  const options={screen:a,camera:b,shape:find('#v12-shape').value,corner:find('#v12-corner').value};shell.closeModal();explainerV12(options);
 };
}
function overlayPanelV12(p,a){
 const link=linkOfV12(a),t=link||a,asset=state.assets.find(x=>x.id===a.asset),shape=t.shape||'rect',hex=v=>/^#[0-9a-f]{6}$/i.test(v||'')?v:'#ffffff';
 // Changes go to the link (shared by every piece of a linked camera) or to the overlay itself.
 const target=()=>linkOfV12(a)||(state.overlays||[]).find(o=>o.id===a.id)||t;
 p.innerHTML='<h3>'+(link?'Camera':esc(a.name||'Overlay'))+'</h3>'
  +(link?'<p class="v12-small">Linked to your screen recording: it stays in sync when you cut or reorder.</p>':'')
  +'<div class="v11-row" role="group" aria-label="Shape">'+X12.shapes.map(([k,n])=>'<button data-v12-shape="'+k+'" aria-pressed="'+(shape===k)+'">'+n+'</button>').join('')+'</div>'
  +range('v12-size','Size %',t.scale||35,8,100)
  +'<div class="v12-corners" role="group" aria-label="Corner">'+X12.corners.map(([k,n])=>'<button data-v12-corner="'+k+'" aria-pressed="'+(t.corner===k)+'">'+n+'</button>').join('')+'</div><p class="v12-small">Or drag it on the video.</p>'
  +'<div class="v10-colours">'+range('v12-border','Border',t.border||0,0,12)+'<label>Colour <input id="v12-border-colour" type="color" value="'+hex(t.borderColor)+'"></label></div>'
  +'<label class="ed-check">Shadow<input id="v12-shadow" type="checkbox" '+(t.shadow?'checked':'')+'></label>'
  +(asset?.kind==='video'?'<label class="ed-check">Flip left to right<input id="v12-mirror" type="checkbox" '+(t.mirror?'checked':'')+'></label>':'')
  +(shape==='circle'?range('v12-focus','Framing inside the circle',t.focusX??50,0,100):'')
  +(link?'<label>Sync offset (seconds)<input id="v12-offset" type="number" step=".01" min="-10" max="10" value="'+Number((link.offset||0).toFixed(2))+'"></label><p class="v12-small">If your lips move before the sound, lower this. If they move after, raise it.</p><button id="v12-unlink" class="ed-wide">Unlink from screen recording</button>'
        :range('v6-fade-in','Fade in (seconds)',a.fadeIn||0,0,5)+range('v6-fade-out','Fade out (seconds)',a.fadeOut||0,0,5))
  +'<button id="v12-remove" class="ed-wide v10-danger">'+(link?'Remove camera':'Remove')+'</button>';
 p.querySelectorAll('[data-v12-shape]').forEach(b=>b.onclick=()=>transaction(()=>{target().shape=b.dataset.v12Shape;}));
 p.querySelectorAll('[data-v12-corner]').forEach(b=>b.onclick=()=>transaction(()=>{target().corner=b.dataset.v12Corner;}));
 bind('v12-size',v=>{target().scale=+v;});bind('v12-border',v=>{target().border=+v;});bind('v12-border-colour',v=>{target().borderColor=v;});
 bind('v12-shadow',(_v,el)=>{target().shadow=el.checked;});if(q('#v12-mirror'))bind('v12-mirror',(_v,el)=>{target().mirror=el.checked;});
 if(q('#v12-focus'))bind('v12-focus',v=>{target().focusX=+v;});
 if(link){
  q('#v12-offset').onchange=ev=>{const n=Number(ev.target.value);if(!Number.isFinite(n)||Math.abs(n)>10){notice('Use a sync offset between −10 and 10 seconds.');panel();return;}transaction(()=>{target().offset=n;});};
  q('#v12-unlink').onclick=()=>transaction(()=>{state.cameraLinks=state.cameraLinks.filter(l=>l.id!==link.id);let first=null;state.overlays=state.overlays.map(o=>{if(o.linkId!==link.id)return o;const {linkId,...free}=o;free.id=crypto.randomUUID();first??=free.id;return free;});state.active=first;timelineSelection=first?{type:'overlay',id:first}:null;if(!first)state.panel='media';});
 }else{bind('v6-fade-in',v=>{target().fadeIn=+v;});bind('v6-fade-out',v=>{target().fadeOut=+v;});}
 q('#v12-remove').onclick=()=>transaction(()=>{if(link)state.cameraLinks=state.cameraLinks.filter(l=>l.id!==link.id);else state.overlays=state.overlays.filter(o=>o.id!==a.id);timelineSelection=null;state.active=null;state.panel='media';});
}
const panelBeforeV12=panel;
panel=function(){
 panelBeforeV12();const p=q('#ed-panel');
 if(state.panel==='overlay'){const a=(state.overlays||[]).find(o=>o.id===state.active);if(a){overlayPanelV12(p,a);icons();}}
 else if(state.panel==='media'&&!q('#v12-explainer')){
  const b=document.createElement('button');b.id='v12-explainer';b.type='button';b.className='ed-wide';b.innerHTML=icon('picture-in-picture-2')+' Screen + camera explainer';b.title='Put a video of you in a circle over a screen recording';b.onclick=explainerDialogV12;
  (q('#ed-import')||p.firstElementChild)?.after(b);icons();
 }
};
// A linked camera cannot be trimmed or slid on the timeline: its timing comes from the screen recording.
const dragBeforeV12=dragBlockV6;
dragBlockV6=function(b,lane,type,id){
 dragBeforeV12(b,lane,type,id);
 if(type==='overlay'&&(state.overlays||[]).find(o=>o.id===id)?.linkId){b.querySelectorAll('.v6-edge').forEach(n=>n.remove());b.classList.add('v12-linked');b.title='Camera · in sync with the screen recording';}
};
// END EDITOR V12
// 0.15: runs after every panel layer, so a locked item's panel stays read-only whichever layer drew it.
const panelBeforeV15=panel;panel=function(){panelBeforeV15();lockPanelV15(q('#ed-panel'));};

wireV4();wireV5();wireV7();wireV10();wireV11();
globalThis.visorEditor={blank:()=>clone(initial),explainer:explainerV12,explainerDialog:explainerDialogV12,selectOverlay:selectOverlayV12,shortcuts:shortcutsV10,appendAsset,addElement,get:()=>clone(state),saveData:()=>withoutView(clone(state)),pause:stop,set:data=>{selectionV7=[];previewOriginal=false;previewEffect=null;stop();pendingUndoV15=null;state={...clone(initial),...clone(data)};uniqueIdsV15(state);settleTracksV15();history=[];future=[];render(true);},reset:()=>{selectionV7=[];previewOriginal=false;previewEffect=null;stop();pendingUndoV15=null;state=clone(initial);settleTracksV15();history=[];future=[];render(true);},patch:data=>transaction(()=>Object.assign(state,clone(data))),open,undo,redo,applyStyle,importAssets,previewBefore:on=>{previewOriginal=on;paint();},previewEffect:id=>{previewEffect=id;paint();},jump:t=>{state.time=Math.max(0,Math.min(total(),t));paint();},removeSource:(a,b)=>transaction(()=>removeSource(a,b)),restoreRange:(a,b)=>{if(state.clips.length>=200)return notice('Remove a clip before restoring this range.');transaction(()=>{state.clips.push({id:uidV15(),asset:'walk',name:'Restored section',kind:'video',start:a,end:b,limit:32});state.clips.sort((x,y)=>x.asset==='walk'&&y.asset==='walk'?x.start-y.start:0);});},play};render(true);
})();
