(function(root){
'use strict';
const T=typeof module==='object'?require('./timeline-retime.js'):root.timelineRetime;
const clone=o=>JSON.parse(JSON.stringify(o)),id=()=>root.crypto.randomUUID(),duration=clips=>clips.reduce((n,c)=>n+c.end-c.start,0);
const tracks=['elements','zooms','audioClips','overlays'];
const MIN_PIECE=.25; // shortest clip an insert may leave behind, in seconds
function mapped(state,clips,spans){
 const next={...state,clips};
 const total=duration(clips);for(const key of tracks)next[key]=T.remapTrack(key,state[key]||[],spans,total);
 /* 0.15 (Phase 19): markers move with the footage; one inside removed footage goes to the cut */if(state.markers?.length)next.markers=state.markers.map(m=>({...m,t:Math.min(total,T.mapPoint(m.t,spans))}));
 for(const key of ['music','voiceover'])if(state[key]){const at=state[key].start||0,s=spans.find(s=>at>=s.old-T.EPSILON&&at<s.end-T.EPSILON);next[key]={...state[key],start:s?s.next+at-s.old:at};}
 return next;
}
function insert(state,asset,time){
 const before=state.clips.filter(c=>c.asset!=='blank');let at=Math.max(0,Math.min(duration(before),time));
 // 0.9: an insert point very close to a clip edge would leave a sliver of that clip; use the edge instead.
 {let offset=0;for(const c of before){const d=c.end-c.start;if(at>offset&&at<offset+d){if(at-offset<MIN_PIECE)at=offset;else if(offset+d-at<MIN_PIECE)at=offset+d;break;}offset+=d;}}
 const newClip={id:id(),asset:asset.id,name:asset.name,kind:asset.kind,start:0,end:asset.duration||5,limit:asset.duration||5};
 const clips=[],spans=[];let old=0,next=0,inserted=false;
 const add=()=>{clips.push(newClip);next+=newClip.end;inserted=true;};
 const keep=(c,start,end,newId=c.id)=>{if(end-start<T.EPSILON)return;clips.push({...clone(c),id:newId,start,end,...(newId!==c.id?{transitionIn:undefined}:{})});spans.push({old:old+start-c.start,end:old+end-c.start,next});next+=end-start;};
 for(const c of before){const d=c.end-c.start;
  if(!inserted&&at<=old+T.EPSILON)add();
  if(!inserted&&at<old+d-T.EPSILON){const cut=c.start+at-old;keep(c,c.start,cut);add();keep(c,cut,c.end,id());}else keep(c,c.start,c.end);
  old+=d;
 }
 if(!inserted)add();
 return{...mapped(state,clips,spans),selected:clips.findIndex(c=>c.id===newClip.id),time:at,panel:'clip'};
}
function boundary(clips,time){let offset=0;for(let i=0;i<clips.length;i++){const d=clips[i].end-clips[i].start;if(time<offset+d/2)return i;offset+=d;}return clips.length;}
function reorder(state,ids,beforeIndex){
 const selected=new Set(ids),before=state.clips,moving=before.filter(c=>selected.has(c.id));if(!moving.length)return state;
 const remaining=before.filter(c=>!selected.has(c.id)),index=before.slice(0,beforeIndex).filter(c=>!selected.has(c.id)).length;
 const clips=[...remaining.slice(0,index),...moving,...remaining.slice(index)];
 if(clips.every((c,i)=>c.id===before[i].id))return state;
 const next=mapped(state,clips,T.spansFor(before,clips));next.selected=index;next.time=duration(clips.slice(0,index));return next;
}
function remove(state,ids,keepGap=false){
 const selected=new Set(ids),clips=keepGap?state.clips.map(c=>selected.has(c.id)?{...c,gap:true,muted:true,name:'Gap'}:c):state.clips.filter(c=>!selected.has(c.id));
 const next=keepGap?{...state,clips}:mapped(state,clips,T.spansFor(state.clips,clips));
 next.selected=Math.max(0,Math.min(state.selected,clips.length-1));next.time=Math.min(state.time,duration(clips));next.panel='media';return next;
}
function formatTime(t){t=Math.max(0,Number(t)||0);const tenths=Math.floor((t+1e-6)*10),minutes=Math.floor(tenths/600);return String(minutes).padStart(2,'0')+':'+String(Math.floor(tenths/10)%60).padStart(2,'0')+'.'+tenths%10;}
const api={insert,reorder,remove,boundary,duration,formatTime};if(typeof module==='object')module.exports=api;else root.timelineModelV7=api;
})(globalThis);
