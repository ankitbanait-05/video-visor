// 0.9: the speech engine pads its last segment to the end of its analysis window, so a caption could end
// after the clip does. Lines and words are clamped to the media length when it is known.
/* 0.15 (Win-fix 6): the Windows whisper.cpp build (v1.9.2) often gives the first words of a segment no length
   (" This@3200 | is@3200 | a@3200"). They used to be dropped, so word-by-word captions and edit-by-text lost words. Zero-length
   words are kept: they share the time up to the next word (at most 0.5 s each), get at least 40 ms (taken from the next word when
   there is no gap), and words stay in order without overlapping. */
const MIN_WORD_MS=40,MAX_SPREAD_MS=500;
function timeTokens(tokens,segmentEnd){
 const list=[];
 for(const t of tokens||[]){
  if(!t||typeof t.text!=='string'||/^\[_/.test(t.text)||!t.text.trim()||!t.offsets)continue;
  const from=Number(t.offsets.from),to=Number(t.offsets.to);if(!Number.isFinite(from))continue;
  list.push({text:t.text,from,to:Number.isFinite(to)?to:from});
 }
 for(let i=0;i<list.length;){
  if(list[i].to>list[i].from){i++;continue;}
  let j=i;while(j<list.length&&!(list[j].to>list[j].from))j++;
  const n=j-i,next=list[j],start=Math.max(list[i].from,i?list[i-1].to:-Infinity);
  const until=next?next.from:Math.max(Number(segmentEnd)||0,start);
  let each=Math.min(MAX_SPREAD_MS,(until-start)/n);
  if(!(each>=MIN_WORD_MS)){each=MIN_WORD_MS;if(next&&next.to-(start+n*each)>=MIN_WORD_MS)next.from=Math.max(next.from,start+n*each);}
  for(let k=0;k<n;k++){list[i+k].from=start+k*each;list[i+k].to=start+(k+1)*each;}
  i=j;
 }
 let prev=-Infinity;
 for(const t of list){if(t.from<prev)t.from=prev;if(t.to-t.from<1)t.to=t.from+MIN_WORD_MS;prev=t.to;}
 return list;
}
function parseTranscript(data,id,duration){
 const limit=Number.isFinite(duration)&&duration>0?duration:Infinity,clamp=t=>Math.min(limit,t);
 return (data.transcription||[]).map(segment=>{
  const words=[];
  for(const t of timeTokens(segment.tokens,segment.offsets?.to)){
   const item={text:t.text.trim(),start:clamp(t.from/1000),end:clamp(t.to/1000)};
   if(/^\s/.test(t.text)||!words.length)words.push(item);else{words.at(-1).text+=item.text;words.at(-1).end=item.end;}
  }
  return {asset:id,start:segment.offsets.from/1000,end:clamp(segment.offsets.to/1000),text:segment.text.trim(),words};
 }).filter(l=>l.text&&l.end>l.start);
}
module.exports={parseTranscript,timeTokens};
