(function(root){
'use strict';
// 0.13 command layer: edits to a project made without the editor screen.
//
// Every function takes a project state (the same object the editor saves; see docs/PROJECT-FORMAT.md) and
// returns a changed copy. The input is never modified, and a change is only handed back after the whole
// project passes check(), so a bad request changes nothing.
// Times given by callers are seconds as shown in the app ("timeline seconds"). Internally the timeline is
// measured in source seconds, which differ when the project speed is not 1.
const node=typeof module==='object';
const T=node?require('./titles-v11.js'):root.titleModelV11,X=node?require('./explainer-v12.js'):root.explainerV12,R=node?require('./timeline-retime.js'):root.timelineRetime;
const FORMAT=1,MIN_PIECE=.25,EPSILON=1e-6,MAX_CLIPS=200,MAX_ELEMENTS=100;
const SHAPES={'16:9':'16/9','9:16':'9/16','1:1':'1/1','4:5':'4/5'};
const CAPTION_STYLES=[['clean','Clean'],['highlight','Highlight'],['word','One word'],['karaoke','Karaoke'],['boxed','Soft box'],['outline','Outline'],['editorial','Editorial'],['stack','Stacked'],['marker','Marker'],['minimal','Minimal'],['bold','Bold'],['subtitle','Subtitle']];
const ICONS=['rocket','lightbulb','target','circle-check','sparkles','chart-column','mouse-pointer-2','clock','download','circle-alert','heart','shield-check','star','thumbs-up','zap','bell','play','message-circle','trending-up','users','calendar','mail','map-pin','lock','gift','flag','trophy','camera','mic','search','settings','globe','link','wallet','shopping-cart','percent','arrow-right','arrow-up-right','check','x','plus','eye','smile','flame','award','bookmark','megaphone','headphones','phone','wifi'];
const clone=value=>JSON.parse(JSON.stringify(value)),uuid=()=>root.crypto.randomUUID(),round=n=>Math.round(n*100)/100;
// Errors meant for the person or the assistant, in plain words.
function fail(message){const e=Error(message);e.plain=true;throw e;}
const speedOf=s=>Number(s.speed)>0?Number(s.speed):1;
const real=s=>(s.clips||[]).filter(c=>c.asset!=='blank');
const length=s=>real(s).reduce((n,c)=>n+c.end-c.start,0); // source seconds
const duration=s=>length(s)/speedOf(s);                    // timeline seconds
function shapeName(ratio){
 const [a,b]=String(ratio||'16/9').split('/').map(Number);if(!(a>0&&b>0))return '16:9';
 for(const [name,value]of Object.entries(SHAPES)){const [x,y]=value.split('/').map(Number);if(Math.abs(a/b-x/y)<.01)return name;}
 return round(a/b)+':1';
}
function needFootage(s){if(!real(s).length)fail('This project has no footage yet. Add media first.');}
function span(s,start,end,what){
 const total=duration(s);
 if(!(end>start))fail(`${what}: the end (${end}) must be after the start (${start}).`);
 if(start>total-.05)fail(`${what}: it starts at ${start} s but the video is only ${round(total)} s long.`);
 return{start:start*speedOf(s),end:Math.min(total,end)*speedOf(s)};
}

// ---- reading
function summary(s,project={}){
 const speed=speedOf(s);let at=0;
 const clips=real(s).map((c,index)=>{const from=at;at+=c.end-c.start;return{id:c.id,index,name:c.name,asset_id:c.asset,kind:c.kind,start:round(from/speed),end:round(at/speed),source_start:round(c.start),source_end:round(c.end)};});
 const onTimeline=new Set(clips.map(c=>c.asset_id)),music=s.music?(s.assets||[]).find(a=>a.id===s.music.asset):null;
 return{
  ...(project.id?{project_id:project.id,name:project.name,ai_draft:!!project.ai}:{}),
  canvas:shapeName(s.ratio),fit:s.fit==='cover'?'fill':'fit',duration:round(duration(s)),...(speed!==1?{speed}:{}),
  clips,
  titles:(s.elements||[]).map(e=>({id:e.id,type:e.kind==='icon'?'icon':e.templateId||e.kind,...(e.kind==='icon'?{icon:e.icon}:{text:e.text||'',...(e.subtitle?{subtitle:e.subtitle}:{})}),start:round(e.start/speed),end:round(e.end/speed)})),
  captions:{enabled:!!s.captions,style:s.captionStyle||'highlight',position:s.captionPosition||'bottom',has_transcript:(s.transcript||[]).length>0},
  music:s.music?{track:s.music.name||music?.name||'Music',volume:s.audio?.music??20}:null,
  camera_circle:(s.cameraLinks||[]).length>0,
  media:(s.assets||[]).map(a=>({asset_id:a.id,name:a.name,kind:a.kind,...(a.kind==='image'?{}:{duration:round(a.duration||0)}),...(a.width?{width:a.width,height:a.height}:{}),on_timeline:onTimeline.has(a.id)}))
 };
}
// What is said, placed on the edited timeline. Lines keep only the words still in the edit.
function transcript(s){
 const speed=speedOf(s),out=[];let at=0;
 for(const c of real(s)){
  for(const line of s.transcript||[]){
   if(line.asset&&line.asset!==c.asset)continue;
   const from=Math.max(line.start,c.start),to=Math.min(line.end,c.end);if(to-from<.05)continue;
   const words=Array.isArray(line.words)?line.words.filter(w=>(w.start+w.end)/2>=c.start&&(w.start+w.end)/2<c.end).map(w=>w.text):null;
   const text=(words&&words.length?words.join(' '):line.text||'').trim();if(text)out.push({start:round((at+from-c.start)/speed),end:round((at+to-c.start)/speed),text});
  }
  at+=c.end-c.start;
 }
 return out.sort((a,b)=>a.start-b.start);
}

// ---- building
function blank(template){
 const s=clone(template||{});
 return{...s,formatVersion:FORMAT,clips:[],assets:[],elements:[],transcript:[],zooms:[],overlays:[],audioClips:[],cameraLinks:[],music:null,voiceover:null,time:0,selected:0,panel:'media',active:null,
  zoom:false,camera:false,captions:false,colour:false,captionFont:'DM Sans',style:{...(s.style||{}),font:'DM Sans'},adjustments:{},hiddenTracks:{},fit:'contain',speed:1,transition:'cut',ratio:'16/9',audio:{voice:100,system:70,music:20,noise:false,level:false,...(s.audio||{})}};
}
const clipFor=a=>({id:uuid(),asset:a.id,name:a.name,kind:a.kind,start:0,end:a.duration||5,limit:a.duration||5});
function addMedia(s,assets,toTimeline=true){
 let added=0;
 for(const a of assets){
  if(!['video','image','audio'].includes(a.kind))fail(`"${a.name}" is not a video, image or audio file.`);
  if(!s.assets.some(x=>x.id===a.id))s.assets.push(clone(a));
  if(toTimeline&&a.kind!=='audio'){if(real(s).length>=MAX_CLIPS)fail('A project can hold 200 clips at most.');s.clips=real(s);s.clips.push(clipFor(a));added++;}
 }
 return{added_to_timeline:added,media:assets.map(a=>({asset_id:a.id,name:a.name,kind:a.kind}))};
}
function create(template,assets,options={}){
 const s=blank(template),info=addMedia(s,assets,true);
 if(!s.clips.length)fail('Give at least one video or image. Audio files alone cannot start a project.');
 const first=assets.find(a=>a.kind==='video')||assets.find(a=>a.kind==='image');
 s.ratio=options.canvas?SHAPES[options.canvas]:(first?.width>0&&first?.height>0?first.width+'/'+first.height:'16/9');s.originalRatio=s.ratio;
 if(!options.canvas&&/^\d+\/\d+$/.test(options.preferredRatio||''))s.ratio=options.preferredRatio;
 s.focus={mode:'manual',x:50,y:50,start:0,end:length(s)};
 return{state:finish(s),info};
}

// ---- cutting
function merge(ranges){
 const sorted=ranges.map(r=>({...r})).sort((a,b)=>a.start-b.start),out=[];
 for(const r of sorted){const last=out.at(-1);if(last&&r.start<=last.end+EPSILON)last.end=Math.max(last.end,r.end);else out.push(r);}
 return out;
}
function removeRanges(s,ranges){
 needFootage(s);const total=length(s),speed=speedOf(s);
 const cuts=merge(ranges.map((r,i)=>{if(!(r.end>r.start))fail(`Range ${i+1}: the end (${r.end}) must be after the start (${r.start}).`);if(r.start>total/speed+.05)fail(`Range ${i+1} starts at ${r.start} s but the video is only ${round(total/speed)} s long. Read the project again: times change after every cut.`);return{start:Math.max(0,r.start*speed),end:Math.min(total,r.end*speed)};})).filter(r=>r.end-r.start>.01);
 if(!cuts.length)return{removed_seconds:0,duration:round(total/speed)};
 // Step 1: split clips at the edges of each cut. A split alone moves nothing else.
 const points=cuts.flatMap(r=>[r.start,r.end]),pieces=[];let at=0;
 for(const c of real(s)){
  const size=c.end-c.start,inside=points.filter(p=>p>at+EPSILON&&p<at+size-EPSILON).sort((a,b)=>a-b);let from=c.start,first=true;
  const push=to=>{const piece={...clone(c),id:first?c.id:uuid(),start:from,end:to};if(!first)delete piece.transitionIn;pieces.push(piece);from=to;first=false;};
  for(const p of inside){const to=c.start+(p-at);if(to-from>EPSILON)push(to);}
  push(c.end);at+=size;
 }
 // Step 2: drop the pieces inside a cut, plus slivers too short to be a clip that the cut left behind.
 at=0;const keep=[];
 for(const p of pieces){const size=p.end-p.start,mid=at+size/2,cut=cuts.some(r=>mid>r.start&&mid<r.end),sliver=size<MIN_PIECE&&cuts.some(r=>Math.abs(r.start-(at+size))<EPSILON||Math.abs(r.end-at)<EPSILON);if(!cut&&!sliver)keep.push(p);at+=size;}
 if(!keep.length)fail('That would remove the whole video. Leave at least a quarter of a second.');
 if(pieces.length>MAX_CLIPS)fail('That many cuts would make more than 200 clips. Use fewer, longer ranges.');
 s.clips=pieces;const before=clone(pieces);s.clips=keep;R.retime(before,s);
 // Captions follow the footage by themselves (they are stored against the source), as does a linked camera.
 const left=length(s);return{removed_seconds:round((total-left)/speed),duration:round(left/speed),clips:keep.length};
}
// Silent pauses still in the edit, as timeline ranges. `silences` come from the app's analysis, per media
// file, already 0.15 s short of the speech on each side.
function pauses(s,silences,options={}){
 const min=options.min??1,keep=options.keep??.15,speed=speedOf(s),out=[];let at=0;
 for(const c of real(s)){
  for(const r of silences.filter(r=>r.asset===c.asset)){
   if(r.end-r.start+.3<min-EPSILON)continue;
   const from=Math.max(r.start+(keep-.15),c.start),to=Math.min(r.end-(keep-.15),c.end);
   if(to-from>=.3)out.push({start:round((at+from-c.start)/speed),end:round((at+to-c.start)/speed)});
  }
  at+=c.end-c.start;
 }
 return out.sort((a,b)=>a.start-b.start);
}
function reorder(s,order){
 needFootage(s);const clips=real(s);
 if(order.length!==clips.length||new Set(order).size!==order.length||order.some(id=>!clips.some(c=>c.id===id)))fail('Give every clip id exactly once. This project has '+clips.length+' clip'+(clips.length===1?'':'s')+': '+clips.map(c=>c.id).join(', ')+'.');
 const before=clone(clips);s.clips=order.map(id=>clips.find(c=>c.id===id));R.retime(before,s);return{clips:s.clips.length};
}

// ---- titles, icons
function place(s,e){s.elements=s.elements||[];if(s.elements.length>=MAX_ELEMENTS)fail('A project can hold 100 titles and graphics at most.');s.elements.push(e);return{element_id:e.id};}
function addTitle(s,a){
 needFootage(s);const preset=T.preset(a.preset);
 if(!preset)fail(`There is no preset called "${a.preset}". Use an id from list_presets, for example ${T.catalog.slice(0,4).map(p=>p.id).join(', ')}.`);
 const {start,end}=span(s,a.start,a.end,'Title');if(end-start<.3)fail('A title needs at least 0.3 seconds on screen.');
 const e=T.create(a.preset,start,end,s.ratio,{captionsAtBottom:!!s.captions&&(s.transcript||[]).length>0&&(s.captionPosition||'bottom')==='bottom'});
 if(a.text!==undefined)e.text=a.text;if(a.subtitle!==undefined)e.subtitle=a.subtitle;if(a.label!==undefined)e.kicker=a.label;
 if(a.x!==undefined)e.x=Math.max(2,Math.min(98,a.x));if(a.y!==undefined)e.y=Math.max(2,Math.min(98,a.y));if(a.color)e.colour=a.color;if(a.accent)e.accent=a.accent;
 return place(s,e);
}
function addIcon(s,a,known){
 needFootage(s);if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.icon)||(known&&!known(a.icon)))fail(`There is no icon called "${a.icon}". Try one of: ${ICONS.slice(0,12).join(', ')}.`);
 const {start,end}=span(s,a.start,a.end,'Icon'),e=T.createIcon(a.icon,start,end);
 if(a.x!==undefined)e.x=Math.max(2,Math.min(98,a.x));if(a.y!==undefined)e.y=Math.max(2,Math.min(98,a.y));if(a.size!==undefined)e.size=a.size;if(a.color)e.accent=a.color;
 return place(s,e);
}
function removeElement(s,id){
 const before=(s.elements||[]).length;s.elements=(s.elements||[]).filter(e=>e.id!==id);
 if(s.elements.length===before)fail(`There is no title or icon with id "${id}" in this project.`);if(s.active===id){s.active=null;s.panel='media';}return{removed:id};
}

