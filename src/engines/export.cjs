const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process'),{once}=require('node:events');
const stamp=n=>{const ms=Math.round(n*1000),h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':')+','+String(ms%1000).padStart(3,'0');};
function subtitles(state){const out=[];let offset=0;for(const c of state.clips){for(const l of state.transcript||[]){if(l.asset&&l.asset!==c.asset)continue;const a=Math.max(c.start,l.start),b=Math.min(c.end,l.end);if(b>a)out.push({a:(offset+a-c.start)/state.speed,b:(offset+b-c.start)/state.speed,text:l.text});}offset+=c.end-c.start;}return out.map((l,i)=>`${i+1}\n${stamp(l.a)} --> ${stamp(l.b)}\n${l.text}\n`).join('\n');}
function dimensions(ratio,height){const [a,b]=String(ratio||'16/9').split('/').map(Number);if(!a||!b||a/b<.1||a/b>10)throw Error('Invalid aspect ratio');return a>=b?[Math.round(height*a/b/2)*2,height]:[height,Math.round(height*b/a/2)*2];}
// 0.15: checked once per run: whether Apple's hardware H.264 encoder works on this Mac.
let hardwareV15=null;
function hardwareEncoderV15(ffmpeg){if(!hardwareV15)hardwareV15=new Promise(resolve=>{const p=spawn(ffmpeg,['-v','error','-f','lavfi','-i','color=c=black:s=256x256:d=0.2','-c:v','h264_videotoolbox','-f','null','-'],{stdio:'ignore'});p.on('error',()=>resolve(false));p.on('close',code=>resolve(code===0));});return hardwareV15;}
async function exportProject(ctx){
 const {state,cfg,asset,run,ffmpeg,root,saveDialog,progress,cancelled,BrowserWindow}=ctx;
 if(!state.clips?.length||state.clips.length>200)throw Error('Add footage before exporting.');const speed=+state.speed||1;if(speed<.25||speed>4)throw Error('Invalid playback speed.');
 for(const c of state.clips){const a=asset(c.asset);await fs.access(a.path);if(!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end<=c.start||c.end>a.duration+.1)throw Error('Invalid clip range: '+a.name);}
 const duration=state.clips.reduce((n,c)=>n+c.end-c.start,0)/speed;if(!Number.isFinite(duration)||duration>14400)throw Error('Export supports projects up to four hours.');
 const audioOnly=cfg.format==='Audio only',frame=cfg.format==='Frame',gif=cfg.format==='GIF',ext=frame?'png':audioOnly?(cfg.audio||'MP3').toLowerCase():(cfg.format||'MP4').toLowerCase();if(!['mp4','mov','webm','gif','mp3','wav','m4a','png'].includes(ext))throw Error('Unsupported export format');
 // 0.13: a caller that already knows where the file goes (the render queue, a frame for the connector) passes `destination`; otherwise the save dialog asks.
 const dest=ctx.destination?await ctx.destination(ext):await saveDialog('Video Visor export.'+ext);if(!dest)return null;const dir=await fs.mkdtemp(path.join(root,'render-'));let renderer,encoding,encodeError,videoFile;
 const check=()=>{if(cancelled())throw Error('Export cancelled.');};
 try{
 const height=cfg.resolution?.startsWith('4K')?2160:cfg.resolution?.startsWith('720')?720:1080;let [width,h]=dimensions(state.ratio,height);if(gif){const ratio=width/h;width=Math.max(160,Math.min(1280,+cfg.width||640));h=Math.round(width/ratio/2)*2;}if(width>4096||h>4096)throw Error('Output exceeds 4K.');
 const fps=Math.min(60,Math.max(12,+cfg.fps||30));
 if(!audioOnly){
  renderer=new BrowserWindow({width,height:h,useContentSize:true,enableLargerThanScreen:true,show:false,backgroundColor:'#000000',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,offscreen:true}});renderer.webContents.setAudioMuted(true);await renderer.loadURL('visor://app/?render');renderer.webContents.enableDeviceEmulation({screenPosition:'desktop',screenSize:{width,height:h},viewSize:{width,height:h},deviceScaleFactor:1,scale:1});
  for(let i=0;i<200;i++){if(await renderer.webContents.executeJavaScript('!!window.nativeReady'))break;await new Promise(r=>setTimeout(r,50));if(i===199)throw Error('Export renderer did not start.');}
  const exportState=JSON.parse(JSON.stringify(state));exportState.captions=state.captions&&cfg.captions==='Burn into video';exportState.active=null;
  await renderer.webContents.executeJavaScript(`window.exportTuningV15=${JSON.stringify(cfg.tuning||{})};window.exportTimingV15={seek:0,wait:0};document.documentElement.classList.add('export-view');window.exporting=true;visorEditor.set(${JSON.stringify(exportState)});document.fonts.ready.then(()=>true);`);
  if(frame){const draw=`renderNativeFrame(${Math.max(0,+cfg.time||0)})`;await renderer.webContents.executeJavaScript(draw);
   // 0.13: a single frame is the first picture this window draws; on a busy Mac it could be captured before the video had painted. Wait a moment and draw the same instant again.
   await renderer.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,80))))');await renderer.webContents.executeJavaScript(draw);const img=await renderer.webContents.capturePage({x:0,y:0,width,height:h});await fs.writeFile(dest,img.resize({width,height:h}).toPNG());return {path:dest};}
  // 0.9: frames go to FFmpeg as raw pixels (no PNG step) and the video is encoded once at its final
  // quality; the last step only adds the audio track. GIF keeps a lossless-ish intermediate for its palette.
  // 0.15: MP4 / MOV use Apple's hardware H.264 encoder (bitrate scaled to the size), falling back to x264 if it is unavailable.
  const hw=!gif&&ext!=='webm'&&cfg.tuning?.encoder!=='x264'&&await hardwareEncoderV15(ffmpeg),rate=Math.round(Math.min(80e6,Math.max(4e6,width*h*fps*.2)));
  const videoArgs=gif?['-c:v','libx264','-preset','ultrafast','-crf','18','-pix_fmt','yuv420p']:ext==='webm'?['-c:v','libvpx-vp9','-crf','30','-b:v','0','-row-mt','1','-deadline','good','-cpu-used','4','-pix_fmt','yuv420p']:hw?['-c:v','h264_videotoolbox','-b:v',String(rate),'-maxrate',String(Math.round(rate*1.5)),'-bufsize',String(rate*2),'-profile:v','high','-pix_fmt','yuv420p']:['-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p'];
  videoFile=path.join(dir,gif?'silent.mp4':'video.'+(ext==='webm'?'webm':'mp4'));
  let err='';encoding=spawn(ffmpeg,['-y','-f','rawvideo','-pix_fmt','bgra','-s',width+'x'+h,'-framerate',String(fps),'-i','pipe:0','-an',...videoArgs,videoFile],{stdio:['pipe','ignore','pipe']});
  const done=new Promise((resolve,reject)=>{encoding.on('error',reject);encoding.on('close',code=>code===0?resolve():reject(Error(err||'Video encoding failed')));});done.catch(e=>{encodeError=e;});encoding.stderr.on('data',d=>err=(err+d).slice(-4000));encoding.stdin.on('error',e=>{encodeError=e;});
  renderer.webContents.setFrameRate(120);
  const frames=Math.ceil(duration*fps),T={draw:0,capture:0,convert:0,pipe:0},now=()=>Number(process.hrtime.bigint())/1e6,started=now();
  const clock=sec=>{sec=Math.max(0,Math.round(sec));return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');};
  let drain=null;
  for(let n=0;n<frames;n++){
   check();if(encodeError)throw encodeError;
   let t0=now();await renderer.webContents.executeJavaScript(`renderNativeFrame(${Math.min(n/fps*speed,duration*speed-.002)})`);
   let t1=now();T.draw+=t1-t0;let img=await renderer.webContents.capturePage({x:0,y:0,width,height:h});
   t0=now();T.capture+=t0-t1;const size=img.getSize();if(size.width!==width||size.height!==h)img=img.resize({width,height:h});
   const pixels=img.toBitmap();if(pixels.length!==width*h*4)throw Error('Export frame has an unexpected size.');
   // 0.15: the encoder works on this frame while the next one is drawn; we only wait for it before the next write.
   t1=now();T.convert+=t1-t0;if(drain){await drain;drain=null;}if(!encoding.stdin.write(pixels))drain=Promise.race([once(encoding.stdin,'drain'),done]);T.pipe+=now()-t1;
   if(n%Math.max(1,Math.round(fps/2))===0){const elapsed=(now()-started)/1000,left=n>fps?elapsed/n*(frames-n)*1.08:null;progress(n/frames*90,'Rendering video · '+Math.round(n/frames*100)+'%'+(left==null?'':' · about '+clock(left)+' left'));}
  }
  if(drain)await drain;encoding.stdin.end();await done;const R=await renderer.webContents.executeJavaScript('window.exportTimingV15||{}').catch(()=>({}));renderer.destroy();renderer=null;ctx.timing={frames,...T,seek:R.seek||0,wait:R.wait||0,renderMs:Math.round(now()-started)};
 }
 check();
 const audio=path.join(dir,'audio.wav');
 if(!gif){
 const pieces=[];for(let i=0;i<state.clips.length;i++){check();const c=state.clips[i],a=asset(c.asset),file=path.join(dir,'audio-'+i+'.wav'),d=(c.end-c.start)/speed;let args=['-y'];if(a.hasAudio)args.push('-ss',String(c.start),'-t',String(c.end-c.start),'-i',a.path);else args.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t',String(d));const filters=[];if(a.hasAudio){let tempo=speed;while(tempo>2){filters.push('atempo=2');tempo/=2;}while(tempo<.5){filters.push('atempo=0.5');tempo/=.5;}filters.push('atempo='+tempo);}if(state.audio?.noise&&a.hasAudio)filters.push('afftdn=nf=-25');if(state.audio?.level&&a.hasAudio)filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');filters.push('volume='+((c.muted||state.hiddenTracks?.audio)?0:Math.max(0,Math.min(3,(state.audio?.voice??100)/100*((c.volume??100)/100)))));/* 0.15: clip audio fades */if(!c.muted&&c.audioFadeIn>0)filters.push('afade=t=in:st=0:d='+Math.min(d,c.audioFadeIn/speed));if(!c.muted&&c.audioFadeOut>0)filters.push('afade=t=out:st='+Math.max(0,d-c.audioFadeOut/speed)+':d='+Math.min(d,c.audioFadeOut/speed));args.push('-vn','-af',filters.join(','),'-ar','48000','-ac','2','-t',String(d),file);await run(ffmpeg,args);pieces.push(file);progress(90+i/state.clips.length*5,'Preparing sound · clip '+(i+1)+' of '+state.clips.length);}
 const list=path.join(dir,'concat.txt');await fs.writeFile(list,pieces.map(p=>`file '${p.replace(/'/g,"'\\''")}'`).join('\n'));const joined=path.join(dir,'joined.wav');await run(ffmpeg,['-y','-f','concat','-safe','0','-i',list,'-c','copy',joined]);
 const args=['-y','-i',joined],filters=[],mix=['[0:a]'];let idx=1;for(const [track,volume,loop]of [...(state.audioClips||[]).filter(t=>!t.muted).map(t=>[t,t.volume??100,false]),[state.music,state.audio?.music??20,true],[state.voiceover,state.audio?.voice??100,false]]){if(!track?.asset||(loop?state.hiddenTracks?.music:state.hiddenTracks?.audio))continue;const a=asset(track.asset);if(loop)args.push('-stream_loop','-1');if(track.sourceIn!=null)args.push('-ss',String(track.sourceIn));if(track.end!=null)args.push('-t',String(track.end-track.start));args.push('-i',a.path);const duck=loop&&track.duck?.45:1,cleanup=!loop?[state.audio?.noise?'afftdn=nf=-25':'',state.audio?.level?'loudnorm=I=-16:TP=-1.5:LRA=11':''].filter(Boolean).join(','):'';filters.push(`[${idx}:a]aresample=48000,${speed!==1?'atempo='+Math.sqrt(speed)+',atempo='+Math.sqrt(speed)+',':''}${cleanup?cleanup+',':''}volume=${Math.min(1.5,volume/100)*duck},${track.fadeIn?'afade=t=in:d='+track.fadeIn+',':''}${track.fadeOut&&track.end?'afade=t=out:st='+Math.max(0,track.end-track.start-track.fadeOut)+':d='+track.fadeOut+',':''}adelay=${Math.round((track.start||0)/speed*1000)}:all=1[a${idx}]`);mix.push(`[a${idx}]`);idx++;}if(mix.length>1){filters.push(mix.join('')+`amix=inputs=${mix.length}:duration=first:normalize=0,alimiter=limit=0.95[out]`);args.push('-filter_complex',filters.join(';'),'-map','[out]');}args.push('-t',String(duration),'-ar','48000','-ac','2',audio);await run(ffmpeg,args);
 }
 check();progress(96,'Adding sound and saving');const output=path.join(dir,'output.'+ext);
 if(audioOnly){const codec=ext==='mp3'?['-c:a','libmp3lame','-b:a','256k']:ext==='m4a'?['-c:a','aac','-b:a','256k']:['-c:a','pcm_s16le'];await run(ffmpeg,['-y','-i',audio,...codec,output]);}
 else if(gif)await run(ffmpeg,['-y','-i',videoFile,'-filter_complex','split[a][b];[a]palettegen[p];[b][p]paletteuse','-loop','0',output]);
 else{const codec=ext==='webm'?['-c:v','copy','-c:a','libopus']:['-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart'];await run(ffmpeg,['-y','-i',videoFile,'-i',audio,'-map','0:v:0','-map','1:a:0',...codec,'-t',String(duration),output]);}
 check();await fs.copyFile(output,dest);let srt;if(cfg.captions?.startsWith('Separate')){srt=dest.replace(/\.[^.]+$/,'.srt');await ctx.validateOutput?.(srt);await fs.writeFile(srt,subtitles(state));}progress(100,'Export complete');return {path:dest,srt,timing:ctx.timing};
 }finally{renderer?.destroy();if(encoding&&!encoding.killed)encoding.kill();await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={exportProject,subtitles,dimensions};
