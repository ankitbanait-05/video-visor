(async()=>{
const $=s=>document.querySelector(s),icons=()=>lucide.createIcons();icons();
const escape=s=>{const span=document.createElement('span');span.textContent=String(s);return span.innerHTML.replace(/"/g,'&quot;');};
let initial=await capture.state(),mode='screen',sources=[],sourceId='',area=null,recorder,cameraRecorder=null,cameraStopped=null,cameraStream=null,cameraPreviewId=null,started={},streams=[],recordedStream,video,drawTimer,timer,audioContext,analyser,write=Promise.resolve(),cancelCountdown=false,stopping=false,systemAudioMissing=false,clock=new recordingGeometry.RecordingClock();
function showError(error){capture['show-error']().catch(()=>{});$('#error').textContent=error.message||String(error);$('#error').hidden=false;}
function controls(){$('#start').disabled=(mode==='area'&&!area)||(initial.kind!=='voice'&&!sourceId);$('#area-row').hidden=mode!=='area';$('#source-heading').textContent=mode==='window'?'Choose a window':'Choose a display';document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-selected',b.dataset.mode===mode));$('#area-label').textContent=area?area.width+' × '+area.height+' points · ready to record':'Drag a frame around the area to record.';$('#choose-area').innerHTML='<i data-lucide="scan"></i>'+(area?'Adjust area':'Select area');icons();}
function renderSources(){const filtered=sources.filter(s=>s.kind===(mode==='window'?'window':'screen'));if(!filtered.some(s=>s.id===sourceId)){sourceId=filtered[0]?.id||'';area=null;}
$('#sources').innerHTML=filtered.map(s=>'<button class="source" data-source="'+escape(s.id)+'" aria-pressed="'+(s.id===sourceId)+'"><img alt="" src="'+s.thumbnail+'"><span>'+escape(s.name)+'</span></button>').join('')||'<p>No sources found. Check Screen Recording access in macOS Privacy & Security, then refresh.</p>';
$('#sources').querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{sourceId=b.dataset.source;area=null;renderSources();controls();});controls();}
async function refresh(){try{$('#start').disabled=true;$('#sources').textContent='Loading capture sources…';sources=await capture.sources();renderSources();}catch(e){showError(e);$('#sources').textContent='Capture sources could not be loaded.';}await accessCheck();}
// 0.15 (RC-02): say plainly when Screen Recording access is missing, before anyone presses Record.
async function accessCheck(){if(initial.kind==='voice')return;let status='granted';try{status=await capture['screen-access']();}catch{}let box=$('#access');if(status==='granted'){box?.remove();return;}if(!box){box=document.createElement('div');box.id='access';box.className='access';$('main').prepend(box);}box.innerHTML='<strong>Video Visor needs Screen Recording access</strong><p>In System Settings → Privacy & Security → Screen & System Audio Recording, turn on Video Visor. Then quit and reopen Video Visor.</p><div class="access-actions"><button id="open-privacy" type="button">Open System Settings</button><button id="recheck" type="button" class="quiet">Check again</button></div>';$('#open-privacy').onclick=()=>capture['open-privacy']();$('#recheck').onclick=()=>refresh();$('#start').disabled=true;}
// A device that never answers (a permission prompt left open, a camera held by another app) must not leave the recorder waiting forever.
const device=(request,name)=>Promise.race([request,new Promise((_,reject)=>setTimeout(()=>reject(Error('The '+name+' did not respond. Check System Settings → Privacy & Security → '+(name==='camera'?'Camera':'Microphone')+', close other apps that may be using it, then try again.')),15000))]);
async function cameraOn(){
 const id=$('#camera-device').value;if(cameraStream&&cameraPreviewId===id&&cameraStream.getVideoTracks()[0]?.readyState==='live')return cameraStream;cameraOff();
 cameraStream=await device(navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30},...(id?{deviceId:{exact:id}}:{})}}),'camera');cameraPreviewId=id;
 for(const node of [$('#camera-preview'),$('#camera-live')]){node.srcObject=cameraStream;node.play().catch(()=>{});}
 $('#camera-preview-box').hidden=false;await listCameras();return cameraStream;
}
function cameraOff(){cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;cameraPreviewId=null;$('#camera-preview').srcObject=$('#camera-live').srcObject=null;$('#camera-preview-box').hidden=true;$('#camera-live').hidden=true;}
async function listCameras(){try{const select=$('#camera-device'),chosen=select.value,devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput'&&d.deviceId);select.replaceChildren(new Option('System default',''),...devices.map((d,i)=>new Option(d.label||'Camera '+(i+1),d.deviceId)));if([...select.options].some(o=>o.value===chosen))select.value=chosen;}catch{}}
async function cameraToggle(){$('#error').hidden=true;if(!$('#camera').checked)return cameraOff();try{await cameraOn();}catch(e){$('#camera').checked=false;cameraOff();showError(Error(e.name==='NotAllowedError'?'Video Visor cannot use the camera. Allow it in System Settings → Privacy & Security → Camera, then try again.':e.name==='NotFoundError'||e.name==='OverconstrainedError'?'No camera was found. Connect one, or record without the camera.':'The camera could not start: '+(e.message||e.name)));}}
function cleanup(){clearInterval(drawTimer);clearInterval(timer);cameraOff();streams.forEach(s=>s.getTracks().forEach(t=>t.stop()));recordedStream?.getTracks().forEach(t=>t.stop());streams=[];video?.pause();audioContext?.close().catch(()=>{});}
async function setupStream(config){
 let captureStream=null;if(config.kind!=='voice'){try{captureStream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:!!config.systemAudio});}catch(e){if(!config.systemAudio)throw e;captureStream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:false});}}if(captureStream)streams.push(captureStream);
 const system=captureStream?.getAudioTracks()||[];if(config.systemAudio&&!system.length)systemAudioMissing=true;
 const microphone=config.microphone?await device(navigator.mediaDevices.getUserMedia({audio:config.microphoneId?{deviceId:{exact:config.microphoneId},echoCancellation:true,noiseSuppression:true}:{echoCancellation:true,noiseSuppression:true},video:false}),'microphone'):null;if(microphone)streams.push(microphone);
 if(microphone){audioContext=new AudioContext();analyser=audioContext.createAnalyser();audioContext.createMediaStreamSource(microphone).connect(analyser);analyser.fftSize=256;}
 let track=captureStream?.getVideoTracks()[0];
 if(captureStream&&(config.area||config.kind==='screenshot')){
   video=document.createElement('video');video.muted=true;video.srcObject=captureStream;await video.play();
   if(!video.videoWidth)await new Promise(r=>video.addEventListener('loadedmetadata',r,{once:true}));
   const crop=config.area?recordingGeometry.pixelCrop(config.area,config.display,video.videoWidth,video.videoHeight):{x:0,y:0,width:video.videoWidth,height:video.videoHeight};
   const canvas=document.createElement('canvas');canvas.width=config.kind==='screenshot'?crop.width:Math.max(2,crop.width-crop.width%2);canvas.height=config.kind==='screenshot'?crop.height:Math.max(2,crop.height-crop.height%2);const ctx=canvas.getContext('2d',{alpha:false});
   const draw=()=>ctx.drawImage(video,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);draw();
   if(config.kind==='screenshot'){await capture['hide-for-shot']();await new Promise(r=>video.requestVideoFrameCallback(r));await new Promise(r=>video.requestVideoFrameCallback(r));draw();const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));cleanup();return {screenshot:await blob.arrayBuffer()};}
   drawTimer=setInterval(draw,1000/30);track=canvas.captureStream(30).getVideoTracks()[0];
 }
 captureStream?.getVideoTracks()[0].addEventListener('ended',()=>stop());
 // 0.15 (RC-01): microphone and system sound mixed into one track.
 let sound=microphone?.getAudioTracks()||[];
 if(system.length){if(!microphone)sound=system;else{audioContext??=new AudioContext();const mixDest=audioContext.createMediaStreamDestination();audioContext.createMediaStreamSource(microphone).connect(mixDest);audioContext.createMediaStreamSource(new MediaStream(system)).connect(mixDest);sound=mixDest.stream.getAudioTracks();}}
 return new MediaStream([...(track?[track]:[]),...sound]);
}
async function start(){
 $('#error').hidden=true;$('#start').disabled=true;cancelCountdown=false;stopping=false;
 systemAudioMissing=false;
 try{
  const config=await capture.prepare({mode,sourceId,microphone:$('#mic').checked,microphoneId:$('#mic-device').value,hideControls:$('#hide-controls').checked,countdown:$('#countdown').checked,systemAudio:!!$('#system-audio')?.checked,camera:initial.kind==='video'&&$('#camera').checked,cameraId:$('#camera-device').value});
  const stream=await setupStream(config);const camera=config.camera?await cameraOn():null;
  $('#no-system-audio')?.remove();if(systemAudioMissing){const note=document.createElement('small');note.id='no-system-audio';note.className='hint';note.textContent='Mac sound isn’t available on this Mac (it needs macOS 13 or later and permission), so only the microphone is recorded.';$('#live')?.append(note);}
  if(stream.screenshot){await capture.screenshot(stream.screenshot);$('#start').disabled=false;return;}
  recordedStream=stream;
  if(config.countdown){$('#setup').hidden=true;$('#countdown-screen').hidden=false;for(let n=3;n>0;n--){$('#count').textContent=n;await new Promise(r=>setTimeout(r,1000));if(cancelCountdown){cleanup();await capture.abort();$('#countdown-screen').hidden=true;$('#setup').hidden=false;$('#start').disabled=false;return;}}}
  // 0.15: record H.264 + AAC MP4 (hardware encoder) when the size allows it, else VP9 WebM; a keyframe every second,
  // so saving only repackages the file (no re-encode) and the recording seeks fast while editing and exporting.
  const pick=list=>list.find(t=>MediaRecorder.isTypeSupported(t)),vs=stream.getVideoTracks()[0]?.getSettings?.()||{},even=!(vs.width%2)&&!(vs.height%2);
  const mime=config.kind==='voice'?pick(['audio/webm;codecs=opus']):pick([...(even?['video/mp4;codecs=avc1,mp4a.40.2','video/mp4;codecs=avc1']:[]),'video/webm;codecs=vp9,opus']);
  const bits=Math.round(Math.min(40e6,Math.max(8e6,(vs.width||1920)*(vs.height||1080)*(vs.frameRate||30)*.1)));
  recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:bits,videoKeyFrameIntervalDuration:1000});write=Promise.resolve();
  recorder.ondataavailable=e=>{if(e.data.size)write=write.then(async()=>capture.chunk(await e.data.arrayBuffer()));};
  recorder.onerror=e=>{showError(e.error||Error('Recording stopped unexpectedly'));stop();};
  started={};cameraRecorder=null;cameraStopped=null;recorder.onstart=()=>{started.screen=performance.now();};
  if(camera){const cs=camera.getVideoTracks()[0]?.getSettings?.()||{},type=pick([...(!(cs.width%2)&&!(cs.height%2)?['video/mp4;codecs=avc1']:[]),'video/webm;codecs=vp9']);cameraRecorder=new MediaRecorder(new MediaStream(camera.getVideoTracks()),{...(type?{mimeType:type}:{}),videoBitsPerSecond:5000000,videoKeyFrameIntervalDuration:1000});cameraRecorder.onstart=()=>{started.camera=performance.now();};cameraRecorder.ondataavailable=e=>{if(e.data.size)write=write.then(async()=>capture.chunk(await e.data.arrayBuffer(),'camera'));};cameraStopped=new Promise(done=>{cameraRecorder.onstop=done;cameraRecorder.onerror=done;});$('#camera-live').hidden=false;}
  recorder.onstop=async()=>{if(cameraRecorder){if(cameraRecorder.state!=='inactive')cameraRecorder.stop();await cameraStopped;}cleanup();$('#phase').textContent='Saving…';$('#pause').disabled=$('#stop').disabled=true;$('#cancel-processing').hidden=false;try{await write;await capture.finish({cameraDelay:Number.isFinite(started.camera-started.screen)?(started.camera-started.screen)/1000:0});}catch(e){showError(e);$('#retry').hidden=false;}finally{$('#cancel-processing').hidden=true;}};
  await capture.begin();recorder.start(1000);cameraRecorder?.start(1000);clock.start();$('#setup').hidden=$('#countdown-screen').hidden=true;$('#live').hidden=false;document.body.classList.add('compact');
  timer=setInterval(()=>{const n=Math.floor(clock.seconds());$('#clock').textContent=String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');if(analyser){const values=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(values);$('#mic-meter').value=Math.min(1,Math.sqrt(values.reduce((sum,v)=>sum+((v-128)/128)**2,0)/values.length)*4);}},100);
 }catch(e){cleanup();await capture.abort();$('#setup').hidden=false;$('#countdown-screen').hidden=true;$('#start').disabled=false;showError(e);}
}
function stop(){if(stopping)return;if(recorder&&['recording','paused'].includes(recorder.state)){stopping=true;if(cameraRecorder&&cameraRecorder.state!=='inactive')cameraRecorder.stop();recorder.stop();}else if(!recorder)cancelCountdown=true;}
async function pause(){if(!recorder||stopping)return;const paused=recorder.state==='recording';if(paused){recorder.pause();if(cameraRecorder?.state==='recording')cameraRecorder.pause();clock.pause();}else if(recorder.state==='paused'){recorder.resume();if(cameraRecorder?.state==='paused')cameraRecorder.resume();clock.resume();}else return;await capture.pause(paused);$('#phase').textContent=paused?'Paused':'Recording';$('#pause').innerHTML='<i data-lucide="'+(paused?'play':'pause')+'"></i>'+(paused?'Resume':'Pause');document.body.classList.toggle('paused',paused);icons();}
$('#close').onclick=()=>capture.close();$('#refresh').onclick=refresh;$('#start').onclick=start;$('#pause').onclick=()=>pause().catch(showError);$('#stop').onclick=stop;$('#cancel-countdown').onclick=()=>{cancelCountdown=true;};$('#retry').onclick=async()=>{try{$('#error').hidden=true;await capture.finish();}catch(e){showError(e);}};
$('#cancel-processing').onclick=()=>capture['cancel-processing']();
$('#choose-area').onclick=async()=>{try{area=await capture.area(sourceId);controls();}catch(e){showError(e);}};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;area=null;$('#hide-controls').checked=false;renderSources();});
capture.onCommand(command=>{if(command==='stop')stop();if(command==='pause')pause().catch(showError);if(['camera-on','camera-off'].includes(command)&&!recorder&&initial.kind==='video'){$('#camera').checked=command==='camera-on';cameraToggle();}});
$('#camera').onchange=cameraToggle;$('#camera-device').onchange=()=>{if($('#camera').checked)cameraToggle();};
if(initial.kind==='voice'){document.body.classList.add('voice');$('#heading').textContent='Record your narration';$('#mic').checked=true;$('#mic').disabled=true;$('#capture-hint').textContent='Narration is added at the playhead. You can pause, resume and stop from this floating panel.';}else if(initial.kind==='screenshot'){document.body.classList.add('shot');$('#heading').textContent='Capture and annotate';$('#start').innerHTML='<i data-lucide="camera"></i>Capture screenshot';$('.options').hidden=true;$('#capture-hint').textContent='Capture a full display, a window, or a selected area. Add annotations in the editor.';await refresh();}else{$('#hide-controls').checked=false;await refresh();if(initial.camera){$('#camera').checked=true;$('#heading').textContent='Record your screen and yourself';cameraToggle();}}
try{const devices=await navigator.mediaDevices.enumerateDevices();for(const [i,device]of devices.filter(d=>d.kind==='audioinput'&&d.deviceId!=='default'&&d.deviceId!=='communications'/* 0.15 (Win-fix 13): Windows lists each microphone again as its communications device */).entries()){const option=document.createElement('option');option.value=device.deviceId;option.textContent=device.label||'Microphone '+(i+1);$('#mic-device').append(option);}}catch{}
icons();
})();