// ---- captions, music, frame shape, camera
function setCaptions(s,a){
 if(a.enabled&&!(s.transcript||[]).length)fail('There is no transcript yet, so there is nothing to caption.');
 s.captions=!!a.enabled;if(a.style)s.captionStyle=a.style;if(a.position)s.captionPosition=a.position;
 return{captions:{enabled:s.captions,style:s.captionStyle||'highlight',position:s.captionPosition||'bottom'}};
}
function setMusic(s,asset,volume){
 if(!asset){s.music=null;return{music:null};}
 needFootage(s);if(!s.assets.some(a=>a.id===asset.id))s.assets.push(clone(asset));
 s.music={asset:asset.id,name:asset.name,duck:true,start:0};s.audio={...(s.audio||{}),music:volume??s.audio?.music??20};
 return{music:{track:asset.name,volume:s.audio.music}};
}
function setCanvas(s,shape,fit){
 if(!SHAPES[shape])fail('Frame shape must be one of: '+Object.keys(SHAPES).join(', ')+'.');
 s.ratio=SHAPES[shape];if(fit)s.fit=fit==='fill'?'cover':'contain';return{canvas:shape,fit:s.fit==='cover'?'fill':'fit'};
}
function addCamera(s,camera,options={}){
 needFootage(s);if(camera.kind!=='video')fail('The camera file must be a video.');
 const clip=real(s).find(c=>c.kind==='video'&&c.asset!==camera.id);
 if(!clip)fail('Put the screen recording on the timeline first; the camera circle goes on top of it.');
 if(!s.assets.some(a=>a.id===camera.id))s.assets.push(clone(camera));
 s.clips=real(s).filter(c=>c.asset!==camera.id);
 const id='cam-'+uuid();s.cameraLinks=[...(s.cameraLinks||[]).filter(l=>l.asset!==camera.id),X.create(id,clip.asset,camera.id,s.ratio,options)];
 X.relink(s);if(!(s.overlays||[]).some(o=>o.linkId===id))fail('The camera video does not overlap the screen recording.');
 return{camera_circle:true,shape:options.shape||'circle',corner:options.corner||'br'};
}

