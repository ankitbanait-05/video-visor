const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),{Readable}=require('node:stream');
const types={'.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav','.ogg':'audio/ogg','.flac':'audio/flac','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.pdf':'application/pdf'};
function byteRange(value,size){
 if(!value)return null;
 const match=/^bytes=(\d*)-(\d*)$/.exec(value);
 if(!match||(!match[1]&&!match[2])||!size)return false;
 const suffix=!match[1],start=suffix?Math.max(0,size-Number(match[2])):Number(match[1]),end=suffix?size-1:match[2]?Math.min(size-1,Number(match[2])):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return false;
 return{start,end};
}
async function fileResponse(file,request){
 let stat;try{stat=await fsp.stat(file);}catch{return new Response('Media unavailable',{status:404});}
 if(!stat.isFile())return new Response('Not a file',{status:404});
 const range=byteRange(request.headers.get('range'),stat.size),headers={'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Accept-Ranges':'bytes','Access-Control-Allow-Origin':'visor://app','Cache-Control':'no-store'};
 if(range===false)return new Response(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+stat.size}});
 const start=range?.start||0,end=range?.end??stat.size-1;
 headers['Content-Length']=String(Math.max(0,end-start+1));if(range)headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
 if(request.method==='HEAD'||!stat.size)return new Response(null,{status:range?206:200,headers});
 /* 0.15 (Win-fix 3): close the file as soon as the page drops the request (a seek, a closed thumbnail, leaving a screen)
    instead of leaving an abandoned stream holding its handle */
 const signal=request.signal;if(signal?.aborted)return new Response(null,{status:204,headers});
 const stream=fs.createReadStream(file,{start,end});
 if(signal){const close=()=>{if(!stream.destroyed)stream.destroy();};signal.addEventListener('abort',close,{once:true});stream.once('close',()=>signal.removeEventListener('abort',close));}
 return new Response(Readable.toWeb(stream),{status:range?206:200,headers}); // cancelling the body also destroys the stream
}
module.exports={byteRange,fileResponse};
