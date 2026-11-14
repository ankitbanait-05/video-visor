const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process'),{once}=require('node:events');
const stamp=n=>{const ms=Math.round(n*1000),h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':')+','+String(ms%1000).padStart(3,'0');};
function subtitles(state){const out=[];let offset=0;for(const c of state.clips){if(!c.gap)for(const l of state.transcript||[]){if(l.asset&&l.asset!==c.asset)continue;const a=Math.max(c.start,l.start),b=Math.min(c.end,l.end);if(b>a)out.push({a:(offset+a-c.start)/state.speed,b:(offset+b-c.start)/state.speed,text:l.text});}offset+=c.end-c.start;}return out.map((l,i)=>`${i+1}\n${stamp(l.a)} --> ${stamp(l.b)}\n${l.text}\n`).join('\n');}
function dimensions(ratio,height){const [a,b]=String(ratio||'16/9').split('/').map(Number);if(!a||!b||a/b<.1||a/b>10)throw Error('Invalid aspect ratio');return a>=b?[Math.round(height*a/b/2)*2,height]:[height,Math.round(height*b/a/2)*2];}
// 0.15: checked once per run: whether Apple's hardware H.264 encoder works on this Mac.
let hardwareV15=null;
function hardwareEncoderV15(ffmpeg){if(!hardwareV15)hardwareV15=new Promise(resolve=>{const p=spawn(ffmpeg,['-v','error','-f','lavfi','-i','color=c=black:s=256x256:d=0.2','-c:v','h264_videotoolbox','-f','null','-'],{stdio:'ignore'});p.on('error',()=>resolve(false));p.on('close',code=>resolve(code===0));});return hardwareV15;}
// Keeps render-cache/ under `limit` bytes, removing the least recently used pieces first.
async function pruneRenderCacheV18(dir,limit){const files=[];for(const f of await fs.readdir(dir).catch(()=>[])){if(!f.endsWith('.ts'))continue;const st=await fs.stat(path.join(dir,f)).catch(()=>null);if(st)files.push({f,size:st.size,t:st.mtimeMs});}files.sort((a,b)=>b.t-a.t);let total=0;for(const x of files){total+=x.size;if(total>limit)await fs.unlink(path.join(dir,x.f)).catch(()=>{});}}
async function exportProject(ctx){
 const {state,cfg,asset,run,ffmpeg,root,saveDialog,progress,cancelled,BrowserWindow}=ctx;
 if(!state.clips?.length||state.clips.length>200)throw Error('Add footage before exporting.');const speed=+state.speed||1;if(speed<.25||speed>4)throw Error('Invalid playback speed.');
 for(const c of state.clips){const a=asset(c.asset);await fs.access(a.path).catch(()=>{throw Error('“'+a.name+'” can’t be found. It may have been moved, renamed or deleted. In the editor, open Media and choose Relink to point to it again.');});if(!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end<=c.start||c.end>a.duration+.1)throw Error('Invalid clip range: '+a.name);}
 const duration=state.clips.reduce((n,c)=>n+c.end-c.start,0)/speed;if(!Number.isFinite(duration)||duration>14400)throw Error('Export supports projects up to four hours.');
 const audioOnly=cfg.format==='Audio only',frame=cfg.format==='Frame',gif=cfg.format==='GIF',ext=frame?'png':audioOnly?(cfg.audio||'MP3').toLowerCase():(cfg.format||'MP4').toLowerCase();if(!['mp4','mov','webm','gif','mp3','wav','m4a','png'].includes(ext))throw Error('Unsupported export format');
 // 0.13: a caller that already knows where the file goes (the render queue, a frame for the connector) passes `destination`; otherwise the save dialog asks.
 const dest=ctx.destination?await ctx.destination(ext):await saveDialog('Video Visor export.'+ext);if(!dest)return null;const dir=await fs.mkdtemp(path.join(root,'render-'));let renderer,encoding,encodeError,videoFile;const extraRenderers=[];let stopDirect=()=>{};
 const check=()=>{if(cancelled())throw Error('Export cancelled.');};
 try{
 const height=cfg.resolution?.startsWith('4K')?2160:cfg.resolution?.startsWith('720')?720:1080;let [width,h]=dimensions(state.ratio,height);if(gif){const ratio=width/h;width=Math.max(160,Math.min(1280,+cfg.width||640));h=Math.round(width/ratio/2)*2;}/* 0.15 (AU-08): a very wide or tall canvas at 4K is scaled to fit 4096 px instead of failing */if(width>4096||h>4096){const k=4096/Math.max(width,h);width=Math.round(width*k/2)*2;h=Math.round(h*k/2)*2;}
 const fps=Math.min(gif?15:60,Math.max(gif?8:12,parseFloat(cfg.fps)||30));/* 0.15 (AU-07): GIFs at up to 15 fps */
 if(!audioOnly){
  const exportState=JSON.parse(JSON.stringify(state));exportState.captions=state.captions&&cfg.captions==='Burn into video';exportState.active=null;
  // 0.15 (Phase 18): export windows are made by one function, so a second one can draw in parallel (E4).
  const openRenderer=async(graphics=false)=>{const r=new BrowserWindow({width,height:h,useContentSize:true,enableLargerThanScreen:true,show:false,backgroundColor:graphics?'#00000000':'#000000',transparent:graphics,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,offscreen:true}});extraRenderers.push(r);r.webContents.setAudioMuted(true);await r.loadURL('visor://app/?render');r.webContents.enableDeviceEmulation({screenPosition:'desktop',screenSize:{width,height:h},viewSize:{width,height:h},deviceScaleFactor:1,scale:1});
   for(let i=0;i<200;i++){if(await r.webContents.executeJavaScript('!!window.nativeReady'))break;await new Promise(x=>setTimeout(x,50));if(i===199)throw Error('Export renderer did not start.');}
   await r.webContents.executeJavaScript(`window.exportTuningV15=${JSON.stringify(cfg.tuning||{})};window.exportTimingV15={seek:0,wait:0};document.documentElement.classList.add('export-view');window.exporting=true;visorEditor.set(${JSON.stringify(exportState)});document.fonts.ready.then(()=>true);`);
   if(graphics)await r.webContents.executeJavaScript('window.exportGraphicsModeV18(true)');r.webContents.setFrameRate(120);return r;};
  renderer=await openRenderer();
  if(frame){const draw=`renderNativeFrame(${Math.max(0,+cfg.time||0)})`;await renderer.webContents.executeJavaScript(draw);
   // 0.13: a single frame is the first picture this window draws; on a busy Mac it could be captured before the video had painted. Wait a moment and draw the same instant again.
   await renderer.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,80))))');await renderer.webContents.executeJavaScript(draw);const img=await renderer.webContents.capturePage({x:0,y:0,width,height:h});await fs.writeFile(dest,img.resize({width,height:h}).toPNG());return {path:dest};}
  // 0.9: frames go to FFmpeg as raw pixels (no PNG step) and the video is encoded once at its final
  // quality; the last step only adds the audio track. GIF keeps a lossless-ish intermediate for its palette.
  // 0.15: MP4 / MOV use Apple's hardware H.264 encoder (bitrate scaled to the size), falling back to x264 if it is unavailable.
  const hw=!gif&&ext!=='webm'&&cfg.tuning?.encoder!=='x264'&&await hardwareEncoderV15(ffmpeg),rate=Math.round(Math.min(80e6,Math.max(4e6,width*h*fps*.2)));
  const videoArgs=gif?['-c:v','libx264','-preset','ultrafast','-crf','18','-pix_fmt','yuv420p']:ext==='webm'?['-c:v','libvpx-vp9','-crf','30','-b:v','0','-row-mt','1','-deadline','good','-cpu-used','4','-pix_fmt','yuv420p']:hw?['-c:v','h264_videotoolbox','-b:v',String(rate),'-maxrate',String(Math.round(rate*1.5)),'-bufsize',String(rate*2),'-profile:v','high','-pix_fmt','yuv420p']:['-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p'];
  videoFile=path.join(dir,gif?'silent.mp4':'video.'+(ext==='webm'?'webm':'mp4'));
  /* 0.15 (Phase 14): frames are converted to video colours with BT.709 and the file is tagged so, as players assume for HD; before, BT.601 was used untagged, which shifted colours slightly (greens and reds). */
  const colourArgs=gif?[]:['-vf','scale=out_color_matrix=bt709:out_range=tv:flags=bicubic','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-color_range','tv'];
  renderer.webContents.setFrameRate(120);
  const frames=Math.ceil(duration*fps),T={draw:0,capture:0,convert:0,pipe:0},now=()=>Number(process.hrtime.bigint())/1e6,started=now();
  const clock=sec=>{sec=Math.max(0,Math.round(sec));return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');};
  // 0.15 (Phase 18): a frame that takes over 20 s means an export window stopped answering; stop with a clear error instead of waiting forever.
  const within=(p,what)=>{let t;return Promise.race([p,new Promise((_,rej)=>{t=setTimeout(()=>rej(Error('The export stopped responding while '+what+'. Try exporting again.')),20000);})]).finally(()=>clearTimeout(t));};
  const drawOn=async(r,n)=>{let t0=now();await within(r.webContents.executeJavaScript(`renderNativeFrame(${Math.min(n/fps*speed,duration*speed-.002)})`),'drawing frame '+n);
   /* 0.15 (Phase 18, E3): optionally take the frame the window paints next (offscreen 'paint') instead of capturePage */const paintNext=()=>new Promise(res=>{r.webContents.once('paint',(_e,_d,image)=>res(image));r.webContents.invalidate();});
   /* An offscreen window repaints only when something changed; a frame identical to the last one (a still caption) never arrives, so ask for a repaint first */if(cfg.tuning?.capture!=='paint')r.webContents.invalidate();
   let t1=now();T.draw+=t1-t0;let img=await within(cfg.tuning?.capture==='paint'?paintNext():r.webContents.capturePage({x:0,y:0,width,height:h}),'capturing frame '+n);
   t0=now();T.capture+=t0-t1;const size=img.getSize();if(size.width!==width||size.height!==h)img=img.resize({width,height:h});
   const pixels=img.toBitmap();if(pixels.length!==width*h*4)throw Error('Export frame has an unexpected size.');T.convert+=now()-t0;return pixels;};const drawFrame=n=>drawOn(renderer,n);
  // An encoder fed raw frames from this process (export-window frames, or decoded frames for WebM).
  const procs=new Set();stopDirect=()=>{for(const p of procs)try{p.kill('SIGKILL');}catch{}};
  const encoder=(file,format)=>{let err='';const p=spawn(ffmpeg,['-y','-f','rawvideo','-pix_fmt','bgra','-s',width+'x'+h,'-framerate',String(fps),'-i','pipe:0','-an',...colourArgs,...videoArgs,...(format?['-f',format]:[]),file],{stdio:['pipe','ignore','pipe']});procs.add(p);encoding=p;
   const done=new Promise((resolve,reject)=>{p.on('error',reject);p.on('close',code=>{procs.delete(p);code===0?resolve():reject(Error(err||'Video encoding failed'));});});done.catch(e=>{encodeError=e;});p.stderr.on('data',d=>err=(err+d).slice(-4000));p.stdin.on('error',e=>{encodeError=e;});let drain=null;
   // the encoder works on this frame while the next one is drawn; we only wait for it before the next write
   return {async write(px){const t=now();if(drain){await drain;drain=null;}if(!p.stdin.write(px))drain=Promise.race([once(p.stdin,'drain'),done]);T.pipe+=now()-t;},async end(){if(drain)await drain;p.stdin.end();await done;}};};
  // 0.15 (Phase 14, E1): plain stretches are decoded by FFmpeg. One frame of each clip is made both ways first; a clip
  // whose frames don't match (something drawn this code doesn't know about) stays on the export window.
  const D=require('./export-direct.cjs'),fit=exportState.fit||'contain',directInfo={stretches:0,frames:0,checks:[]},directMin=cfg.tuning?.directMin||30;/* geometry errors score under 28; a match scores 31–40 (Chrome and FFmpeg scale slightly differently) */
  const overlays=ext!=='webm'&&cfg.tuning?.overlay!==false;let stretches=gif||cfg.tuning?.direct===false?[]:D.plan(exportState,{fps,frames,speed,captions:!!exportState.captions,overlay:overlays});
  const verdict=new Map();
  for(const st of stretches.filter(x=>x.kind==='plain')){if(verdict.has(st.clip))continue;check();const m=Math.floor((st.n0+st.n1)/2),browser=await drawFrame(m),c=exportState.clips[st.clip],a=asset(c.asset),pad=D.padColour(browser,width,h,a,fit);
   let best={q:0};for(const matrix of ['bt709','auto']){const f=D.feed({ffmpeg,asset:a,clip:c,stretch:{...st,n0:m,n1:m+1},fps,speed,width,height:h,fit,pad,matrix});const px=await f.next();f.stop();const q=px?D.psnr(browser,px,width,h):0;
    if(cfg.tuning?.dumpDirect){const k=cfg.tuning.dumpDirect+'-'+speed+'-'+matrix;await fs.writeFile(k+'-browser.bgra',browser);if(px)await fs.writeFile(k+'-direct.bgra',px);}if(q>best.q)best={q,matrix};if(q>=directMin)break;}
   verdict.set(st.clip,{ok:best.q>=directMin,pad,matrix:best.matrix});directInfo.checks.push({clip:st.clip,psnr:+best.q.toFixed(1),matrix:best.matrix});}
  // 0.15 (Phase 18, E2): an overlay stretch is checked on its own: its middle frame drawn whole by the export window
  // against the footage decoded by FFmpeg with the graphics (drawn alone) laid on top.
  let gfxRenderer=null;const gfxWindow=async()=>gfxRenderer||(gfxRenderer=await openRenderer(true));
  const overlayArgs=(st,v,out)=>{const d=D.decodeArgs({ffmpeg,asset:asset(exportState.clips[st.clip].asset),clip:exportState.clips[st.clip],stretch:st,fps,speed,width,height:h,fit,pad:v.pad,matrix:v.matrix}),input=d.input.slice(0,d.input.indexOf('-map'));
   const tail=out?[colourArgs[1]]:[];return {count:d.count,args:['-y','-v','error',...(out?['-stats']:[]),...input,'-f','rawvideo','-pix_fmt','bgra','-s',width+'x'+h,'-framerate',String(fps),'-i','pipe:0','-filter_complex',`[0:v]${d.filter}[v];[1:v]setpts=PTS-STARTPTS[g];[v][g]overlay=0:0:alpha=premultiplied:format=auto:eof_action=pass${tail.length?','+tail[0]:''}[o]`,'-map','[o]','-an',...(out?[...colourArgs.slice(2),...videoArgs,'-frames:v',String(d.count),'-f','mpegts',out]:['-frames:v','1','-f','rawvideo','-pix_fmt','bgra','pipe:1'])]};};
  const overlayFrame=(st,v,gfx)=>new Promise(resolve=>{const {args}=overlayArgs(st,v,null),p=spawn(ffmpeg,args,{stdio:['pipe','pipe','ignore']});procs.add(p);const chunks=[];p.stdout.on('data',c=>chunks.push(c));p.stdin.on('error',()=>{});p.on('error',()=>resolve(null));p.on('close',()=>{procs.delete(p);const b=Buffer.concat(chunks);resolve(b.length>=width*h*4?b.subarray(0,width*h*4):null);});p.stdin.end(gfx);});
  for(const st of stretches.filter(x=>x.kind==='overlay')){check();const m=Math.floor((st.n0+st.n1)/2),whole=await drawFrame(m),g=await gfxWindow().then(r=>drawOn(r,m)).catch(()=>null),a=asset(exportState.clips[st.clip].asset);let best={q:0};
   if(g)for(const matrix of ['bt709','auto']){const v={pad:D.padColour(whole,width,h,a,fit),matrix},px=await overlayFrame({...st,n0:m,n1:m+1},v,g);const q=px?D.psnr(whole,px,width,h):0;
    if(cfg.tuning?.dumpDirect){const info=await gfxRenderer.webContents.executeJavaScript("JSON.stringify({cls:document.documentElement.className,flag:window.exportGraphicsV18,vis:getComputedStyle(document.querySelector('#native-video')).visibility,hidden:document.querySelector('#native-video').hidden,body:getComputedStyle(document.body).backgroundColor,canvas:getComputedStyle(document.querySelector('#ed-canvas')).backgroundColor})").catch(e=>e.message);await fs.writeFile(cfg.tuning.dumpDirect+'-gfxinfo.json',info+' alpha0='+g[3]+' alphaMid='+g[(540*width+960)*4+3]);}
    if(cfg.tuning?.dumpDirect){const k=cfg.tuning.dumpDirect+'-overlay-'+st.n0+'-'+matrix;await fs.writeFile(k+'-whole.bgra',whole);await fs.writeFile(k+'-gfx.bgra',g);if(px)await fs.writeFile(k+'-composite.bgra',px);}if(q>best.q)best={q,...v};if(q>=directMin)break;}
   st.verdict={ok:best.q>=directMin,pad:best.pad,matrix:best.matrix};directInfo.checks.push({overlay:[st.n0,st.n1],psnr:+best.q.toFixed(1)});}
  stretches=stretches.filter(st=>st.kind==='overlay'?st.verdict?.ok:verdict.get(st.clip)?.ok);directInfo.stretches=stretches.length;directInfo.overlayFrames=0;
  const optsOf=st=>{const c=exportState.clips[st.clip],v=verdict.get(st.clip);return {ffmpeg,asset:asset(c.asset),clip:c,stretch:st,fps,speed,width,height:h,fit,pad:v.pad,matrix:v.matrix};};
  let windowDone=0,directDone=0,overlayDone=0;const report=()=>{const n=windowDone+directDone+overlayDone,elapsed=(now()-started)/1000,left=n>fps?elapsed/n*(frames-n)*1.08:null;progress(n/frames*85,'Step 1 of 2 · Picture · '+Math.round(n/frames*100)+'%'+(left==null?'':' · about '+clock(left)+' left'));};
  // MP4 / MOV: the timeline is cut into pieces. Plain pieces are decoded and encoded by FFmpeg on their own, two at a
  // time, while the export window draws the others; the pieces are joined without re-encoding. (WebM and exports
  // without plain stretches use one encoder for the whole video.)
  const split=ext!=='webm'&&!gif&&cfg.tuning?.pieces!==false;
  if(split){
   const pieces=[];{let n=0;for(const st of stretches){if(st.n0>n)pieces.push({n0:n,n1:st.n0});pieces.push({n0:st.n0,n1:st.n1,st});n=st.n1;}if(n<frames)pieces.push({n0:n,n1:frames});}
   // 0.15 (Phase 18, E4): with more than a few seconds for the export window, a second window draws in parallel; window
   // stretches are cut into chunks so both stay busy. Each chunk is encoded on its own and joined like the others.
   const windowFrames=pieces.filter(pc=>!pc.st).reduce((n,pc)=>n+pc.n1-pc.n0,0),windows=Math.max(1,Math.min(+(cfg.tuning?.windows??2)||1,windowFrames>fps*6?2:1));
   const chunk=Math.max(fps*2,Math.ceil(windowFrames/(windows*3)));
   const overlayFrames=pieces.filter(pc=>pc.st?.kind==='overlay').reduce((n,pc)=>n+pc.n1-pc.n0,0),gfxWindows=Math.max(1,Math.min(+(cfg.tuning?.windows??2)||1,overlayFrames>fps*6?2:1)),gfxChunk=Math.max(fps*2,Math.ceil(overlayFrames/(gfxWindows*3)));
   for(let i=pieces.length-1;i>=0;i--){const pc=pieces[i],ov=pc.st?.kind==='overlay',size=ov?gfxChunk:chunk;if((pc.st&&!ov)||pc.n1-pc.n0<=size*1.5)continue;const parts=[];for(let n=pc.n0;n<pc.n1;n+=size)parts.push({n0:n,n1:Math.min(pc.n1,n+size)});if(parts.length>1&&parts.at(-1).n1-parts.at(-1).n0<fps)parts.at(-2).n1=parts.pop().n1;pieces.splice(i,1,...parts.map(x=>ov?{...x,st:{...pc.st,n0:x.n0,n1:x.n1}}:x));}
   directInfo.gfxWindows=gfxWindows;
   directInfo.windows=windows;
   pieces.forEach((pc,i)=>pc.file=path.join(dir,'piece-'+String(i).padStart(4,'0')+'.ts'));
   const runOverlay=async(pc,r)=>{const {args,count}=overlayArgs(pc.st,pc.st.verdict,pc.file);let err='';const p=spawn(ffmpeg,args,{stdio:['pipe','ignore','pipe']});procs.add(p);
    const done=new Promise((resolve,reject)=>{p.on('error',reject);p.on('close',code=>{procs.delete(p);code===0?resolve():reject(Error(/cancel/i.test(err)?'Export cancelled.':'Video encoding failed: '+err.slice(-300)));});});p.stderr.on('data',x=>{err=(err+x).slice(-3000);});p.stdin.on('error',()=>{});
    for(let n=pc.n0;n<pc.n1;n++){check();if(encodeError)throw encodeError;const px=await drawOn(r,n);if(!p.stdin.write(px))await Promise.race([once(p.stdin,'drain'),done]);overlayDone++;directInfo.overlayFrames++;if(n%Math.max(1,Math.round(fps/2))===0)report();}
    p.stdin.end();await done;};
   // 0.15 (Phase 18, E6): a plain piece depends only on its source file and the FFmpeg command, so it is kept in
   // render-cache/ under a key made of both (file path, size and modification time included) and reused by later
   // exports: exporting again after changing a title re-renders the title, not the footage around it.
   const cacheDir=path.join(root,'render-cache'),cached=async(d,args)=>{const a=d.input[d.input.indexOf('-i')+1];const st=await fs.stat(a).catch(()=>null);if(!st||cfg.tuning?.cache===false)return null;
    return path.join(cacheDir,require('node:crypto').createHash('sha256').update(JSON.stringify({v:1,a,size:st.size,mtime:st.mtimeMs,args})).digest('hex')+'.ts');};
   const runDirect=async pc=>{const d=D.decodeArgs(optsOf(pc.st)),args=[...d.input,'-vf',d.filter+','+colourArgs[1],...colourArgs.slice(2),...videoArgs,'-frames:v',String(d.count),'-f','mpegts'],key=await cached(d,args);
    if(key&&await fs.access(key).then(()=>true,()=>false)){await fs.link(key,pc.file).catch(()=>fs.copyFile(key,pc.file));const t=new Date();await fs.utimes(key,t,t).catch(()=>{});directDone+=d.count;directInfo.frames+=d.count;directInfo.reused=(directInfo.reused||0)+d.count;return;}
    await new Promise((resolve,reject)=>{let err='',counted=0;
    const p=spawn(ffmpeg,['-y','-v','error','-stats',...args,pc.file],{stdio:['ignore','ignore','pipe']});procs.add(p);
    p.stderr.on('data',x=>{const t=String(x);err=(err+t).slice(-3000);const m=/frame=\s*(\d+)/g;let k,last=null;while((k=m.exec(t)))last=+k[1];if(last!=null){directDone+=last-counted;counted=last;}});
    p.on('error',reject);p.on('close',code=>{procs.delete(p);directDone+=d.count-counted;directInfo.frames+=d.count;code===0?resolve():reject(Error(/cancel/i.test(err)?'Export cancelled.':'Video encoding failed: '+err.slice(-300)));});});
    if(key){await fs.mkdir(cacheDir,{recursive:true}).catch(()=>{});await fs.link(pc.file,key).catch(()=>fs.copyFile(pc.file,key).catch(()=>{}));}};
   const queue=pieces.filter(pc=>pc.st&&pc.st.kind!=='overlay');let at=0;const worker=async()=>{while(at<queue.length){check();await runDirect(queue[at++]);}};
   const directAll=Promise.all([worker(),worker()]);directAll.catch(e=>{encodeError=encodeError||e;});
   const windowQueue=pieces.filter(pc=>!pc.st);let wat=0;
   const windowWorker=async r=>{while(wat<windowQueue.length){const pc=windowQueue[wat++];const enc=encoder(pc.file,'mpegts');
    for(let n=pc.n0;n<pc.n1;n++){check();if(encodeError)throw encodeError;await enc.write(await drawOn(r,n));windowDone++;if(n%Math.max(1,Math.round(fps/2))===0)report();}
    await enc.end();}};
   const second=windows>1&&windowQueue.length>1?openRenderer().catch(()=>null):null;
   const overlayQueue=pieces.filter(pc=>pc.st?.kind==='overlay');let oat=0;const overlayWorker=async r=>{while(oat<overlayQueue.length)await runOverlay(overlayQueue[oat++],r);};
   const overlayAll=overlayQueue.length?Promise.all([gfxWindow().then(overlayWorker),gfxWindows>1&&overlayQueue.length>1?openRenderer(true).then(overlayWorker,()=>null):null]):Promise.resolve();overlayAll.catch(e=>{encodeError=encodeError||e;});
   await Promise.all([windowWorker(renderer),second?second.then(r=>r&&windowWorker(r)):null,overlayAll]);
   while(true){const r=await Promise.race([directAll.then(()=>true),new Promise(r=>setTimeout(r,500,false))]);check();report();if(r)break;}
   if(encodeError)throw encodeError;
   const list=path.join(dir,'pieces.txt');await fs.writeFile(list,pieces.map(pc=>`file '${pc.file.replace(/'/g,"'\\''")}'\nduration ${((pc.n1-pc.n0)/fps).toFixed(6)}`).join('\n'));
   await run(ffmpeg,['-y','-v','error','-f','concat','-safe','0','-i',list,'-c','copy',videoFile]);
   pruneRenderCacheV18(path.join(root,'render-cache'),+(cfg.tuning?.cacheLimit||3e9)).catch(()=>{});
  }else{
   const enc=encoder(videoFile);let si=0,direct=null;
   for(let n=0;n<frames;n++){
    check();if(encodeError)throw encodeError;
    let pixels=null;const st=stretches[si];
    if(st&&n>=st.n0){if(!direct){direct=D.feed(optsOf(st));const mine=direct;const prev=stopDirect;stopDirect=()=>{prev();mine.stop();};}
     const t0=now();pixels=await direct.next();T.decode=(T.decode||0)+now()-t0;if(pixels){directInfo.frames++;directDone++;}
     if(n>=st.n1-1||!pixels){direct.stop();direct=null;si++;if(!pixels)while(stretches[si]&&stretches[si].n1<=n+1)si++;}}
    if(!pixels){pixels=await drawFrame(n);windowDone++;}
    await enc.write(pixels);
    if(n%Math.max(1,Math.round(fps/2))===0)report();
   }
   await enc.end();
  }
  const R=await renderer.webContents.executeJavaScript('window.exportTimingV15||{}').catch(()=>({}));for(const r of extraRenderers)try{if(!r.isDestroyed())r.destroy();}catch{}renderer=null;ctx.timing={frames,...T,seek:R.seek||0,wait:R.wait||0,renderMs:Math.round(now()-started),direct:directInfo};
 }
 check();
 const audio=path.join(dir,'audio.wav');
 if(!gif){
 // 0.15 (Phase 7) sound. AU-04: level balancing is one gain per source file (measured once over the whole
 // file), so the halves of a split clip match; noise reduction is per clip as before. AU-10: each clip's sound
 // is padded to its exact length, so a short audio track can't pull later clips out of sync.
 const level=!!state.audio?.level,noise=!!state.audio?.noise,gains={};
 const loudness=async a=>{if(!level||!a?.hasAudio&&a?.kind!=='audio')return 0;if(gains[a.id]!=null)return gains[a.id];let text='';await run(ffmpeg,['-hide_banner','-nostats','-i',a.path,'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-'],null,null,d=>{text=(text+d).slice(-6000);}).catch(()=>{});const m=/"input_i"\s*:\s*"(-?[\d.]+|-inf)"/.exec(text),i=m&&m[1]!=='-inf'?+m[1]:null;return gains[a.id]=i==null?0:Math.max(-12,Math.min(18,-16-i));};
 const tempo=v=>{const f=[];while(v>2){f.push('atempo=2');v/=2;}while(v<.5){f.push('atempo=0.5');v/=.5;}if(Math.abs(v-1)>1e-6)f.push('atempo='+v);return f;};
 const pieces=[];for(let i=0;i<state.clips.length;i++){check();const c=state.clips[i],a=asset(c.asset),file=path.join(dir,'audio-'+i+'.wav'),d=(c.end-c.start)/speed;let args=['-y'];if(a.hasAudio)args.push('-ss',String(c.start),'-t',String(c.end-c.start),'-i',a.path);else args.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t',String(d));const filters=[];if(a.hasAudio){filters.push(...tempo(speed));if(noise)filters.push('afftdn=nf=-25');const g=await loudness(a);if(g)filters.push('volume='+g.toFixed(2)+'dB');}filters.push('volume='+((c.muted||state.hiddenTracks?.audio)?0:Math.max(0,Math.min(3,(state.audio?.voice??100)/100*((c.volume??100)/100)))));if(!c.muted&&c.audioFadeIn>0)filters.push('afade=t=in:st=0:d='+Math.min(d,c.audioFadeIn/speed));if(!c.muted&&c.audioFadeOut>0)filters.push('afade=t=out:st='+Math.max(0,d-c.audioFadeOut/speed)+':d='+Math.min(d,c.audioFadeOut/speed));filters.push('aresample=48000','apad');args.push('-vn','-af',filters.join(','),'-ar','48000','-ac','2','-t',String(d),file);await run(ffmpeg,args);pieces.push(file);progress(90+i/state.clips.length*5,'Step 2 of 2 · Sound · clip '+(i+1)+' of '+state.clips.length);}
 const list=path.join(dir,'concat.txt');await fs.writeFile(list,pieces.map(p=>`file '${p.replace(/'/g,"'\\''")}'`).join('\n'));const joined=path.join(dir,'joined.wav');await run(ffmpeg,['-y','-f','concat','-safe','0','-i',list,'-c','copy',joined]);
 // AU-02: music and narration play at normal speed and are placed in output time, as in the preview; audio clips
 // on the timeline follow the project speed like the video. Fades are in output time.
 // AU-01: "Keep music quiet beneath voice" lowers the music only while someone speaks (a compressor keyed by the
 // clip sound and narration), instead of keeping the whole track at 45%.
 const args=['-y','-i',joined],filters=[],extra=[],voices=['[0:a]'];let idx=1,music=null;
 const tracks=[...(state.audioClips||[]).filter(t=>!t.muted&&!state.hiddenTracks?.audio).map(t=>({t,volume:t.volume??100,kind:'clip'})),...(state.music?.asset&&!state.hiddenTracks?.music?[{t:state.music,volume:state.audio?.music??20,kind:'music'}]:[]),...(state.voiceover?.asset&&!state.hiddenTracks?.audio?[{t:state.voiceover,volume:state.audio?.voice??100,kind:'voice'}]:[])];
 for(const {t:track,volume,kind} of tracks){const a=asset(track.asset),follows=kind==='clip',len=track.end!=null?(track.end-track.start)/(follows?1:speed):null;if(kind==='music')args.push('-stream_loop','-1');if(track.sourceIn!=null)args.push('-ss',String(track.sourceIn));if(len!=null)args.push('-t',String(len));args.push('-i',a.path);
  const outLen=track.end!=null?(track.end-track.start)/speed:null,f=['aresample=48000',...(follows?tempo(speed):[])];if(kind!=='music'){if(noise)f.push('afftdn=nf=-25');const g=await loudness(a);if(g)f.push('volume='+g.toFixed(2)+'dB');}
  f.push('volume='+(Math.min(kind==='music'?1.5:3,volume/100)).toFixed(3));if(track.fadeIn)f.push('afade=t=in:d='+(track.fadeIn/speed));if(track.fadeOut&&outLen!=null)f.push('afade=t=out:st='+Math.max(0,outLen-track.fadeOut/speed)+':d='+(track.fadeOut/speed));f.push('adelay='+Math.round((track.start||0)/speed*1000)+':all=1');
  filters.push(`[${idx}:a]${f.join(',')}[a${idx}]`);if(kind==='music'&&track.duck)music=`a${idx}`;else{extra.push(`[a${idx}]`);if(kind==='voice')voices.push(`[a${idx}]`);}idx++;}
 const mix=[];
 if(music){const n=voices.length,split=voices.map((v,i)=>{filters.push(`${v}asplit=2[vm${i}][vs${i}]`);return i;});filters.push(split.map(i=>`[vs${i}]`).join('')+(n>1?`amix=inputs=${n}:normalize=0,`:'')+'aformat=channel_layouts=stereo[key]');filters.push(`[${music}][key]sidechaincompress=threshold=0.025:ratio=8:attack=25:release=450:makeup=1[duck]`);mix.push(...split.map(i=>`[vm${i}]`).filter((_,i)=>i===0),'[duck]',...extra.map(x=>voices.includes(x)?`[vm${voices.indexOf(x)}]`:x));}
 else mix.push('[0:a]',...extra);
 if(mix.length>1||music){filters.push(mix.join('')+`amix=inputs=${mix.length}:duration=first:normalize=0,alimiter=limit=0.95[out]`);args.push('-filter_complex',filters.join(';'),'-map','[out]');}
 else args.push('-af','alimiter=limit=0.95');
 args.push('-t',String(duration),'-ar','48000','-ac','2',audio);await run(ffmpeg,args);
 }
 check();progress(96,'Step 2 of 2 · Saving');const output=path.join(dir,'output.'+ext);
 if(audioOnly){const codec=ext==='mp3'?['-c:a','libmp3lame','-b:a','256k']:ext==='m4a'?['-c:a','aac','-b:a','256k']:['-c:a','pcm_s16le'];await run(ffmpeg,['-y','-i',audio,...codec,output]);}
 else if(gif)await run(ffmpeg,['-y','-i',videoFile,'-filter_complex','split[a][b];[a]palettegen[p];[b][p]paletteuse','-loop','0',output]);
 else{const codec=ext==='webm'?['-c:v','copy','-c:a','libopus']:['-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart'];
  // 0.15 (Phase 19): markers become chapters (QuickTime, VLC and most players list them). A first chapter starting
  // at 0 is added when the first marker is later, since players expect chapters to cover the whole video.
  const marks=(state.markers||[]).map(m=>({t:Math.max(0,Math.min(duration,(+m.t||0)/speed)),label:String(m.label||'Chapter').replace(/[=;#\\\n]/g,' ').slice(0,80)})).filter(m=>m.t<duration-.2).sort((a,b)=>a.t-b.t);const chapterArgs=[];
  if(marks.length){if(marks[0].t>=1)marks.unshift({t:0,label:'Introduction'});const meta=path.join(dir,'chapters.txt');await fs.writeFile(meta,';FFMETADATA1\n'+marks.map((m,i)=>'[CHAPTER]\nTIMEBASE=1/1000\nSTART='+Math.round(m.t*1000)+'\nEND='+Math.round((marks[i+1]?.t??duration)*1000)+'\ntitle='+m.label+'\n').join(''));chapterArgs.push('-f','ffmetadata','-i',meta,'-map_chapters','2');}
  await run(ffmpeg,['-y','-i',videoFile,'-i',audio,...chapterArgs,'-map','0:v:0','-map','1:a:0',...codec,'-t',String(duration),output]);}
 check();await fs.copyFile(output,dest);let srt;if(cfg.captions?.startsWith('Separate')){srt=dest.replace(/\.[^.]+$/,'.srt');await ctx.validateOutput?.(srt);/* 0.15: ask before replacing a caption file that is already there */const there=await fs.access(srt).then(()=>true,()=>false);if(there&&ctx.confirmReplace&&!(await ctx.confirmReplace(srt)))srt=undefined;else await fs.writeFile(srt,subtitles(state));}progress(100,'Export complete');return {path:dest,srt,timing:ctx.timing};
 }finally{stopDirect();for(const r of extraRenderers)try{if(!r.isDestroyed())r.destroy();}catch{}renderer=null;if(encoding&&!encoding.killed)encoding.kill();await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={exportProject,subtitles,dimensions};
