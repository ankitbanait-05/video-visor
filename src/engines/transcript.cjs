// 0.9: the speech engine pads its last segment to the end of its analysis window, so a caption could end
// after the clip does. Lines and words are clamped to the media length when it is known.
function parseTranscript(data,id,duration){
 const limit=Number.isFinite(duration)&&duration>0?duration:Infinity,clamp=t=>Math.min(limit,t);
 return (data.transcription||[]).map(segment=>{
  const words=[];
  for(const t of segment.tokens||[]){
   if(/^\[_/.test(t.text)||t.offsets.to<=t.offsets.from)continue;
   const item={text:t.text.trim(),start:clamp(t.offsets.from/1000),end:clamp(t.offsets.to/1000)};
   if(!item.text)continue;
   if(/^\s/.test(t.text)||!words.length)words.push(item);else{words.at(-1).text+=item.text;words.at(-1).end=item.end;}
  }
  return {asset:id,start:segment.offsets.from/1000,end:clamp(segment.offsets.to/1000),text:segment.text.trim(),words};
 }).filter(l=>l.text&&l.end>l.start);
}
module.exports={parseTranscript};
