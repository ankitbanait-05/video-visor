const {app,BrowserWindow,ipcMain,desktopCapturer,screen,globalShortcut,Tray,Menu,systemPreferences,shell,dialog}=require('electron');
const SETUP_HEIGHT=604; // setup panel height; 0.12 added the camera row
const fs=require('node:fs/promises'),path=require('node:path');
const {normalizeArea,cursorPoint,RecordingClock}=require('./geometry.js');
class RecorderController {
  constructor(ctx){
    this.ctx=ctx;this.panel=null;this.overlay=null;this.sources=[];this.phase='idle';this.clock=new RecordingClock();this.cursor=[];this.write=Promise.resolve();this.config={kind:'video'};this.area=null;this.tray=null;this.hotkeys=[];
    const route=(name,fn,overlay=false)=>ipcMain.handle('recorder:'+name,(event,...args)=>{
      const host=overlay?this.overlay:this.panel;
      if(!host||host.isDestroyed()||event.sender!==host.webContents||event.senderFrame!==host.webContents.mainFrame)throw Error('Invalid recorder request');
      return fn(...args);
    });
    route('state',()=>({...this.config,phase:this.phase,area:this.area,display:this.display?.bounds,elapsed:this.clock.seconds()}));
    route('sources',()=>this.listSources());
    route('area',id=>this.selectArea(id));
    route('select-area',rect=>this.resolveArea(rect),true);
    route('cancel-area',()=>this.resolveArea(null),true);
    route('prepare',config=>this.prepare(config));
    route('begin',()=>this.begin());
    route('chunk',(buffer,stream)=>this.chunk(buffer,stream));
    route('pause',paused=>{this.phase=paused?'paused':'recording';paused?this.clock.pause():this.clock.resume();return this.clock.seconds();});
    route('finish',info=>this.finish(info));
    route('screenshot',buffer=>this.screenshot(buffer));
    route('hide-for-shot',()=>{this.panel.hide();return true;});
    route('show-error',()=>{this.panel.setContentProtection(false);this.panel.setSize(680,SETUP_HEIGHT);this.show();return true;});
    route('cancel-processing',()=>{if(this.phase==='processing')this.ctx.cancel();return true;});
    // 0.15 (RC-02): Screen Recording permission, checked before recording, with a way to the right System Settings pane.
    route('screen-access',()=>process.platform!=='darwin'?'granted':systemPreferences.getMediaAccessStatus('screen'));
    route('open-privacy',()=>shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'));
    route('abort',()=>this.abort());
    route('show-controls',()=>this.show());
    route('close',()=>{if(this.busy())return false;this.panel?.close();return true;});
  }
  busy(){return ['recording','paused','processing','countdown'].includes(this.phase);}
  isCaptureClient(webContents){return webContents===this.panel?.webContents;}
  async open(options={}){
    // 0.15 (RC-05): asking for a different recorder (narration while the screen recorder is open) switches it, unless one is recording.
    if(this.panel&&!this.panel.isDestroyed()&&!this.busy()&&(options.kind||'video')!==this.config.kind){this.panel.destroy();this.panel=null;}
    if(this.panel&&!this.panel.isDestroyed()){this.show();if(!this.busy()&&typeof options.camera==='boolean')this.command(options.camera?'camera-on':'camera-off');return true;}
    this.config={kind:options.kind||'video',voiceStart:Number(options.voiceStart)||0,camera:(options.kind||'video')==='video'&&!!options.camera};this.phase='idle';this.area=null;this.areaSourceId=null;this.display=null;this.source=null;
    const b=screen.getPrimaryDisplay().workArea;
    this.panel=new BrowserWindow({width:680,height:SETUP_HEIGHT,x:b.x+Math.round((b.width-680)/2),y:b.y+Math.round((b.height-SETUP_HEIGHT)/2),frame:false,transparent:false,resizable:false,alwaysOnTop:true,title:'Video Visor — Recorder',backgroundColor:require('electron').nativeTheme.shouldUseDarkColors?'#0e1823':'#f5f8fc',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    this.panel.setAlwaysOnTop(true,'floating');
    this.panel.webContents.on('before-input-event',(event,input)=>{if(this.handleInput(input))event.preventDefault();});
    this.panel.webContents.setWindowOpenHandler(()=>({action:'deny'}));this.panel.webContents.on('will-navigate',e=>e.preventDefault());
    this.panel.on('close',e=>{if(this.busy()){e.preventDefault();this.command('stop');}});
    this.panel.on('closed',()=>{this.panel=null;this.stopControls();});
    // 0.15 (RC-06): if the recorder window crashes mid-recording, what was recorded so far is offered back.
    this.panel.webContents.on('render-process-gone',()=>{const was=this.busy();this.stopControls();this.phase='idle';this.file=null;this.cameraFile=null;try{this.panel?.destroy();}catch{}this.panel=null;if(was)this.recoverInterrupted(true).catch(()=>{});});
    await this.panel.loadURL('visor://app/recorder/panel.html');return true;
  }
  async listSources(){
    this.sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:240,height:140},fetchWindowIcons:true});
    return this.sources.filter(s=>!['Video Visor — Recorder','Choose recording area'].includes(s.name)).map(s=>({id:s.id,name:s.name,kind:s.id.startsWith('screen:')?'screen':'window',displayId:s.display_id,thumbnail:s.thumbnail.toDataURL()}));
  }
  async selectArea(id){
    if(this.busy())throw Error('Stop the recording before changing its area.');
    const source=this.sources.find(s=>s.id===id&&s.id.startsWith('screen:'));
    const display=screen.getAllDisplays().find(d=>String(d.id)===source?.display_id);
    if(!display)throw Error('Choose a display before selecting an area.');
    this.display=display;this.source=source;this.areaSourceId=id;this.area=null;this.panel.hide();
    return new Promise(async(resolve,reject)=>{
      this.areaResolve=resolve;this.areaReject=reject;
      const b=display.bounds;
      this.overlay=new BrowserWindow({x:b.x,y:b.y,width:b.width,height:b.height,frame:false,transparent:true,resizable:false,movable:false,hasShadow:false,alwaysOnTop:true,skipTaskbar:true,enableLargerThanScreen:true,title:'Choose recording area',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
      this.overlay.setAlwaysOnTop(true,'screen-saver');this.overlay.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
      this.overlay.on('closed',()=>{this.overlay=null;if(this.areaResolve){this.areaResolve(null);this.areaResolve=null;}this.show();});
      try{await this.overlay.loadURL('visor://app/recorder/area.html');this.overlay.focus();}catch(e){reject(e);this.resolveArea(null);}
    });
  }
  resolveArea(rect){
    const area=rect?normalizeArea(rect,this.display.bounds):null;this.area=area;
    const resolve=this.areaResolve;this.areaResolve=null;this.overlay?.destroy();this.overlay=null;this.show();resolve?.(area);return area;
  }
  async prepare(config){
    if(this.busy())throw Error('A recording is already running.');
    if(this.ctx.isWorking())throw Error('Wait for the current export or conversion to finish first.');
    const kind=this.config.kind,mode=['screen','window','area'].includes(config.mode)?config.mode:'screen';
    if(kind!=='voice'){
      if(process.platform==='darwin'&&!app.commandLine.hasSwitch('use-fake-device-for-media-stream')&&systemPreferences.getMediaAccessStatus('screen')!=='granted')throw Error('Video Visor needs Screen Recording access. Open System Settings → Privacy & Security → Screen & System Audio Recording, turn on Video Visor, then quit and reopen Video Visor.');
      await this.listSources();this.source=this.sources.find(s=>s.id===config.sourceId);
      if(!this.source)throw Error('The selected source is no longer available. Refresh the list and choose again.');
      if((mode==='window')!==this.source.id.startsWith('window:'))throw Error('Choose a source that matches the capture mode.');
      this.display=screen.getAllDisplays().find(d=>String(d.id)===this.source.display_id);
      if(mode==='area'){if(!this.display||!this.area||this.areaSourceId!==config.sourceId)throw Error('Select a recording area first.');this.area=normalizeArea(this.area,this.display.bounds);}else this.area=null;
    }
    const camera=kind==='video'&&!!config.camera;if(camera)await this.deviceAccess('camera');if(kind==='voice'||config.microphone)await this.deviceAccess('microphone');
    this.config={...this.config,camera,cameraId:String(config.cameraId||''),mode,microphone:kind==='voice'||!!config.microphone,microphoneId:String(config.microphoneId||''),hideControls:!!config.hideControls,countdown:!!config.countdown,systemAudio:kind==='video'&&!!config.systemAudio};
    this.phase='countdown';return {...this.config,area:this.area,display:this.display?.bounds};
  }
  // macOS asks once; after a refusal the person has to change it in System Settings.
  async deviceAccess(device){
    if(process.platform!=='darwin'||app.commandLine.hasSwitch('use-fake-device-for-media-stream'))return;
    const status=systemPreferences.getMediaAccessStatus(device);
    if(status==='granted')return;
    if(status==='not-determined'&&await systemPreferences.askForMediaAccess(device))return;
    throw Error(device==='camera'?'Video Visor cannot use the camera. Allow it in System Settings → Privacy & Security → Camera, or untick Camera to record the screen only.':'Video Visor cannot use the microphone. Allow it in System Settings → Privacy & Security → Microphone'+(this.config.kind==='voice'?'.':', or untick Microphone to record without sound.'));
  }
  displayRequest(request,callback){
    if(request.frame!==this.panel?.webContents.mainFrame||!this.source||this.phase!=='countdown')return callback(null);
    // 0.15 (RC-01): the Mac's own sound with the screen when chosen (macOS 13 or later).
    callback({video:this.source,...(this.config.systemAudio?{audio:'loopback'}:{})});
  }
  async begin(){
    const stamp=Date.now();this.file=path.join(this.ctx.root,'Recording-'+stamp+'.webm');await fs.writeFile(this.file,'',{flag:'wx'});this.cameraFile=null;this.cameraDelay=0;if(this.config.camera){this.cameraFile=path.join(this.ctx.root,'Recording-'+stamp+'-camera.webm');await fs.writeFile(this.cameraFile,'',{flag:'wx'});}this.write=Promise.resolve();this.cursor=[];this.clock.start();this.phase='recording';
    this.timer=setInterval(()=>{if(this.phase==='recording'&&this.display)this.cursor.push({t:this.clock.seconds(),...cursorPoint(screen.getCursorScreenPoint(),this.display.bounds,this.area)});},100);
    this.panel.setContentProtection(true);this.panel.setSize(440,150);
    const work=screen.getPrimaryDisplay().workArea;this.panel.setPosition(work.x+Math.round((work.width-440)/2),work.y+work.height-180);
    this.createControls();if(this.config.hideControls&&this.hotkeys.includes('CommandOrControl+Shift+2'))this.panel.hide();
    return {stopShortcut:this.hotkeys.includes('CommandOrControl+Shift+2')};
  }
  chunk(buffer,stream){
    if(!this.file||!['recording','paused','processing'].includes(this.phase))throw Error('Recording is not active.');
    const bytes=Buffer.from(buffer);if(bytes.length>32*1024*1024)throw Error('Recording chunk is too large.');
    const file=stream==='camera'?this.cameraFile:this.file;if(!file)throw Error('The camera is not being recorded.');
    this.write=this.write.then(()=>fs.appendFile(file,bytes));return this.write;
  }
  createControls(){
    for(const [key,action]of [['CommandOrControl+Shift+2','stop'],['CommandOrControl+Shift+9','pause']])if(globalShortcut.register(key,()=>this.command(action)))this.hotkeys.push(key);
    this.tray=new Tray(path.join(__dirname,'tray.png'));this.tray.setToolTip('Video Visor is recording');
    this.tray.setContextMenu(Menu.buildFromTemplate([{label:'Show recording controls',click:()=>this.show()},{label:'Pause / resume',click:()=>this.command('pause')},{label:'Stop and edit',click:()=>this.command('stop')}]));
    this.tray.on('click',()=>this.show());
  }
  handleInput(input){if(!this.busy()||input.type!=='keyDown'||!(input.meta||input.control)||!input.shift)return false;if(input.code==='Digit2'||['2','@'].includes(input.key)){this.command('stop');return true;}if(input.code==='Digit9'||['9','('].includes(input.key)){this.command('pause');return true;}return false;}
  command(name){if(this.panel&&!this.panel.isDestroyed())this.panel.webContents.send('recorder:command',name);}
  show(){if(this.panel&&!this.panel.isDestroyed()){this.panel.show();this.panel.focus();}}
  stopControls(){clearInterval(this.timer);for(const key of this.hotkeys)globalShortcut.unregister(key);this.hotkeys=[];this.tray?.destroy();this.tray=null;}
  // The camera is saved as its own video (no sound: the microphone is in the screen recording).
  // cameraDelay = seconds the camera recorder started after the screen recorder.
  async finish(info){
    if(!this.file)throw Error('No recording is available.');this.phase='processing';this.show();this.stopControls();
    if(Number.isFinite(info?.cameraDelay))this.cameraDelay=Math.max(-2,Math.min(2,info.cameraDelay));
    const output=this.file.replace(/\.webm$/,this.config.kind==='voice'?'.m4a':'.mp4');
    try{
      await this.write;
      // 0.15: the recording is already H.264 / VP9 with a keyframe every second, so it is only repackaged into MP4
      // (about 0.2 s for 20 s instead of a full re-encode). Screen and camera are saved in the same job, so another
      // task can no longer take over in between and lose the camera. A re-encode is the fallback if repackaging fails.
      const save=async(input,out,copyArgs,encodeArgs)=>{try{await this.ctx.run(this.ctx.ffmpeg,['-y','-i',input,...copyArgs,out]);}catch(e){if(/cancel/i.test(e?.message||''))throw e;await this.ctx.run(this.ctx.ffmpeg,['-y','-i',input,...encodeArgs,out]);}};
      const encode=['-c:v','libx264','-preset','veryfast','-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2','-pix_fmt','yuv420p','-movflags','+faststart'];
      const hasCamera=this.cameraFile&&(await fs.stat(this.cameraFile).catch(()=>({size:0}))).size>0;let camera=null;
      const item=await this.ctx.job(async()=>{
        if(this.config.kind==='voice')await this.ctx.run(this.ctx.ffmpeg,['-y','-i',this.file,'-vn','-c:a','aac','-b:a','192k',output]);
        else await save(this.file,output,['-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart'],[...encode,'-c:a','aac']);
        const asset=await this.ctx.register(output,this.config.kind==='voice'?[]:this.cursor);
        // A camera that failed must not lose the screen recording: it is skipped instead.
        if(hasCamera){const cameraOutput=this.cameraFile.replace(/\.webm$/,'.mp4');try{await save(this.cameraFile,cameraOutput,['-an','-c:v','copy','-movflags','+faststart'],['-an',...encode]);camera={asset:await this.ctx.register(cameraOutput),offset:-this.cameraDelay};}catch(e){if(/cancel/i.test(e?.message||''))throw e;camera=null;}}
        return asset;
      });
      if(this.cameraFile)await fs.unlink(this.cameraFile).catch(()=>{});this.cameraFile=null;
      await fs.unlink(this.file);this.file=null;this.phase='idle';this.complete(item,camera);return true;
    }catch(e){this.phase='failed';throw e;}
  }
  async screenshot(buffer){
    this.phase='processing';this.panel.setAlwaysOnTop(false);this.ctx.win.show();
    try{const output=await this.ctx.saveDialog('Video Visor screenshot.png');if(!output){this.phase='idle';this.panel.setAlwaysOnTop(true);this.show();return false;}await fs.writeFile(output,Buffer.from(buffer));const item=await this.ctx.register(output);this.phase='idle';this.complete(item);return true;}catch(e){this.phase='idle';this.panel.setAlwaysOnTop(true);this.show();throw e;}
  }
  complete(asset,camera=null){this.ctx.win.webContents.send('capture-complete',{asset,kind:this.config.kind,voiceStart:this.config.voiceStart,camera});this.panel?.destroy();this.panel=null;this.ctx.win.show();this.ctx.win.focus();}
  // 0.15 (RC-04): a recording cut off by a crash or power loss leaves its raw file behind (finished recordings delete
  // theirs). On the next launch, or right after a recorder crash, it is offered back and saved like a normal recording.
  async recoverInterrupted(crashed=false){
    const root=this.ctx.root,names=await fs.readdir(root).catch(()=>[]);
    for(const name of names.filter(n=>/^Recording-\d+\.webm$/.test(n))){
      const file=path.join(root,name);if(file===this.file)continue;const st=await fs.stat(file).catch(()=>null);if(!st)continue;
      const camera=file.replace(/\.webm$/,'-camera.webm');
      if(st.size<64*1024){await fs.unlink(file).catch(()=>{});await fs.unlink(camera).catch(()=>{});continue;}
      const when=new Date(Number(name.match(/\d+/)[0])).toLocaleString([],{dateStyle:'medium',timeStyle:'short'});
      const r=await dialog.showMessageBox(this.ctx.win,{type:'question',message:crashed?'The recorder stopped unexpectedly':'A recording was interrupted',detail:'Video Visor closed while recording ('+when+', '+Math.round(st.size/1048576)+' MB). The part recorded so far can be saved and opened in the editor.',buttons:['Save recording','Delete it','Not now'],defaultId:0,cancelId:2});
      if(r.response===2)continue;
      if(r.response===1){await fs.unlink(file).catch(()=>{});await fs.unlink(camera).catch(()=>{});continue;}
      const info=await require('../engines/probe.cjs').probe(this.ctx.ffmpeg,file).catch(()=>null),video=info?.streams?.some(x=>x.codec_type==='video');
      const output=file.replace(/\.webm$/,video?'.mp4':'.m4a'),encode=['-c:v','libx264','-preset','veryfast','-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2','-pix_fmt','yuv420p','-movflags','+faststart'];
      const save=async(input,out,a,b)=>{try{await this.ctx.run(this.ctx.ffmpeg,['-y','-i',input,...a,out]);}catch{await this.ctx.run(this.ctx.ffmpeg,['-y','-err_detect','ignore_err','-i',input,...b,out]);}};
      try{
        const result=await this.ctx.job(async()=>{
          if(video)await save(file,output,['-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart'],[...encode,'-c:a','aac']);else await save(file,output,['-vn','-c:a','aac','-b:a','192k'],['-vn','-c:a','aac']);
          const asset=await this.ctx.register(output);let cam=null;
          if(video&&(await fs.stat(camera).catch(()=>({size:0}))).size>64*1024){const out=camera.replace(/\.webm$/,'.mp4');try{await save(camera,out,['-an','-c:v','copy','-movflags','+faststart'],['-an',...encode]);cam={asset:await this.ctx.register(out),offset:0};}catch{}}
          return {asset,cam};
        });
        await fs.unlink(file).catch(()=>{});await fs.unlink(camera).catch(()=>{});
        this.ctx.win.webContents.send('capture-complete',{asset:result.asset,kind:video?'video':'voice',voiceStart:0,camera:result.cam});this.ctx.win.show();
      }catch(e){dialog.showMessageBox(this.ctx.win,{type:'error',message:'The recording could not be saved',detail:(e.message||String(e)).slice(0,300)+'\n\nThe raw file is kept in the workspace folder.'});}
    }
  }
  abort(){this.phase='idle';this.stopControls();this.show();if(this.panel){this.panel.setContentProtection(false);this.panel.setSize(680,SETUP_HEIGHT);}return true;}
  dispose(){this.phase='idle';this.stopControls();this.overlay?.destroy();this.panel?.destroy();}
}
module.exports={RecorderController};
