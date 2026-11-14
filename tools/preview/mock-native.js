(()=>{
// Stand-in for the Electron main process, so the interface can run in a browser for testing.
const log=[];window.__nativeLog=log;let saved=null;try{saved=JSON.parse(localStorage.getItem('vv-mock')||'null');}catch{}
let n=0;const mk=(kind,name,u,extra={})=>({id:'mock-'+(++n),name,kind,size:4200000,duration:kind==='image'?5:24,width:1280,height:720,fps:30,hasAudio:kind!=='image',cursor:[],url:u,type:kind+'/local',...extra});
const wave=Array.from({length:180},(_,i)=>.25+.5*Math.abs(Math.sin(i/7)));
let cat=null;
const ai={provider:'anthropic',keychain:true,busy:false,services:[{id:'anthropic',name:'Anthropic (Claude)',company:'Anthropic',keyPage:'console.anthropic.com → API keys',defaultModel:'claude-opus-5-5',ready:true,model:'claude-opus-5-5'},{id:'openai',name:'OpenAI',company:'OpenAI',keyPage:'platform.openai.com → API keys',defaultModel:'',ready:true,model:''}]};
const conn={enabled:false,running:false,port:0,token:'',permissions:{},folders:[],clients:[],log:[],setup:{entry:{},config:'{}',configFile:'~/Library/Application Support/Claude/claude_desktop_config.json',claudeFound:true},exportFolder:'~/Movies/Video Visor'};
const impl={
 load:async()=>saved,save:async d=>{try{localStorage.setItem('vv-mock',JSON.stringify(d));}catch{}return true;},workspaceRecovery:async()=>null,
 pick:async()=>[mk('video','Product demo.mp4','/__preview/samples/demo.mp4'),mk('image','Screenshot.png','/__preview/samples/still.png')],
 importPaths:async()=>[mk('video','Dropped clip.mp4','/__preview/samples/demo.mp4')],
 mediaVisuals:async()=>({frames:Array(5).fill('/__preview/samples/still.png'),waveform:wave}),
 library:async()=>{if(!cat){const c=await (await fetch('music/catalog.json')).json();cat=c.map(i=>mk('audio',i.name,'music/'+i.file,{duration:i.duration,mood:i.mood,bpm:i.bpm,width:0,height:0}));}return cat;},
 aiState:async()=>ai,connectorState:async()=>conn,connectorUpdate:async()=>conn,aiModels:async()=>[{id:'claude-opus-5-5',name:'Claude Opus 5.5'}],
 silences:async()=>[{start:4,end:6},{start:12,end:13.5}],
 transcribe:async(id)=>new Promise(r=>setTimeout(()=>r([[0.2,3,'Welcome to this quick walkthrough.'],[3.2,7,'Today we will look at the new dashboard.'],[7.4,12,'First, open the settings panel on the right.'],[12.5,18,'Then pick the option you need and save.']].map(([start,end,text])=>{const ws=text.split(' '),d=(end-start)/ws.length;return {start,end,text,asset:id,words:ws.map((w,i)=>({text:w,word:w,start:start+i*d,end:start+(i+1)*d}))};})),600)),
 track:async()=>(await fetch('/__preview/track.json')).json(),
 export:async(st,cfg)=>{window.__lastExport={cfg};return {path:'/Users/demo/Movies/Product demo.mp4',size:19000000};},
 exportQueued:async()=>({path:'/Users/demo/Movies/Video Visor/Product demo.mp4'}),
 prepareAudioPreview:async()=>({id:'mock-prev',url:'music/1.m4a',duration:24}),
 toolPreview:async()=>mk('video','sample-preview.mp4','/__preview/samples/demo.mp4',{duration:5}),
 tool:async(id)=>{window.__lastTool=id;return {paths:['/Users/demo/out/'+id+'.out'],assets:[]};},
 readText:async()=>'1\n00:00:01,000 --> 00:00:03,000\nHello from an SRT file\n\n2\n00:00:04,000 --> 00:00:06,000\nSecond line\n',
 readScript:async()=>'Welcome to this quick walkthrough. Today we will look at the new dashboard.',
 reveal:async()=>true,openFile:async()=>true,revealWorkspace:async()=>true,'recorder-open':async()=>true,
 cancel:async()=>true,previewMute:async m=>!!m,setExportFolder:async f=>f||null,chooseFolder:async()=>null,
 filePath:f=>f.name,onProgress(){},onCapture(){},onAiStep(){}
};
window.native=new Proxy(impl,{get(t,k){if(typeof k!=='string')return t[k];const f=t[k]||(async(...a)=>{throw Error('Not available in this walkthrough ('+k+')');});return (...a)=>{log.push(k);return f(...a);};}});
})();
