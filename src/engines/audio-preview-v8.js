(function(root){
function key(s){return JSON.stringify({speed:s.speed,clips:(s.clips||[]).map(c=>({asset:c.asset,start:c.start,end:c.end,muted:c.muted,gap:c.gap})),audio:s.audio,music:s.music,voiceover:s.voiceover,audioClips:(s.audioClips||[]).map(({trackId,...a})=>a),hidden:{audio:s.hiddenTracks?.audio,music:s.hiddenTracks?.music}});}
const api={key};if(typeof module==='object')module.exports=api;else root.audioPreviewModelV8=api;
})(globalThis);
