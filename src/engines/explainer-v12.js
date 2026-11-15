(function(root){
'use strict';
// 0.12 Record explainer: a camera video shown in a shape over a screen recording.
//
// A "camera link" (state.cameraLinks) ties a camera video to a screen recording. The pieces drawn on
// the timeline and the preview (state.overlays entries with a linkId) are worked out from the main
// track every time it changes, so the camera stays in step with the screen recording through cuts,
// trims, reorders and undo. The link holds the look (shape, size, position); pieces are copies.
const EPSILON=1e-6,near=(a,b)=>Math.abs(a-b)<=EPSILON;
const shapes=[['circle','Circle'],['rounded','Rounded'],['rect','Rectangle']];
const corners=[['tl','Top left'],['tr','Top right'],['bl','Bottom left'],['br','Bottom right']];
const MARGIN=3; // gap to the frame edge, as a percentage of the frame width
const HOLD=.25; // seconds of start/end mismatch between camera and screen recording that are bridged
const LOOK=['scale','shape','border','borderColor','shadow','mirror','focusX','opacity','keyframes']; // 0.15 (Phase 24): opacity and keyframes too
function ratioOf(ratio){const [a,b]=String(ratio||'16/9').split('/').map(Number);return a>0&&b>0?a/b:16/9;}
function aspectOf(asset){return asset?.width>0&&asset?.height>0?asset.width/asset.height:16/9;}
function defaults(ratio){return{shape:'circle',corner:'br',scale:ratioOf(ratio)>=1?20:34,border:4,borderColor:'#ffffff',shadow:true,mirror:false,focusX:50};}
// Height of the overlay as a percentage of the frame height (its width is `scale` percent of the frame width).
function heightPercent(o,ratio,assetAspect){return (o.scale||35)*ratioOf(ratio)/(o.shape==='circle'?1:(assetAspect||16/9));}
// Centre position, in percent of the frame. A corner keeps the same gap to both edges.
function place(o,ratio,assetAspect){
 if(!corners.some(c=>c[0]===o.corner))return{x:o.x??65,y:o.y??65};
 const w=o.scale||35,h=heightPercent(o,ratio,assetAspect),my=MARGIN*ratioOf(ratio);
 return{x:o.corner[1]==='l'?MARGIN+w/2:100-MARGIN-w/2,y:o.corner[0]==='t'?my+h/2:100-my-h/2};
}
// Inline styles for the preview/export node. `width` is the frame width in pixels, so borders and
// shadows keep the same proportions in the small preview and in a 4K export.
// `assetAspect` (width / height of the video) keeps the outer box, border included, at the picture's own shape.
function css(o,width,assetAspect){
 const w=width*(o.scale||35)/100,border=Math.max(0,Number(o.border)||0)/1000*width,shape=o.shape||'rect';
 return{
  aspectRatio:shape==='circle'?'1 / 1':assetAspect>0?String(assetAspect):'auto',objectFit:'cover',objectPosition:(o.focusX??50)+'% 50%',boxSizing:'border-box',
  borderRadius:shape==='circle'?'50%':shape==='rounded'?(w*.1).toFixed(2)+'px':'0',
  border:border>=.25?border.toFixed(2)+'px solid '+(/^#[0-9a-f]{6}$/i.test(o.borderColor||'')?o.borderColor:'#ffffff'):'0 solid transparent',
  boxShadow:o.shadow?'0 '+(width*.006).toFixed(2)+'px '+(width*.022).toFixed(2)+'px rgba(0,0,0,.45)':'none',
  transform:'translate(-50%,-50%)'+(o.mirror?' scaleX(-1)':'')
 };
}
// Where the camera is on screen: one range per run of screen-recording footage on the main track.
// Camera time = screen-recording time + offset. Ranges stop where the camera video starts or ends.
function ranges(state,link){
 const camera=(state.assets||[]).find(a=>a.id===link.asset);if(!camera)return null;
 const length=Number(camera.duration)||0,offset=Number(link.offset)||0,out=[];let at=0;
 for(const c of state.clips||[]){
  const size=c.end-c.start;
  if(c.asset===link.screen){
   let start=at,end=at+size,sourceIn=c.start+offset;
   // The two recordings never start or stop on exactly the same instant. A gap of up to a quarter of a
   // second is covered by holding the camera's first or last picture (the preview and export clamp the
   // camera time), so the circle does not pop in a few frames late or vanish a few frames early.
   if(sourceIn<-HOLD){start-=sourceIn;sourceIn=0;}
   if(sourceIn+(end-start)>length+HOLD)end=start+(length-sourceIn);
   if(end-start>.02){const prev=out.at(-1);if(prev&&near(prev.end,start)&&near(prev.sourceIn+(prev.end-prev.start),sourceIn))prev.end=end;else out.push({start,end,sourceIn});}
  }
  at+=size;
 }
 return out;
}
// Rebuilds the linked pieces. Returns true when the state changed.
// Removing any piece of a link (Delete on the timeline, Remove in the panel) removes the whole link.
function relink(state){
 const before=Array.isArray(state.overlays)?state.overlays:[],links=Array.isArray(state.cameraLinks)?state.cameraLinks:[];
 const keep=[],built=[];
 for(const link of links){
  const mine=before.filter(o=>o.linkId===link.id);
  if(Array.isArray(link.made)&&link.made.some(id=>!mine.some(o=>o.id===id)))continue;
  // The link goes when the camera video or the screen recording is removed from the project.
  const parts=(state.assets||[]).some(a=>a.id===link.screen)?ranges(state,link):null;if(!parts)continue;
  const camera=state.assets.find(a=>a.id===link.asset),position=place(link,state.ratio,aspectOf(camera)),look={};
  for(const key of LOOK)if(link[key]!==undefined)look[key]=link[key];
  const pieces=parts.map((part,i)=>{const id=link.id+'#'+i,old=mine.find(o=>o.id===id)||mine[0];return{id,linkId:link.id,asset:link.asset,name:link.name||'Camera',...part,x:position.x,y:position.y,...look,...(old?.trackId?{trackId:old.trackId}:{})};});
  const made=pieces.map(p=>p.id);
  keep.push(JSON.stringify(link.made)===JSON.stringify(made)?link:{...link,made});built.push(...pieces);
 }
 // A free overlay pinned to a corner follows size and frame-shape changes too.
 const free=before.filter(o=>!o.linkId).map(o=>{if(!o.corner)return o;const p=place(o,state.ratio,aspectOf((state.assets||[]).find(a=>a.id===o.asset)));return near(p.x,o.x)&&near(p.y,o.y)?o:{...o,...p};});
 const next=[...free,...built];
 const same=JSON.stringify(next)===JSON.stringify(before)&&keep.length===links.length&&keep.every((l,i)=>l===links[i]);
 if(same)return false;
 state.overlays=next;if(links.length||state.cameraLinks)state.cameraLinks=keep;return true;
}
// Builds the link for a screen recording and a camera video.
function create(id,screen,camera,ratio,options={}){
 return{id,asset:camera,screen,name:'Camera',offset:Number(options.offset)||0,...defaults(ratio),...(shapes.some(s=>s[0]===options.shape)?{shape:options.shape}:{}),...(corners.some(c=>c[0]===options.corner)?{corner:options.corner}:{})};
}
const api={shapes,corners,MARGIN,HOLD,ratioOf,aspectOf,defaults,heightPercent,place,css,ranges,relink,create};
if(typeof module==='object')module.exports=api;else root.explainerV12=api;
})(globalThis);
