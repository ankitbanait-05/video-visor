(function(root){
'use strict';
const groups=['video','audio','graphics','captions','effects'];
const labels={video:'Video',audio:'Audio',graphics:'Text & graphics',captions:'Captions',effects:'Effects'};
function duration(s){return (s.clips||[]).reduce((n,c)=>n+c.end-c.start,0);}
function occurrences(s,asset,start,end){let offset=0;const out=[];for(const c of s.clips||[]){const a=Math.max(c.start,start),b=Math.min(c.end,end);if((!asset||c.asset===asset)&&b>a)out.push({start:offset+a-c.start,end:offset+b-c.start});offset+=c.end-c.start;}return out;}
function entries(s){
 const out=[];let offset=0;
 for(const c of s.clips||[]){const range={start:offset,end:offset+c.end-c.start};out.push({type:'video',id:c.id,item:c,group:'video',fixed:true,field:'trackId',ranges:[range]});if(!c.muted&&(s.assets||[]).find(a=>a.id===c.asset)?.hasAudio)out.push({type:'source',id:c.id,item:c,group:'audio',field:'audioTrackId',ranges:[range]});offset=range.end;}
 for(const [key,type,group]of [['overlays','overlay','video'],['audioClips','audioClip','audio'],['elements','element','graphics'],['zooms','zoom','effects']])for(const item of s[key]||[]){const g=type==='element'&&['cover','blur','tracking-blur'].includes(item.kind)?'effects':group;out.push({type,id:item.id,item,group:g,field:'trackId',ranges:item.tracking?occurrences(s,item.tracking.asset,item.tracking.start,item.tracking.end):[{start:item.start,end:item.end}]});}
 for(const type of ['music','voiceover']){const item=s[type];if(item){const a=(s.assets||[]).find(a=>a.id===item.asset);out.push({type,id:item.asset,item,group:'audio',field:'trackId',ranges:[{start:item.start||0,end:item.end??(type==='music'?offset:Math.min(offset,(item.start||0)+(a?.duration||0)))}]});}}
 for(const item of s.transcript||[])out.push({type:'caption',id:item.id,item,group:'captions',field:'trackId',ranges:occurrences(s,item.asset,item.start,item.end)});
 return out;
}
const overlaps=(a,b)=>a.some(x=>b.some(y=>x.start<y.end-1e-6&&x.end>y.start+1e-6));
function normalize(s){
 s.timelineTracks=Array.isArray(s.timelineTracks)?s.timelineTracks.filter((t,i,a)=>groups.includes(t.group)&&typeof t.id==='string'&&a.findIndex(x=>x.id===t.id)===i):[];
 const ensure=group=>{let i=1;while(s.timelineTracks.some(t=>t.id===group+'-'+i))i++;const t={id:group+'-'+i,group,name:labels[group]+' '+i};s.timelineTracks.push(t);return t;};
 if(!s.timelineTracks.some(t=>t.id==='video-main'))s.timelineTracks.unshift({id:'video-main',group:'video',name:'Main video'});
 const items=entries(s),occupied=new Map();
 // Resolve saved assignments before newcomers so adding a title never shuffles existing tracks.
 const ordered=items.map((e,i)=>({e,i,assigned:s.timelineTracks.some(t=>t.id===e.item[e.field]&&t.group===e.group)})).sort((a,b)=>Number(b.assigned)-Number(a.assigned)||a.i-b.i);
 for(const {e}of ordered){
  const valid=t=>t.group===e.group&&(e.fixed?t.id==='video-main':t.id!=='video-main')&&!overlaps(occupied.get(t.id)||[],e.ranges);
  let track=e.fixed?s.timelineTracks.find(t=>t.id==='video-main'):s.timelineTracks.find(t=>t.id===e.item[e.field]&&valid(t));
  track??=s.timelineTracks.find(t=>!t.locked&&valid(t));track??=ensure(e.group);e.item[e.field]=track.id;occupied.set(track.id,[...(occupied.get(track.id)||[]),...e.ranges]);
 }
 for(const group of ['audio','graphics','captions','effects'])if(!s.timelineTracks.some(t=>t.group===group))ensure(group);
 if(!s.trackSchema){const names={video:'Video',source:'Audio',overlay:'Overlay',audioClip:'Audio clip',caption:'Captions',music:'Music',voiceover:'Narration',zoom:'Effects'};for(const e of items){const name=names[e.type]||(e.group==='effects'?'Effects':'Graphics');if(s.lockedTracks?.[name+' track'])s.timelineTracks.find(t=>t.id===e.item[e.field]).locked=true;}s.lockedTracks={};}
 s.trackSchema=1;return s;
}
function canPlace(s,refs,targetId,delta=0){
 const all=entries(s),chosen=all.filter(e=>refs.some(r=>r.type===e.type&&r.id===e.id)),target=s.timelineTracks?.find(t=>t.id===targetId);
 if(!target||target.locked||!chosen.length||chosen.some(e=>e.fixed||e.group!==target.group||e.type==='source'||e.type==='caption'||((e.item.tracking||e.item.linkId)&&delta!==0)))return false;
 const ranges=chosen.flatMap(e=>e.ranges.map(r=>({start:r.start+delta,end:r.end+delta})));
 if(ranges.some(r=>r.start<-.00001||r.end>duration(s)+.00001))return false;
 for(let i=0;i<chosen.length;i++)for(let j=0;j<i;j++)if(overlaps(chosen[i].ranges,chosen[j].ranges))return false;
 return !all.some(e=>!chosen.includes(e)&&e.item[e.field]===targetId&&overlaps(ranges,e.ranges));
}
function place(s,refs,targetId,delta=0){
 if(!canPlace(s,refs,targetId,delta))return false;
 for(const e of entries(s).filter(e=>refs.some(r=>r.type===e.type&&r.id===e.id))){e.item[e.field]=targetId;if(!e.item.tracking){e.item.start=(e.item.start||0)+delta;if(Number.isFinite(e.item.end))e.item.end+=delta;}}
 return true;
}
const api={groups,labels,entries,normalize,overlaps,canPlace,place,duration};if(typeof module==='object')module.exports=api;else root.trackModelV8=api;
})(globalThis);