// ---- safety net: nothing leaves this module in a broken state
function check(s){
 const bad=what=>fail('Video Visor stopped this change because it would damage the project ('+what+').');
 if(!Array.isArray(s.clips)||!Array.isArray(s.assets))bad('missing clips or media list');
 if(s.clips.length>MAX_CLIPS)bad('more than 200 clips');
 const ids=new Set((s.assets||[]).map(a=>a.id)),seen=new Set();
 for(const c of s.clips){
  if(c.asset==='blank')continue;
  if(!ids.has(c.asset))bad('a clip uses media that is not in the project');
  if(!(Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.end-c.start>EPSILON&&c.start>=-EPSILON))bad('a clip has no length');
  if(Number.isFinite(c.limit)&&c.end>c.limit+.01)bad('a clip runs past the end of its media');
  if(typeof c.id!=='string'||seen.has(c.id))bad('two clips share an id');seen.add(c.id);
 }
 const total=length(s);
 if((s.elements||[]).length>MAX_ELEMENTS)bad('more than 100 titles');
 for(const e of s.elements||[])if(!(Number.isFinite(e.start)&&Number.isFinite(e.end)&&e.end>e.start&&e.start>=-EPSILON&&e.end<=total+.05))bad('a title is outside the video');
 const [a,b]=String(s.ratio||'').split('/').map(Number);if(!(a>0&&b>0&&a/b>=.1&&a/b<=10))bad('the frame shape is not valid');
 if(!(speedOf(s)>=.25&&speedOf(s)<=4))bad('the speed is not valid');
 if(s.music&&!ids.has(s.music.asset))bad('the music file is not in the project');
 return s;
}
function finish(s){
 if(!s.clips.length)s.clips=[{id:'blank',asset:'blank',name:'Add footage',kind:'image',start:0,end:5,limit:5}];
 X.relink(s);const total=length(s);
 s.elements=(s.elements||[]).filter(e=>e.end-e.start>EPSILON);
 s.time=Math.max(0,Math.min(Number(s.time)||0,total));s.selected=Math.max(0,Math.min(Number(s.selected)||0,s.clips.length-1));
 if(s.active&&!(s.elements||[]).some(e=>e.id===s.active)&&!(s.overlays||[]).some(o=>o.id===s.active)){s.active=null;if(['element','overlay'].includes(s.panel))s.panel='media';}
 s.formatVersion=FORMAT;return check(s);
}
// Runs one change on a copy. Returns the new state and what to tell the caller.
function apply(state,change){const s=clone(state);const info=change(s)||{};return{state:finish(s),info};}
function presets(musicTracks=[]){
 return{
  titles:T.catalog.map(p=>({id:p.id,group:(T.categories.find(c=>c[0]===p.category)||[])[1]||p.category,name:p.name,example_text:p.text||'',has_subtitle:!!p.subtitle,has_label:!!p.kicker})),
  icons:ICONS,caption_styles:CAPTION_STYLES.map(([id,name])=>({id,name})),caption_positions:['bottom','middle','top'],music:musicTracks,canvas_shapes:Object.keys(SHAPES),camera_shapes:['circle','rounded','rect']
 };
}
const api={FORMAT,MIN_PIECE,SHAPES,CAPTION_STYLES,ICONS,fail,duration,length,shapeName,summary,transcript,blank,create,addMedia,removeRanges,pauses,reorder,addTitle,addIcon,removeElement,setCaptions,setMusic,setCanvas,addCamera,check,finish,apply,presets,clone};
if(node)module.exports=api;else root.draftModelV13=api;
})(globalThis);
