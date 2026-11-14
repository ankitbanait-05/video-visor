(function(root){
'use strict';
// Smaller than a frame at any supported rate; discard arithmetic residue only.
const EPSILON=1e-7;
const near=(a,b)=>Math.abs(a-b)<=EPSILON;
const keys=['elements','zooms','audioClips','overlays'];
function sameTiming(before,after){
 return before.length===after.length&&before.every((c,i)=>{
  const n=after[i];return c.id===n.id&&c.asset===n.asset&&near(c.start,n.start)&&near(c.end,n.end);
 });
}
// A split partitions a source range without changing its position in the edit.
// Checking every partition avoids confusing a duplicate + trim with a split.
function splitOnly(before,after){
 if(after.length<=before.length)return false;
 let i=0;
 for(const c of before){
  let at=c.start;
  if(after[i]?.id!==c.id)return false;
  do{const n=after[i++];if(!n||n.asset!==c.asset||!near(n.start,at)||n.end<=at||n.end>c.end+EPSILON)return false;at=n.end;}while(at<c.end-EPSILON);
 }
 return i===after.length;
}
function spansFor(before,after){
 const positions=new Map();let next=0;
 for(const c of after){positions.set(c.id,{clip:c,offset:next});next+=c.end-c.start;}
 const spans=[];let old=0;
 for(const c of before){
  const match=positions.get(c.id);
  if(match&&match.clip.asset===c.asset){
   const n=match.clip,a=Math.max(c.start,n.start),b=Math.min(c.end,n.end);
   if(b-a>EPSILON){
    const span={old:old+(a-c.start),end:old+(b-c.start),next:match.offset+(a-n.start)};
    const prev=spans.at(-1);
    if(prev&&near(prev.end,span.old)&&near(prev.next+(prev.end-prev.old),span.next))prev.end=span.end;
    else spans.push(span);
   }
  }
  old+=c.end-c.start;
 }
 return spans;
}
// 0.9: an item that ends up as several pieces which still touch on the timeline (for example a blur
// that spanned a removed pause) is joined back into one block. Pieces that were moved apart stay separate.
function remap(items,spans,sourceOffsets=false){
 return items.flatMap(e=>{
  if(e.tracking||e.linkId)return[e]; // Tracking is stored in source coordinates; a linked camera is rebuilt from the main track (explainer-v12.js).
  const parts=[];
  for(const s of spans){
   const a=Math.max(e.start,s.old),b=Math.min(e.end,s.end);
   if(b-a<=EPSILON)continue;
   // Preserve values exactly where possible, including IDs and source in-points.
   if(near(s.old,s.next)&&near(a,e.start)&&near(b,e.end))return[e];
   parts.push({...e,start:s.next+(a-s.old),end:s.next+(b-s.old),...(sourceOffsets?{sourceIn:(e.sourceIn||0)+(a-e.start)}:{})});
  }
  parts.sort((x,y)=>x.start-y.start);
  const joined=[];
  for(const part of parts){
   const prev=joined.at(-1);
   if(prev&&near(prev.end,part.start)&&(!sourceOffsets||near((prev.sourceIn||0)+(prev.end-prev.start),part.sourceIn||0)))prev.end=part.end;
   else joined.push(part);
  }
  return joined.map((part,i)=>i?{...part,id:'timed-'+root.crypto.randomUUID()}:part);
 });
}
// 0.9: separate audio clips (imported or detached sound) are never cut up by video edits.
// When video is trimmed, removed or inserted they slide with the point they started at and keep
// their full length; when clips are only reordered they stay where they are. Anything that would
// run past the end of the video is trimmed there.
const ordered=spans=>spans.every((s,i)=>!i||s.next>=spans[i-1].next-EPSILON);
function mapPoint(time,spans){
 let last=null;
 for(const s of spans){if(time<s.old-EPSILON)return s.next;if(time<s.end-EPSILON)return s.next+(time-s.old);last=s;}
 return last?last.next+(last.end-last.old):time;
}
function shiftWhole(items,spans,total){
 const moved=ordered(spans);
 return items.map(e=>{
  const length=e.end-e.start;let start=moved?mapPoint(e.start,spans):e.start,end=start+length;
  if(Number.isFinite(total)){if(end>total)end=total;if(end-start<.05){start=Math.max(0,total-length);end=total;}}
  return near(start,e.start)&&near(end,e.end)?e:{...e,start,end};
 });
}
const length=clips=>clips.reduce((n,c)=>n+c.end-c.start,0);
function remapTrack(key,items,spans,total){return key==='audioClips'?shiftWhole(items,spans,total):remap(items,spans,key==='overlays');}
function retime(before,state,refs){
 if(sameTiming(before,state.clips)||splitOnly(before,state.clips))return;
 const spans=spansFor(before,state.clips),total=length(state.clips);
 for(const key of keys)if(Array.isArray(state[key])&&(!refs||refs[key]===state[key]))state[key]=remapTrack(key,state[key],spans,total);
 // 0.15 (Phase 19): markers are points in time; they move with the footage they were on (a marker inside removed
 // footage goes to where the cut is). Clips only reordered leave them where they are.
 if(Array.isArray(state.markers)&&state.markers.length&&(!refs||refs.markers===state.markers)&&ordered(spans))state.markers=state.markers.map(m=>{const t=Math.min(total,mapPoint(m.t,spans));return near(t,m.t)?m:{...m,t};});
}
// 0.6 generated IDs with repeated numeric suffixes and durations around 1e-14s.
// Keep every meaningful element, even when it has one of these legacy IDs.
function recoverEditor(state){
 let removed=0;
 for(const key of keys){
  if(!Array.isArray(state?.[key]))continue;
  state[key]=state[key].filter(e=>{
   const residue=typeof e.id==='string'&&/-\d+(?:-\d+)*$/.test(e.id)&&Number.isFinite(e.start)&&Number.isFinite(e.end)&&e.end>=e.start&&e.end-e.start<=EPSILON;
   if(residue)removed++;return !residue;
  });
 }
 if(removed&&state.active&&!state.elements?.some(e=>e.id===state.active)){
  state.active=null;if(state.panel==='element')state.panel='elements';
 }
 return removed;
}
function recoverWorkspace(data){
 const editors=[data?.privateContent?.editorState,...(data?.privateContent?.app?.projects||[]).map(p=>p.snapshot)];
 let removed=0,states=0;
 for(const state of editors){const count=recoverEditor(state);removed+=count;if(count)states++;}
 return{removed,states};
}
const api={EPSILON,sameTiming,splitOnly,spansFor,remap,shiftWhole,remapTrack,retime,recoverEditor,recoverWorkspace,mapPoint};
if(typeof module==='object')module.exports=api;else root.timelineRetime=api;
})(globalThis);
