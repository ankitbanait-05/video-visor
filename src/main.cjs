const {app,BrowserWindow,ipcMain,dialog,protocol,net,session,screen,shell,safeStorage,nativeTheme,Menu}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url'),{randomUUID}=require('node:crypto'),{spawn}=require('node:child_process');
const ffmpeg=require('ffmpeg-static').replace('app.asar/','app.asar.unpacked/');
/* 0.15 (Phase 21): the Dev build also honours a test data folder, so benchmarks never touch the Dev workspace you use */if(process.env.VIDEO_VISOR_TEST_HOME&&(!app.isPackaged||require('../package.json').name==='video-visor-dev'))app.setPath('userData',path.resolve(process.env.VIDEO_VISOR_TEST_HOME));
protocol.registerSchemesAsPrivileged([{scheme:'visor',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
let recorderController;let connector=null,connectionFile=null;let libraryCache;let win,root,storage,registry={},currentJob=null;let projectStore,closing=false,recoveryPrompt=false;
const url=id=>'visor://media/'+id;
// 0.15: jobRef lets the render queue run its own processes in a background slot (see backgroundJob).
function run(bin,args,onData,input,onErrorData,jobRef){const J=jobRef||currentJob;return new Promise((resolve,reject)=>{if(J?.cancelled){reject(Error('Cancelled'));return;}const p=spawn(bin,args,{windowsHide:true}),chunks=[];p.stdin.on('error',()=>{});p.stdin.end(input||'');let err='';if(J)J.child=p;p.stdout.on('data',d=>{chunks.push(d);onData?.(d);});p.stderr.on('data',d=>{err=(err+d).slice(-16000);onErrorData?.(d);});p.on('error',reject);p.on('close',code=>{code===0&&!J?.cancelled?resolve(Buffer.concat(chunks)):reject(Error(J?.cancelled?'Cancelled':err||'Processing failed ('+code+')'));});});}
// 0.15: the render queue renders in its own slot, so captions, tools, Magic Edit, exports and recording keep working.
let backgroundJob=null,quitDuringRenderV15=false;
const runBg=(bin,args,onData,input,onErrorData)=>run(bin,args,onData,input,onErrorData,backgroundJob);
async function backgroundJobRun(fn){if(backgroundJob)throw Error('A render is already running.');backgroundJob={cancelled:false};try{return await fn();}finally{backgroundJob=null;}}
// 0.15: media details come from the native ffmpeg (engines/probe.cjs), not the Intel-only ffprobe.
const probeV15=require('./engines/probe.cjs');
async function probe(file){return probeV15.probe(ffmpeg,file);}
// 0.15 edit copies. Chromium seeks by decoding from the previous keyframe, so footage with keyframes
// seconds apart made every exported frame decode up to hundreds of frames (~48 ms a frame). Such footage
// gets a copy with a keyframe every second, made with Apple's hardware encoder; preview and export use it.
// Formats Chromium can't play (HEVC, ProRes, 10-bit H.264) get the same copy before they can be used.
let preparingV15=null;const pendingCopiesV15=new Map();let copyQueueV15=Promise.resolve();
function ffmpegV15(args,onErr){let child;const promise=new Promise((resolve,reject)=>{child=spawn(ffmpeg,args,{windowsHide:true});let err='';child.stdin.on('error',()=>{});child.stdin.end();child.stderr.on('data',d=>{err=(err+d).slice(-8000);onErr?.(String(d));});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(child.killedByUserV15?'Cancelled':err.split('\n').filter(Boolean).slice(-2).join(' ')||'Processing failed ('+code+')')));});return{child,promise};}
function copyArgsV15(input,output,meta,encoder,hdr){const fps=Math.max(1,Math.round(meta.fps||30)),rate=Math.round(Math.min(80e6,Math.max(6e6,(meta.width||1920)*(meta.height||1080)*fps*.12)));return ['-y','-nostdin',...(encoder==='vt'?['-hwaccel','videotoolbox']:[]),'-i',input,'-map','0:v:0','-map','0:a:0?',...(encoder==='vt'?['-c:v','h264_videotoolbox','-b:v',String(rate),'-maxrate',String(Math.round(rate*1.5)),'-bufsize',String(rate*2)]:['-c:v','libx264','-preset','veryfast','-crf','18']),'-g',String(fps),...(hdr?['-vf',probeV15.toneMap,'-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709']:[]),'-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',output];}
async function makeCopyV15(input,output,meta,{label,blocking}={}){
 const started=Date.now();const onErr=d=>{const m=/time=(\d+):(\d+):([\d.]+)/.exec(d);if(m&&label&&meta.duration){const t=+m[1]*3600+ +m[2]*60+ +m[3],pct=Math.max(0,Math.min(99,Math.round(t/meta.duration*100)));progress(pct,label+' · '+pct+'%');}};
 const hdr=probeV15.isHdr(await probeV15.probe(ffmpeg,input).catch(()=>null));
 for(const encoder of ['vt','x264']){
  const job=ffmpegV15(copyArgsV15(input,output,meta,encoder,hdr),onErr);if(blocking)preparingV15={child:job.child};
  try{await job.promise;logDiagnostic('edit-copy',{name:path.basename(input),encoder,hdr,seconds:Math.round(meta.duration),ms:Date.now()-started});return output;}
  catch(e){if(/Cancelled/.test(e.message))throw Error('Import cancelled.');logDiagnostic('edit-copy',{name:path.basename(input),encoder,failed:e.message.slice(0,300)});}
  finally{if(blocking)preparingV15=null;}
 }
 throw Error('This video could not be prepared for editing.');
}
function scheduleCopyV15(id){
 const a=registry[id];if(!a||pendingCopiesV15.has(id))return;const out=path.join(root,'edit-'+id+'.mp4');
 const task=copyQueueV15.catch(()=>{}).then(async()=>{const job=makeCopyV15(a.path,out,a);await job;if(registry[id]){registry[id].previewPath=out;registry[id].editCopy=true;await saveRegistryV15();}}).catch(e=>logDiagnostic('edit-copy',{id,failed:e.message})).finally(()=>pendingCopiesV15.delete(id));
 copyQueueV15=task;pendingCopiesV15.set(id,task);
}
// Before an export: wait for edit copies still being made for the footage it uses, so it gets the fast path.
async function waitForCopiesV15(state,report=progress){const ids=[...new Set([...(state.clips||[]).map(c=>c.asset),...(state.overlays||[]).map(o=>o.asset)])].filter(id=>pendingCopiesV15.has(id));for(const id of ids){report(0,'Preparing footage for a fast export · '+(registry[id]?.name||''));await pendingCopiesV15.get(id);}}
// 0.9: files are checked by type before FFmpeg sees them, and read errors are reported in plain language
// (the technical detail goes to diagnostics.log).
const SUPPORTED=/^\.(mp4|mov|m4v|webm|mkv|avi|mpg|mpeg|wmv|flv|3gp|mts|m2ts|ts|ogv|mp3|wav|m4a|aac|ogg|flac|aif|aiff|opus|wma|png|jpe?g|webp|gif|tiff?|avif|heic|pdf)$/;
/* 0.15 (PR-05): the media list is written to a temporary file and renamed, so a crash mid-write can't corrupt it; writes are queued. */
let registryWriteV15=Promise.resolve();function saveRegistryV15(){const text=JSON.stringify(registry),target=path.join(root,'media.json'),temp=target+'.'+randomUUID()+'.tmp';registryWriteV15=registryWriteV15.catch(()=>{}).then(async()=>{try{await fs.writeFile(temp,text);await fs.rename(temp,target);}finally{await fs.unlink(temp).catch(()=>{});}});return registryWriteV15;}
async function register(file,cursor){
 const stat=await fs.stat(file),ext=path.extname(file).toLowerCase(),id=randomUUID();
 /* 0.15: the same unchanged file registered again (music library, re-import) reuses its entry */{const same=Object.values(registry).find(a=>a.path===file&&a.size===stat.size&&!a.speedKey&&!(cursor?.length));if(same){const {path:_,previewPath:__,...item}=same;return {...item,url:url(same.id),type:same.kind+'/local'};}}
 if(!SUPPORTED.test(ext))throw Error(ext?'Video Visor cannot open '+ext+' files. Use a video, audio, image or PDF file.':'This file has no extension, so its type is unknown. Use a video, audio, image or PDF file.');
 let kind=/\.(png|jpe?g|webp|gif|tiff?|avif|heic)$/.test(ext)?'image':ext==='.pdf'?'pdf':/\.(mp3|wav|m4a|aac|ogg|flac|aif|aiff|opus|wma)$/.test(ext)?'audio':'video';let meta={duration:5,width:0,height:0,hasAudio:false},previewPath;if(!stat.size)throw Error('The selected file is empty. Choose a complete media file.');
 let needsCopyV15=false;if(kind==='video'||kind==='audio'){const p=await probe(file).catch(e=>{logDiagnostic('import',path.basename(file)+': '+e.message);throw Error(/timed out/i.test(e.message)?e.message:'This file could not be read. It may be damaged, incomplete, or in a format Video Visor does not support.');}),v=p.streams.find(x=>x.codec_type==='video'&&!x.disposition?.attached_pic);if(!v)kind='audio';const duration=Number(p.format.duration),rate=(v?.avg_frame_rate||'30/1').split('/').map(Number);if(!Number.isFinite(duration)||duration<=0)throw Error('This file has no readable media duration. Choose a complete video or audio file.');meta={duration,...require('./engines/media-preview.cjs').orientation(v),fps:rate[0]/rate[1]||30,hasAudio:p.streams.some(x=>x.codec_type==='audio')};if(v&&(!['h264','vp8','vp9','av1'].includes(v.codec_name)||v.codec_name==='h264'&&!['yuv420p','yuvj420p','nv12'].includes(v.pix_fmt)||v.color_transfer)){const label='Preparing '+path.basename(file)+' for editing';progress(0,label);previewPath=path.join(root,'preview-'+id+'.mp4');await makeCopyV15(file,previewPath,meta,{label,blocking:true});}
  else if(v){const span=Math.min(12,duration),keys=span>3?await probeV15.keyframeRate(ffmpeg,file):null;needsCopyV15=keys!=null&&keys/span<.5;}}
 if(kind==='image'){const sharp=require('sharp');if(['.tif','.tiff','.heic'].includes(ext)){previewPath=path.join(root,'preview-'+id+'.png');try{await sharp(file).rotate().png().toFile(previewPath);}catch{await run('/usr/bin/sips',['-s','format','png',file,'--out',previewPath]);}}const m=await sharp(previewPath||file).metadata();meta.width=m.autoOrient?.width||m.width;meta.height=m.autoOrient?.height||m.height;}
 registry[id]={id,path:file,previewPath,name:path.basename(file),kind,size:stat.size,...meta,cursor:cursor||[]};await saveRegistryV15();if(needsCopyV15)scheduleCopyV15(id);const {path:_,previewPath:__,...item}=registry[id];return {...item,url:url(id),type:kind+'/local'};
}
// 0.15: export tuning (debug dumps, engine switches) is for the developer benchmark only.
function devTuningV15(cfg){if(!cfg||typeof cfg!=='object')return cfg;if(process.env.VV_BENCH&&require('../package.json').name==='video-visor-dev')return cfg;const {tuning,...rest}=cfg;return rest;}
function asset(id){if(!registry[id])throw Error('Media missing. Import the original again.');return registry[id];}
async function importMany(paths){const result=[],errors=[];for(let i=0;i<paths.length;i++){const file=paths[i];progress(i/paths.length*100,'Importing '+(i+1)+' / '+paths.length+' · '+path.basename(file));try{result.push(await register(file));}catch(e){errors.push(path.basename(file)+': '+e.message);}}if(errors.length)await dialog.showMessageBox(win,{type:'warning',message:'Some files could not be imported',detail:errors.join('\n')+'\n\n'+(result.length?'The other files were imported.':'Nothing was imported.')});return result;}
async function pick(){const r=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections']});return r.canceled?[]:importMany(r.filePaths);}

function event(name,fn){ipcMain.handle(name,async(e,...args)=>{if(e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame)throw Error('Invalid caller');return fn(...args);});}
function progress(percent,label){if(!win.isDestroyed())win.webContents.send('progress',{percent,label});}
async function validateOutput(file){const real=await fs.realpath(file).catch(()=>path.resolve(file));for(const a of Object.values(registry))if(await fs.realpath(a.path).catch(()=>path.resolve(a.path))===real)throw Error('Choose a new output file. Originals are protected.');}
let exportFolder=null; // 0.10: optional default folder from Settings
async function confirmReplaceV15(file){const r=await dialog.showMessageBox(win,{type:'question',buttons:['Replace','Keep existing'],defaultId:0,cancelId:1,message:'Replace the caption file?',detail:path.basename(file)+' already exists beside your video.'});return r.response===0;}
async function saveDialog(name){const r=await dialog.showSaveDialog(win,{defaultPath:exportFolder?path.join(exportFolder,name):name});if(r.canceled)return null;await validateOutput(r.filePath);return r.filePath;}
async function job(fn){if(currentJob)throw Error('A task is already running. Cancel or wait for it.');currentJob={cancelled:false};try{return await fn();}finally{currentJob=null;}}
function logDiagnostic(kind,detail){
 if(!root)return Promise.resolve();
 return fs.appendFile(path.join(root,'diagnostics.log'),JSON.stringify({time:new Date().toISOString(),version:app.getVersion(),kind,detail})+'\n').catch(()=>{});
}
async function offerReload(message){
 if(recoveryPrompt||closing||!win||win.isDestroyed())return;
 recoveryPrompt=true;
 try{const result=await dialog.showMessageBox(win,{type:'warning',message,detail:'Reload the last saved project to continue. Any unsaved change may be lost.',buttons:['Wait','Reload saved project'],defaultId:0,cancelId:0});if(result.response===1&&!win.isDestroyed()){await projectStore.flush().catch(()=>{});win.webContents.forcefullyCrashRenderer();win.reload();}}finally{recoveryPrompt=false;}
}
// 0.15: the app's own menu. Electron's default one offered Reload and Developer Tools, which lose unsaved
// work; Dev builds keep them under View.
function zoomV16(dir){const w=BrowserWindow.getFocusedWindow()||win;if(!w||w.isDestroyed())return;w.webContents.executeJavaScript('window.previewZoomV16?window.previewZoomV16('+JSON.stringify(dir)+'):false').catch(()=>false).then(done=>{if(done)return;const wc=w.webContents;wc.setZoomLevel(dir==='fit'?0:Math.max(-3,Math.min(3,wc.getZoomLevel()+(dir==='in'?.5:-.5))));});}
function menuV15(){
 const go=js=>()=>win?.webContents.executeJavaScript(js).catch(()=>{});
 const nav=r=>go("document.querySelector('.v-nav [data-route="+r+"]')?.click()");
 const dev=require('../package.json').name==='video-visor-dev';
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:app.name,submenu:[{role:'about',label:'About Video Visor'},{type:'separator'},{label:'Settings…',accelerator:'CmdOrCtrl+,',click:nav('settings')},{type:'separator'},{role:'services'},{type:'separator'},{role:'hide',label:'Hide Video Visor'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit',label:'Quit Video Visor'}]},
  {label:'File',submenu:[{label:'New Video',accelerator:'CmdOrCtrl+N',click:go("document.querySelector('.v-nav [data-route=home]')?.click();setTimeout(()=>document.querySelector('[data-flow=start-edit]')?.click(),150)")},{label:'Record Screen…',click:nav('record')},{label:'Projects',click:nav('projects')},{type:'separator'},{role:'close'}]},
  /* 0.15 (Phase 24): Edit also copies a clip's or layer's settings and pastes them onto other clips or layers */
  {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'pasteAndMatchStyle'},{role:'delete'},{role:'selectAll'},{type:'separator'},{label:'Copy Settings',accelerator:'Alt+CmdOrCtrl+C',click:go('globalThis.visorEditor?.copySettings?.()')},{label:'Paste Settings…',accelerator:'Alt+CmdOrCtrl+V',click:go('globalThis.visorEditor?.pasteSettings?.()')}]},
  {label:'View',submenu:[/* 0.15 (Phase 16): in the editor these zoom the preview; elsewhere the window, as before */{label:'Actual Size',accelerator:'CmdOrCtrl+0',click:()=>zoomV16('fit')},{label:'Zoom In',accelerator:'CmdOrCtrl+Plus',click:()=>zoomV16('in')},{label:'Zoom In',accelerator:'CmdOrCtrl+=',visible:false,acceleratorWorksWhenHidden:true,click:()=>zoomV16('in')},{label:'Zoom Out',accelerator:'CmdOrCtrl+-',click:()=>zoomV16('out')},{type:'separator'},{role:'togglefullscreen'},...(dev?[{type:'separator'},{role:'reload'},{role:'toggleDevTools'}]:[])]},
  {role:'windowMenu'},
  {role:'help',submenu:[{label:'Keyboard Shortcuts',click:go("globalThis.visorEditor?.shortcuts?.()")}]}
 ]));
}
// 0.15 (RC-01): lets screen recordings include the Mac's own sound ('loopback' audio) on macOS 13 and later.
app.commandLine.appendSwitch('enable-features','MacLoopbackAudioForScreenShare,MacSckSystemAudioLoopbackOverride');
async function checkUpdateV15(){const pkg=require('../package.json'),feed=String(pkg.updateFeed||'');if(!/^https:\/\//.test(feed)||pkg.name==='video-visor-dev')return;const r=await net.fetch(feed,{cache:'no-store'});if(!r.ok)return;const info=await r.json(),newer=(a,b)=>{const x=String(a).split('.').map(Number),y=String(b).split('.').map(Number);for(let i=0;i<3;i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0);}return false;};if(info?.version&&/^https:\/\//.test(info.url||'')&&newer(info.version,pkg.version))win?.webContents.send('update-available',{version:String(info.version).slice(0,20),url:info.url,notes:String(info.notes||'').slice(0,300)});}
event('openUpdate',async url=>{if(/^https:\/\//.test(String(url)))await shell.openExternal(url);return true;});
app.whenReady().then(async()=>{menuV15();
 root=path.join(app.getPath('userData'),'workspace-v2');await fs.mkdir(root,{recursive:true});storage=path.join(root,'projects.json');projectStore=require('./engines/project-store.cjs').createProjectStore(storage);try{registry=JSON.parse(await fs.readFile(path.join(root,'media.json'),'utf8'));}catch{}
 protocol.handle('visor',async req=>{const u=new URL(req.url);let file;if(u.host==='media')file=registry[u.pathname.slice(1)]?.previewPath||registry[u.pathname.slice(1)]?.path;else if(u.host==='app'){const rel=decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname);file=path.resolve(__dirname,'.'+rel);if(!file.startsWith(__dirname+path.sep))file=null;}if(!file)return new Response('Not found',{status:404});if(u.host==='media')return require('./engines/file-response.cjs').fileResponse(file,req);const response=await net.fetch(pathToFileURL(file).href,{headers:req.headers});if(u.host==='app'){const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');return new Response(response.body,{status:response.status,headers});}return response;});
 session.defaultSession.setPermissionRequestHandler((wc,permission,cb)=>cb(!!recorderController?.isCaptureClient(wc)&&['media','display-capture'].includes(permission)));/* 0.15 (DS-07): only the recorder window uses the camera, microphone and screen */
 session.defaultSession.setDisplayMediaRequestHandler((request,cb)=>recorderController?recorderController.displayRequest(request,cb):cb(null));
 win=new BrowserWindow({width:1360,height:900,minWidth:900,minHeight:650,title:'Video Visor',backgroundColor:'#f5f8fc',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});win.webContents.on('console-message',(details,...args)=>{if(details.level==='error'||args[0]>=2){console.error(details.message||args[1]);logDiagnostic('console',details.message||args[1]);}});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 win.webContents.on('render-process-gone',(_event,details)=>{logDiagnostic('renderer exited',details);offerReload('The editor stopped unexpectedly.');});
 win.on('unresponsive',()=>{logDiagnostic('unresponsive','Editor stopped responding');offerReload('The editor is not responding.');});
 event('load',()=>projectStore.load());
 event('workspaceRecovery',()=>projectStore.recovery());
 event('workspaceInfo',()=>projectStore.info());
 event('workspaceRestore',mode=>projectStore.restore(mode==='backup'?'backup':'fresh'));
 event('diagnostic',detail=>logDiagnostic('renderer',String(detail).slice(0,2000)));
 event('save',data=>projectStore.save(data));
 event('library',async()=>{if(libraryCache)return libraryCache;const catalog=JSON.parse(await fs.readFile(path.join(__dirname,'music/catalog.json'),'utf8'));libraryCache=[];for(const item of catalog){const a=await register(path.join(__dirname,'music',item.file).replace('app.asar/','app.asar.unpacked/'));libraryCache.push({...a,name:item.name,mood:item.mood,bpm:item.bpm});}return libraryCache;});event('relink',async(id,requiredEnd=0)=>{const previous=asset(id);const r=await dialog.showOpenDialog(win,{title:'Locate the original media file',properties:['openFile']});if(r.canceled)return null;const item=await register(r.filePaths[0]);const next=registry[item.id];if(next.kind!==previous.kind)throw Error('Choose the same type of media as the original.');if(next.kind!=='image'&&next.duration+0.01<Number(requiredEnd))throw Error('This replacement is shorter than the edited clip ranges. Choose the original or a longer file.');delete registry[item.id];registry[id]={...next,id};await saveRegistryV15();return {...item,id,url:url(id)};});/* 0.15 (PR-04): storage. The workspace only ever grew: preview and edit copies, thumbnails, sound previews and temporary
   files stayed forever, and recordings stayed after their project was deleted. `used` is every asset id that any project
   (or the open editor) refers to. Copies and caches can always be made again; app-made media (recordings, speed copies)
   is only removed when no project uses it and the person chose to. */
async function storageScanV15(used,only){
 used=new Set([].concat(used||[]));const onlySet=only?new Set([].concat(only)):null;const out={cache:[],media:[],total:0};
 const size=async p=>{const st=await fs.stat(p).catch(()=>null);if(!st)return 0;if(!st.isDirectory())return st.size;let n=0;for(const f of await fs.readdir(p).catch(()=>[]))n+=await size(path.join(p,f));return n;};
 const owner={};for(const [id,a] of Object.entries(registry)){for(const p of [a.previewPath,a.path])if(p&&path.dirname(p)===root)owner[path.basename(p)]={id,copy:p===a.previewPath&&p!==a.path};}
 for(const name of await fs.readdir(root).catch(()=>[])){
  if(['projects.json','projects-backup.json','media.json','diagnostics.log'].includes(name)||/^projects-(before-recovery|damaged)/.test(name))continue;
  const full=path.join(root,name),bytes=await size(full);out.total+=bytes;const o=owner[name],id=o?.id;
  if(onlySet){if(id&&onlySet.has(id)&&!used.has(id))out[o.copy?'cache':'media'].push({file:full,bytes,id});continue;}
  if(/^(visual-|audio-previews|render-|sample-|bench$)|\.tmp$|^(speech\.wav|transcript\.json)$/.test(name)){out.cache.push({file:full,bytes});continue;}
  if(/^(preview|edit)-/.test(name)){if(!id||!used.has(id))out.cache.push({file:full,bytes,id});continue;}
  if(/^(Recording-|speed-)/.test(name)&&!/\.webm$/.test(name)){if(!id||!used.has(id))out.media.push({file:full,bytes,id});}
 }
 return out;
}
event('storageInfo',async used=>{const s=await storageScanV15(used);const sum=l=>l.reduce((n,x)=>n+x.bytes,0);return {total:s.total,cache:sum(s.cache),media:sum(s.media),mediaCount:s.media.length};});
event('storageClean',async(used,opts={})=>{
 if(currentJob||backgroundJob||pendingCopiesV15.size)throw Error('Wait for the current task to finish, then try again.');
 const s=await storageScanV15(used,opts.only),list=[...s.cache,...(opts.media?s.media:[])];let freed=0;
 for(const x of list){await fs.rm(x.file,{recursive:true,force:true}).then(()=>{freed+=x.bytes;},()=>{});const a=x.id&&registry[x.id];if(a){if(a.previewPath===x.file){delete a.previewPath;delete a.editCopy;}if(a.path===x.file)delete registry[x.id];}}
 await saveRegistryV15();return {freed};
});
/* 0.15 (PR-01) */event('mediaStatus',async ids=>{const out={};for(const id of [].concat(ids||[]).slice(0,500)){const a=registry[id];out[id]=!a?'unknown':await fs.access(a.path).then(()=>'ok',()=>'missing');}return out;});event('pick',pick);event('importPaths',async paths=>importMany(paths));
 const visuals=require('./engines/media-preview.cjs').createCache(root,ffmpeg);event('mediaVisuals',(id,range)=>{const a=asset(id);if(!range)return visuals(a);const start=Math.max(0,Math.min(a.duration-.01,Number(range.start)||0)),end=Math.max(start+.01,Math.min(a.duration,Number(range.end)||a.duration));return visuals({...a,id:a.id+'-'+start.toFixed(3)+'-'+end.toFixed(3),offset:start,duration:end-start});});
 event('readScript',async()=>{const r=await dialog.showOpenDialog(win,{filters:[{name:'Script',extensions:['txt','md']}],properties:['openFile']});if(r.canceled)return null;if((await fs.stat(r.filePaths[0])).size>200000)throw Error('Choose a script smaller than 200 KB.');return fs.readFile(r.filePaths[0],'utf8');});
 event('readText',async()=>{const r=await dialog.showOpenDialog(win,{filters:[{name:'Caption file',extensions:['srt','vtt']}],properties:['openFile']});return r.canceled?null:fs.readFile(r.filePaths[0],'utf8');});
 event('cancel',()=>{if(currentJob){currentJob.cancelled=true;currentJob.child?.kill('SIGTERM');}if(preparingV15?.child){preparingV15.child.killedByUserV15=true;preparingV15.child.kill('SIGTERM');}return true;});
 event('prepareAudioPreview',async state=>job(async()=>{
  const hash=require('node:crypto').createHash('sha256').update(require('./engines/audio-preview-v8.js').key(state)).digest('hex');
  const dir=path.join(root,'audio-previews');await fs.mkdir(dir,{recursive:true});const output=path.join(dir,hash+'.wav');
  if(!await fs.stat(output).then(s=>s.size>44).catch(()=>false))await require('./engines/export.cjs').exportProject({state,cfg:{format:'Audio only',audio:'WAV'},asset,run,ffmpeg,root,saveDialog:async()=>output,progress:(percent,label)=>progress(percent,label==='Export complete'?'Audio preview ready':label),cancelled:()=>currentJob.cancelled,BrowserWindow});
  const existing=Object.values(registry).find(a=>a.path===output);return existing?{id:existing.id,url:url(existing.id),duration:existing.duration}:register(output);
 }));
 // 0.9: the export dialog can reveal or play the finished file. Only files exported in this session are allowed.
 const exported=new Set();
 event('export',async(state,cfg)=>job(async()=>{cfg=devTuningV15(cfg);await waitForCopiesV15(state);const result=await require('./engines/export.cjs').exportProject({state,cfg,asset,run,ffmpeg,root,saveDialog,validateOutput,confirmReplace:confirmReplaceV15,progress,cancelled:()=>currentJob.cancelled,BrowserWindow,appPath:__dirname});logExportV15(result,cfg,state);if(result?.path)exported.add(result.path);return result;}));
 event('previewMute',muted=>{win.webContents.setAudioMuted(!!muted);return !!muted;}); // 0.10: mute button under the preview
 // 0.13 render queue: these renders are saved straight into the export folder, with no dialog.
 const queueFolder=()=>exportFolder||(process.env.VIDEO_VISOR_TEST_HOME&&!app.isPackaged?path.join(app.getPath('userData'),'exports'):path.join(app.getPath('videos'),'Video Visor'));
 // 0.15: every export records its speed in diagnostics.log (frames, ms per frame by step, real-time factor).
 const logExportV15=(r,cfg,state)=>{const t=r?.timing;if(!t?.frames)return;const f=t.frames,sec=f/(Math.min(60,Math.max(12,+cfg.fps||30)));logDiagnostic('export-timing',{format:cfg.format,resolution:cfg.resolution,clips:state.clips?.length,seconds:Math.round(sec),renderMs:t.renderMs,realtime:t.renderMs?+(sec*1000/t.renderMs).toFixed(2):null,perFrameMs:{seek:+(t.seek/f).toFixed(1),wait:+(t.wait/f).toFixed(1),draw:+(t.draw/f).toFixed(1),capture:+(t.capture/f).toFixed(1),convert:+(t.convert/f).toFixed(1),pipe:+(t.pipe/f).toFixed(1)}});};
 const progressQueue=(percent,label)=>{if(!win.isDestroyed())win.webContents.send('progress',{percent,label,source:'queue'});};
 const runExport=async(state,cfg,destination,opts={})=>{const bg=!!opts.background,report=bg?progressQueue:progress;await waitForCopiesV15(state,report);return require('./engines/export.cjs').exportProject({state,cfg,asset,run:bg?runBg:run,ffmpeg,root,saveDialog,validateOutput,destination,progress:report,cancelled:()=>(bg?backgroundJob:currentJob).cancelled,BrowserWindow,appPath:__dirname});};
 event('exportQueued',async(state,cfg,name)=>backgroundJobRun(async()=>{cfg=devTuningV15(cfg);
  if(!['MP4','MOV'].includes(cfg?.format))throw Error('The render queue makes MP4 or MOV files.');
  const folder=queueFolder();await fs.mkdir(folder,{recursive:true});
  const base=String(name||'').replace(/[\/\\:*?"<>|\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,80)||'Video Visor export';
  // Never replaces a file: "Name.mp4", then "Name 2.mp4", and so on.
  const result=await runExport(state,cfg,async ext=>{for(let i=1;;i++){const file=path.join(folder,base+(i>1?' '+i:'')+'.'+ext);if(!(await fs.access(file).then(()=>true,()=>false))){await validateOutput(file);return file;}}},{background:true});
  logExportV15(result,cfg,state);if(result?.path)exported.add(result.path);return result;
 }));
 event('setTheme',async mode=>{nativeTheme.themeSource=['light','dark'].includes(mode)?mode:'system';win?.setBackgroundColor(nativeTheme.shouldUseDarkColors?'#121418':'#f5f8fc');return true;});
 event('cancelQueued',()=>{if(backgroundJob){backgroundJob.cancelled=true;backgroundJob.child?.kill('SIGTERM');}return true;});
 // 0.13 connector: lets an AI assistant on this Mac use the app. Off until switched on in Settings.
 connectionFile=path.join(app.getPath('userData'),'connector.json');
 const connectorHost=require('./connector/host.cjs'),connectorLog=message=>logDiagnostic('connector',message);
 const commandHost=connectorHost.createHost({window:()=>win,root,register,job,exportProject:runExport,log:connectorLog});
 connector=require('./connector/server.cjs').createConnector({file:path.join(app.getPath('userData'),'connector-settings.json'),connectionFile,version:require('../package.json').version,execute:(...args)=>commandHost.execute(...args),log:connectorLog});
 await connector.load().catch(e=>connectorLog(e.message));
 const bridgeFile=path.join(__dirname,'connector','bridge.cjs').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep);
 const claudeConfigFile=()=>(!app.isPackaged&&process.env.VIDEO_VISOR_CLAUDE_CONFIG)||path.join(app.getPath('appData'),'Claude','claude_desktop_config.json');
 const connectorSetup=async()=>{const entry=connectorHost.claudeEntry({execPath:process.execPath,bridge:bridgeFile,connectionFile});return{entry,config:JSON.stringify({mcpServers:{'video-visor':entry}},null,2),configFile:claudeConfigFile(),claudeFound:await fs.access(path.dirname(claudeConfigFile())).then(()=>true,()=>false)};};
 const connectorState=async()=>({...connector.state(),setup:await connectorSetup(),exportFolder:queueFolder()});
 event('connectorState',connectorState);
 event('connectorUpdate',async(change={})=>{const next={};if(typeof change.enabled==='boolean')next.enabled=change.enabled;if(change.permissions&&typeof change.permissions==='object')next.permissions=change.permissions;if(change.newToken===true)next.newToken=true;await connector.update(next);return connectorState();});
 // Folders are only ever granted through the system folder picker.
 event('connectorAddFolder',async()=>{const r=await dialog.showOpenDialog(win,{title:'Choose a folder the assistant may import from',buttonLabel:'Allow this folder',properties:['openDirectory']});if(r.canceled||!r.filePaths[0])return null;await connector.update({folders:[...connector.folders(),r.filePaths[0]]});return connectorState();});
 event('connectorRemoveFolder',async folder=>{await connector.update({folders:connector.folders().filter(f=>f!==folder)});return connectorState();});
 event('connectorInstallClaude',async()=>connectorHost.installClaude(claudeConfigFile(),(await connectorSetup()).entry));
 // 0.14 Draft with AI: the person's own API key, kept in the macOS keychain; the window never receives it.
 for(const service of ['anthropic','openai'])try{require('./ai/'+service+'.cjs');}catch(e){if(e.code!=='MODULE_NOT_FOUND')logDiagnostic('ai',service+': '+e.message);}
 const aiHost=require('./ai/host.cjs').createAiHost({keys:require('./ai/keys.cjs').createKeyStore({file:path.join(app.getPath('userData'),'ai-keys.json'),safeStorage}),settingsFile:path.join(app.getPath('userData'),'ai-settings.json'),editor:commandHost.editor,execute:commandHost.execute,register,dialog,window:()=>win,log:message=>logDiagnostic('ai',message)});
 await aiHost.load().catch(e=>logDiagnostic('ai',e.message));
 event('aiState',()=>aiHost.state());event('aiChoose',id=>aiHost.choose(id));event('aiSetModel',(id,model)=>aiHost.setModel(id,model));
 event('aiSaveKey',(id,key,remember)=>aiHost.saveKey(id,key,remember));event('aiClearKey',id=>aiHost.clearKey(id));event('aiModels',id=>aiHost.models(id));
 event('aiPick',()=>aiHost.pick());event('aiPrepare',request=>aiHost.prepare(request));event('aiDiscard',id=>aiHost.discard(id));event('aiRun',id=>aiHost.run(id));event('aiCancel',()=>aiHost.cancel());
 // Files exported in this session, or listed under "Exports & conversions" in the saved workspace, may be opened or revealed.
 const knownExport=async file=>{if(typeof file!=='string'||!path.isAbsolute(file))throw Error('Unknown file.');if(!exported.has(file)){const saved=await projectStore.load().catch(()=>null);if(!(saved?.privateContent?.app?.jobs||[]).some(j=>j?.detail===file))throw Error('That file is not one of your exports.');}/* 0.15: only media and documents open from the Jobs list (a saved job could otherwise name an app or a script) */if(!/\.(mp4|mov|m4v|webm|gif|mp3|wav|m4a|aac|png|jpe?g|webp|heic|tiff?|pdf|srt|vtt|txt|md|zip)$/i.test(file))throw Error('That file is not one of your exports.');await fs.access(file).catch(()=>{throw Error('That file has been moved or deleted.');});return file;};
 event('reveal',async file=>{shell.showItemInFolder(await knownExport(file));return true;});
 event('openFile',async file=>{const problem=await shell.openPath(await knownExport(file));if(problem)throw Error(problem);return true;});
 event('chooseFolder',async()=>{const r=await dialog.showOpenDialog(win,{title:'Choose a folder for exports',properties:['openDirectory','createDirectory']});if(r.canceled||!r.filePaths[0])return null;exportFolder=r.filePaths[0];return exportFolder;});
 event('setExportFolder',async folder=>{if(!folder){exportFolder=null;return null;}if(typeof folder!=='string'||!path.isAbsolute(folder)||!(await fs.stat(folder).then(s=>s.isDirectory()).catch(()=>false)))throw Error('That folder is not available.');exportFolder=folder;return folder;});
 event('revealWorkspace',async()=>{const problem=await shell.openPath(root);if(problem)throw Error(problem);return true;});
 event('tool',async(id,ids,opts)=>job(async()=>{const result=await require('./engines/tools.cjs').processTool({id,assets:ids.map(asset),opts,run,ffmpeg,root,saveDialog,progress,dialog,win,validateOutput,log:logDiagnostic,cancelled:()=>currentJob.cancelled,nativeBin:app.isPackaged?path.join(process.resourcesPath,'native-bin/visor-utilities'):path.join(__dirname,'../native-bin/visor-utilities')});if(result?.paths){result.assets=[];for(const p of result.paths){/* 0.15 (Phase 15): images and PDFs too, so the result shows a thumbnail */if(/\.(mp4|mov|webm|gif|mp3|wav|m4a|png|jpe?g|webp|tiff?|avif|pdf)$/i.test(p))result.assets.push(await register(p).catch(()=>null));}result.assets=result.assets.filter(Boolean);}return result;}));
 /* 0.15 (Phase 15): the first page of a PDF, for its card on a tool page (Quick Look draws it). */
 event('fileThumb',async id=>{const a=asset(id);if(a.kind!=='pdf')return null;const dir=await fs.mkdtemp(path.join(root,'thumb-'));try{await run('/usr/bin/qlmanage',['-t','-s','240','-o',dir,a.path]);const f=(await fs.readdir(dir)).find(x=>x.endsWith('.png'));return f?'data:image/png;base64,'+(await fs.readFile(path.join(dir,f))).toString('base64'):null;}catch{return null;}finally{await fs.rm(dir,{recursive:true,force:true});}});
 event('toolPreview',async(id,assetId,opts={})=>job(async()=>{if(!['gif','vcompress'].includes(id))throw Error('This tool has no processed preview.');const a=asset(assetId),start=Math.max(0,Math.min(a.duration-.05,+opts['v-start']||0)),duration=Math.min(5,a.duration-start,Math.max(.05,(+opts['v-end']||a.duration)-start));const dir=await fs.mkdtemp(path.join(root,'sample-')),input=path.join(dir,'input.mp4');await run(ffmpeg,['-y','-ss',String(start),'-i',a.path,'-t',String(duration),'-c:v','libx264','-preset','ultrafast','-crf','16','-c:a','aac',input]);const result=await require('./engines/tools.cjs').processTool({id,assets:[{...a,path:input,duration}],opts:{...opts,'v-start':0,'v-end':duration},run,ffmpeg,root,saveDialog:async name=>path.join(dir,path.basename(name)),progress,cancelled:()=>currentJob.cancelled});return register(result.paths[0]);}));
 event('transcribe',async(id,options={})=>job(async()=>{const a=asset(id),wave=path.join(root,'speech.wav');progress(0,'Preparing speech');await run(ffmpeg,['-y','-i',a.path,'-vn','-ar','16000','-ac','1',wave]);const bin=app.isPackaged?path.join(process.resourcesPath,'speech','whisper-cli'):path.join(__dirname,'../speech/whisper-cli');const model=path.join(path.dirname(bin),'ggml-small-q5_1.bin');await fs.access(bin).catch(()=>{throw Error('Local speech engine is not installed in this build. Please reinstall the complete app with its speech model.');});progress(20,'Transcribing on this device');const speechProgress=d=>{for(const m of String(d).matchAll(/progress\s*=\s*(\d+)/g))progress(20+Number(m[1])*.79,'Transcribing '+a.name+' · '+m[1]+'%');};await run(bin,['-m',model,'-f',wave,'-ojf','-pp','-t','4','-of',path.join(root,'transcript'),'-l',(['en','hi'].includes(options.language)?options.language:'auto'),'-ml','45','-sow'],speechProgress,null,speechProgress);const data=JSON.parse(await fs.readFile(path.join(root,'transcript.json'),'utf8'));const lines=require('./engines/transcript.cjs').parseTranscript(data,id,a.duration);return options.script==='roman'?require('./engines/roman-hindi.cjs').linesToRoman(lines):lines;}));
 event('track',async(id,opts)=>job(async()=>{const a=asset(id);if(a.kind!=='video'||!opts||!['start','end','x','y','width','height'].every(k=>Number.isFinite(opts[k]))||opts.start<0||opts.end>a.duration||opts.end<=opts.start||opts.end-opts.start>600||opts.x<0||opts.y<0||opts.width<=0||opts.height<=0||opts.x+opts.width>1.001||opts.y+opts.height>1.001)throw Error('Choose a valid video area and a range up to 10 minutes.');progress(10,'Tracking the selected region locally');const bin=app.isPackaged?path.join(process.resourcesPath,'native-bin/visor-utilities'):path.join(__dirname,'../native-bin/visor-utilities');return JSON.parse(await run(bin,['track',a.previewPath||a.path],null,JSON.stringify(opts)));}));
 // 0.15 clip speed: renders the clip's source range at the chosen speed into a new copy (the original is kept).
 event('speedClip',async(assetId,start,end,preset)=>job(async()=>{
  const S=require('./engines/speed-v15.js'),a=asset(assetId);if(a.kind!=='video')throw Error('Speed can be changed for video clips.');
  start=Math.max(0,+start||0);end=Math.min(a.duration,+end||a.duration);const D=end-start;if(!(D>.1))throw Error('This clip is too short to change its speed.');
  if(!preset||(preset.kind==='constant'&&!(preset.value>=.25&&preset.value<=4))||(preset.kind==='curve'&&!S.CURVES[preset.name]))throw Error('Choose a speed.');
  // 0.15 (Phase 13): the same source range at the same speed reuses the copy made before (2× → 4× → 2× renders twice, not three times).
  const speedKey=[assetId,start.toFixed(3),end.toFixed(3),JSON.stringify(preset)].join('|'),made=Object.values(registry).find(r=>r.speedKey===speedKey);
  if(made&&await fs.access(made.path).then(()=>true,()=>false)){const {path:_,previewPath:__,...item}=made;return {...item,url:url(made.id),type:made.kind+'/local'};}
  const {video,audio}=S.filters(preset,D,a.fps),total=S.outputDuration(preset,D),out=path.join(root,'speed-'+randomUUID()+'.mp4'),label='Changing speed · '+S.label(preset);
  const fps=Math.max(1,Math.round(a.fps||30)),rate=Math.round(Math.min(80e6,Math.max(6e6,(a.width||1920)*(a.height||1080)*fps*.12)));
  const onErr=d=>{const m=/time=(\d+):(\d+):([\d.]+)/.exec(String(d));if(m){const pct=Math.max(0,Math.min(99,Math.round((+m[1]*3600+ +m[2]*60+ +m[3])/total*100)));progress(pct,label+' · '+pct+'%');}};
  progress(0,label);const sound=audio&&a.hasAudio?['-map','0:a:0?','-af',audio,'-c:a','aac','-b:a','192k']:['-an'];
  const base=['-y','-nostdin','-ss',String(start),'-t',String(D),'-i',a.path,'-map','0:v:0',...sound,'-vf',video];
  try{await run(ffmpeg,[...base,'-c:v','h264_videotoolbox','-b:v',String(rate),'-g',String(fps),'-pix_fmt','yuv420p','-movflags','+faststart',out],null,null,onErr);}
  catch(e){if(/cancel/i.test(e.message))throw e;await run(ffmpeg,[...base,'-c:v','libx264','-preset','veryfast','-crf','18','-g',String(fps),'-pix_fmt','yuv420p','-movflags','+faststart',out],null,null,onErr);}
  const item=await register(out);registry[item.id].speedKey=speedKey;registry[item.id].speedOf=assetId;item.speedOf=assetId;await saveRegistryV15();return item;
 }));
 event('silences',async id=>job(async()=>{const a=asset(id);let err='';await new Promise((resolve,reject)=>{const p=spawn(ffmpeg,['-i',a.path,'-af','silencedetect=noise=-35dB:d=0.7','-f','null','-']);currentJob.child=p;p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',c=>c===0?resolve():reject(Error('Silence analysis failed')));});const starts=[...err.matchAll(/silence_start: ([\d.]+)/g)].map(x=>+x[1]),ends=[...err.matchAll(/silence_end: ([\d.]+)/g)].map(x=>+x[1]);return starts.map((start,i)=>({start:start+.15,end:(ends[i]||a.duration)-.15})).filter(x=>x.end>x.start);}));
 recorderController=new(require('./recorder/controller.cjs').RecorderController)({win,root,register,run,ffmpeg,job,saveDialog,cancel:()=>{if(currentJob){currentJob.cancelled=true;currentJob.child?.kill('SIGTERM');}},isWorking:()=>!!currentJob});
 event('recorder-open',options=>recorderController.open(options));
 win.webContents.on('before-input-event',(event,input)=>{if(recorderController.handleInput(input))event.preventDefault();});
 win.on('close',e=>{if(recorderController.busy()){e.preventDefault();recorderController.show();return;}
  // 0.15 (RC-06): an idle recorder window closes with the main window instead of being left behind.
  if(!recorderController.busy())try{recorderController.panel?.destroy();}catch{}
  // 0.15: quitting during a background render asks first.
  if(backgroundJob&&!quitDuringRenderV15){e.preventDefault();dialog.showMessageBox(win,{type:'warning',message:'A render is still running',detail:'Quitting stops it, and renders waiting in the queue are not kept.',buttons:['Keep rendering','Quit anyway'],defaultId:0,cancelId:0}).then(r=>{if(r.response===1&&!win.isDestroyed()){quitDuringRenderV15=true;if(backgroundJob){backgroundJob.cancelled=true;backgroundJob.child?.kill('SIGTERM');}win.close();}});return;}if(!closing){e.preventDefault();closing=true;
  // 0.15: the editor saves 400 ms after the last change; ask it to save now so nothing is lost on quit.
  win.webContents.executeJavaScript('window.flushSaveV15?.()').catch(()=>{}).then(()=>projectStore.flush()).then(()=>win.close()).catch(err=>{closing=false;logDiagnostic('save',err.message);dialog.showMessageBox(win,{type:'error',message:'Your last change could not be saved',detail:err.message});});}});
 
 await win.loadURL('visor://app/');
 // 0.15 (DS-01): update check. package.json "updateFeed" is an https URL of a small JSON file
 // ({"version":"0.16.0","url":"https://…/Video Visor.dmg","notes":"…"}) kept on a shared drive or intranet; when it lists a
 // newer version, the app offers the download. Empty means no check (as in development builds).
 setTimeout(()=>checkUpdateV15().catch(e=>logDiagnostic('update-check',e.message)),15000);
 setTimeout(()=>recorderController.recoverInterrupted().catch(e=>logDiagnostic('recorder-recovery',e.message)),2500);
 // 0.15 developer benchmark: Dev builds only, and only when VV_BENCH is set (see bench.cjs).
 if(process.env.VV_BENCH&&require('../package.json').name==='video-visor-dev'){require('./bench.cjs').run({register,runExport,job,backgroundJobRun,run,ffmpeg,root,win,registryEntry:id=>registry[id],recorder:()=>recorderController}).catch(e=>process.stdout.write(JSON.stringify({bench:'error',message:e.stack||e.message})+'\n')).finally(()=>app.exit(0));}
}).catch(error=>{logDiagnostic('startup',error.stack||error.message);dialog.showErrorBox('Video Visor could not start',error.message+'\nYour saved workspace has been kept.');app.quit();});
app.on('window-all-closed',()=>{try{if(connectionFile)require('node:fs').unlinkSync(connectionFile);}catch{}connector?.stop().catch(()=>{});recorderController?.dispose();currentJob?.child?.kill('SIGTERM');app.quit();});
