const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');/* 0.15 (Win-fix 3): no libvips operation cache — it kept files it had read (tool results, read back for their thumbnails) open, so Windows refused to move or delete them until the app quit */sharp.cache(false);
const {PDFDocument,StandardFonts,rgb,degrees}=require('pdf-lib');
const finite=(v,f=0)=>Number.isFinite(+v)?+v:f;
function pages(value,count){const result=[];for(const part of String(value).split(',')){const bits=part.trim().split('-').map(Number);if(bits.length>2||bits.some(n=>!Number.isInteger(n)||n<1||n>count))throw Error('Invalid page range. Choose pages 1–'+count);for(let i=bits[0];i<=(bits[1]??bits[0]);i++)result.push(i-1);}if(!result.length)throw Error('Select at least one page.');return result;}
// 0.15 (FT-02): PDFs are opened with a plain-language message for password-protected or damaged files.
async function loadPdf(a){try{return await PDFDocument.load(await fs.readFile(a.path));}catch(e){if(/encrypt/i.test(e.message))throw Error('“'+a.name+'” is password-protected. Remove the password first (PDF tools → Unlock PDF), then try again.');throw Error('“'+a.name+'” could not be read as a PDF. It may be damaged; try PDF tools → Repair PDF.');}}
const dataPng=v=>typeof v==='string'&&v.startsWith('data:image/png;base64,')?Buffer.from(v.slice(22),'base64'):null;
// 0.15 (FT-13): each tool takes the kinds of file it can use.
const KINDS={pdf:['pdf'],image:['image'],video:['video'],audio:['audio','video'],jpgpdf:['image']};
async function executeTool({id,assets,opts={},run,ffmpeg,root,saveDialog,progress,nativeBin,group}){
 if(!assets.length)throw Error('Choose a file first.');{const grp=['frame','trim','gif','vcompress','vconvert','vaudio'].includes(id)?'video':['bgremove','iconvert','icompress','iresize'].includes(id)?'image':['aclean','atrim'].includes(id)?'audio':'pdf',allowed=KINDS[id]||KINDS[grp];const wrong=allowed&&assets.filter(a=>!allowed.includes(a.kind));if(wrong?.length)throw Error((wrong.length===1?'“'+wrong[0].name+'” isn’t':wrong.length+' files aren’t')+' '+({pdf:'a PDF',image:'an image',video:'a video',audio:'a sound or video file'}[allowed[0]]||'the right kind of file')+'. Remove '+(wrong.length===1?'it':'them')+' and try again.');}const single=['bgremove','pdfjpg','pcompress','protect','unlock','repair','ocr','markdown','summary','pdfinfo','split','organize','watermark','forms','sign','editpdf'];if(single.includes(id)&&assets.length>1)throw Error('This tool processes one file at a time. Remove the extra files and try again.');const paths=[];
 if(['bgremove','pdfjpg','pcompress','protect','unlock','repair','ocr','markdown','compare','summary'].includes(id)){
  /* 0.15 (Phase 33): the macOS helper on a Mac; the Windows versions (engines/win-helper.cjs) elsewhere */const helper=(args,o)=>process.platform==='darwin'?run(nativeBin,args,null,JSON.stringify(o)):require('./win-helper.cjs').run(args,o,{ffmpeg});
  const ext=id==='bgremove'||id==='pdfjpg'?'png':id==='markdown'?'md':['ocr','compare','summary'].includes(id)?'txt':'pdf';
  const dest=await saveDialog(path.basename(assets[0].name,path.extname(assets[0].name))+'-'+id+'.'+ext);if(!dest)return null;
  if(['markdown','summary','compare'].includes(id)){
   const result=JSON.parse(await helper(['pdftext',assets[0].path],opts));let text=result.text;
   if(id==='summary'){const paragraphs=text.split(/(?<=[.!?])\s+/).filter(s=>s.trim().length>35);text='Extractive reading summary — review against the original.\n\n'+paragraphs.slice(0,opts['v-option']==='Detailed'?20:6).map(x=>'• '+x).join('\n\n');}
   if(id==='compare'){if(assets.length!==2)throw Error('Choose two PDFs to compare.');const second=JSON.parse(await helper(['pdftext',assets[1].path],opts)).text;const a=text.split('\n'),b=second.split('\n');text='Text comparison (layout differences are not compared)\n\n'+a.filter(x=>!b.includes(x)).map(x=>'- '+x).join('\n')+'\n'+b.filter(x=>!a.includes(x)).map(x=>'+ '+x).join('\n');}
   await fs.writeFile(dest,text);return {paths:[dest]};
  }
  const result=JSON.parse(await helper([id,assets[0].path,dest],opts));
  if(id==='pdfjpg'&&opts['v-option']==='JPG'){const paths=[];for(const png of result.paths){const jpg=png.replace(/\.png$/,'.jpg');await sharp(png).jpeg({quality:90}).toFile(jpg);await fs.unlink(png);paths.push(jpg);}return {paths};}
  return {paths:result.paths||[dest],...(result.note?{note:String(result.note)}:{})};/* 0.15 (Win-fix 7): e.g. Compress PDF's size note */
 }
 if(id==='pdfinfo'){const doc=await loadPdf(assets[0]);return {count:doc.getPageCount(),fields:doc.getForm().getFields().map(f=>({name:f.getName(),type:f.constructor.name,value:typeof f.getText==='function'?f.getText():typeof f.isChecked==='function'?f.isChecked():''}))};}
 const pdfIds=['merge','split','organize','jpgpdf','watermark','forms','sign','editpdf'];
 if(pdfIds.includes(id)){
  let out=await PDFDocument.create();
  if(id==='jpgpdf')for(const a of assets){/* 0.15 (FT-16): photos stay JPEG (PNG made them several times larger); PNG only for transparency */const src=sharp(a.previewPath||a.path).rotate(),meta=await sharp(a.previewPath||a.path).metadata(),im=meta.hasAlpha?await out.embedPng(await src.png().toBuffer()):await out.embedJpg(await src.jpeg({quality:92,mozjpeg:true}).toBuffer());const fit=opts['v-option']==='Fit image',land=opts['v-orientation']==='Landscape',letter=opts['v-option']==='Letter';let [w,h]=fit?[im.width,im.height]:letter?[612,792]:[595.28,841.89];if(!fit&&(land||opts['v-orientation']==='Automatic'&&im.width>im.height))[w,h]=[h,w];const margin=fit?0:opts['v-margins']==='None'?0:opts['v-margins']==='Large'?48:20,p=out.addPage([w,h]),scale=Math.min((w-margin*2)/im.width,(h-margin*2)/im.height);p.drawImage(im,{x:(w-im.width*scale)/2,y:(h-im.height*scale)/2,width:im.width*scale,height:im.height*scale});}
  else if(id==='merge')for(const a of assets){const doc=await loadPdf(a);for(const p of await out.copyPages(doc,doc.getPageIndices()))out.addPage(p);}
  else{
   const doc=await loadPdf(assets[0]);/* 0.15 (FT-15): filled forms stay editable unless flattening is asked for */if(opts.formValues){const form=doc.getForm();for(const f of form.getFields()){const val=opts.formValues[f.getName()];if(val===undefined)continue;if(typeof f.setText==='function')f.setText(String(val));if(typeof f.check==='function')val?f.check():f.uncheck();}if(opts.flatten)form.flatten();}
   if(id==='split'&&opts['v-option']==='Every page separately'){
    const dest=await saveDialog('Extracted-page.pdf');if(!dest)return null;
    for(let i=0;i<doc.getPageCount();i++){const part=await PDFDocument.create();part.addPage((await part.copyPages(doc,[i]))[0]);const file=dest.replace(/\.pdf$/i,'')+'-'+(i+1)+'.pdf';await fs.writeFile(file,await part.save(),{flag:'wx'});paths.push(file);}return {paths};
   }
   const order=id==='split'?pages(opts['v-range']||'1',doc.getPageCount()):opts.order?pages(opts.order,doc.getPageCount()):doc.getPageIndices();
   for(const p of await out.copyPages(doc,order))out.addPage(p);
   if(opts.newField){const form=out.getForm(),page=out.getPage(Math.max(0,Math.min(out.getPageCount()-1,finite(opts.page,1)-1)));const f=opts.newFieldType==='checkbox'?form.createCheckBox(opts.newField):form.createTextField(opts.newField);f.addToPage(page,{x:finite(opts.x,40),y:finite(opts.y,40),width:opts.newFieldType==='checkbox'?18:160,height:22});}
   if(opts.rotate)for(const p of out.getPages())p.setRotation(degrees((p.getRotation().angle+finite(opts.rotate))%360));
   const font=await out.embedFont(StandardFonts.Helvetica);
   if(id==='editpdf'&&opts.text&&dataPng(opts.textImage)){const p=out.getPage(Math.max(0,Math.min(out.getPageCount()-1,finite(opts.page,1)-1))),im=await out.embedPng(dataPng(opts.textImage)),size=Math.max(6,Math.min(120,finite(opts.size,16))),h=size*1.4,w=h*im.width/im.height;p.drawImage(im,{x:finite(opts.x,40),y:finite(opts.y,40)-size*.3,width:w,height:h});}
   else if(id==='editpdf'&&opts.text){if(/[^\x00-\xff]/.test(String(opts.text)))throw Error('This text has characters the PDF font can’t show. Update Video Visor and try again.');const p=out.getPage(Math.max(0,Math.min(out.getPageCount()-1,finite(opts.page,1)-1)));p.drawText(String(opts.text),{font,size:Math.max(6,Math.min(120,finite(opts.size,16))),x:finite(opts.x,40),y:finite(opts.y,40),color:rgb(.05,.15,.25)});}
   const wmImage=id==='watermark'&&dataPng(opts['v-text-image'])?await out.embedPng(dataPng(opts['v-text-image'])):null;
   if(id==='watermark')for(const [i,p]of out.getPages().entries()){if(wmImage){const w=Math.min(p.getWidth()*.6,wmImage.width/2),h=w*wmImage.height/wmImage.width,position=opts['v-option']||'Centre',x=position==='Centre'?(p.getWidth()-w)/2:p.getWidth()-w-30,y=position==='Top right'?p.getHeight()-h-40:position==='Bottom right'?40:(p.getHeight()-h)/2;p.drawImage(wmImage,{x,y,width:w,height:h,opacity:.3});if(opts['v-wm-pages']??opts.input2)p.drawText(String(i+1),{font,size:10,x:p.getWidth()-40,y:25});continue;}const text=opts['v-wm-text']??opts.input0??'DRAFT',size=40,position=opts['v-option']||'Centre',tw=font.widthOfTextAtSize(text,size),x=position==='Centre'?Math.max(24,(p.getWidth()-tw)/2):Math.max(24,p.getWidth()-tw-30),y=position==='Top right'?p.getHeight()-65:position==='Bottom right'?45:p.getHeight()/2;p.drawText(text,{font,size,x,y,color:rgb(.25,.4,.65),opacity:.25});if(opts['v-wm-pages']??opts.input2)p.drawText(String(i+1),{font,size:10,x:p.getWidth()-40,y:25});}
   if(id==='sign'){const p=out.getPage(opts['v-option']?.startsWith('First')?0:out.getPageCount()-1),png=dataPng(opts['v-sign-image']);if(png){/* 0.15 (FT-06): a drawn or handwritten-style signature */const im=await out.embedPng(png),w=Math.min(180,p.getWidth()*.35),h=w*im.height/im.width;p.drawImage(im,{x:p.getWidth()-w-40,y:40,width:w,height:h});}else{const text=String(opts['v-signname']||'').trim();if(!text)throw Error('Draw or type your signature first.');if(/[^\x00-\xff]/.test(text))throw Error('Use Draw, or type your name in English letters.');p.drawText(text,{font,size:20,x:Math.max(20,p.getWidth()-font.widthOfTextAtSize(text,20)-40),y:50,color:rgb(.1,.2,.3)});}}
   if(id==='forms')throw Error('Use PDF editor to add text. Interactive form-field creation is not available in this build.');
  }
  const dest=await saveDialog(id==='merge'?(opts['v-outputname']||'Combined document.pdf'):'Video Visor '+id+'.pdf');if(!dest)return null;await fs.writeFile(dest,await out.save());return {paths:[dest]};
 }
 for(let i=0;i<assets.length;i++){
 const a=assets[i],base=path.basename(a.name,path.extname(a.name));progress(i/assets.length*100,'Processing '+a.name);
 if(['iconvert','icompress','iresize'].includes(id)){
 let format=(opts['v-option']||'JPG').toLowerCase();if(format==='keep original'||id==='iresize')format=path.extname(a.name).slice(1).toLowerCase();/* 0.15 (FT-16): HEIC photos become JPEG, not much larger PNG */if(['heic','heif','jpeg'].includes(format))format='jpeg';if(format==='jpg')format='jpeg';if(!['jpeg','png','webp','tiff','avif'].includes(format))format='png';const dest=await saveDialog(base+'-edited.'+(format==='jpeg'?'jpg':format));if(!dest)return {paths};let p=sharp(a.previewPath||a.path).rotate();if(opts['v-alpha']!=='Preserve when supported'&&opts['v-alpha'])p=p.flatten({background:opts['v-alpha']==='Black background'?'#000':'#fff'});if(id==='iresize'){const w=finite(opts['v-width']??opts.input0,1920),h=finite(opts['v-height']??opts.input1,1080);if(w<1||h<1||w>16384||h>16384)throw Error('Choose image dimensions between 1 and 16384 pixels.');p=p.resize(w,h,{fit:opts['v-option']==='Stretch'?'fill':opts['v-option']==='Fill and crop'?'cover':'inside',position:({Top:'north',Bottom:'south',Left:'west',Right:'east'})[opts['v-crop']]||'centre'});}await p.toFormat(format,{quality:Math.max(10,Math.min(100,finite(opts['v-quality'],85))),compressionLevel:9}).toFile(dest);paths.push(dest);continue;
 }
 let format=(opts['v-option']||'MP4').toLowerCase();if(id==='vcompress')format='mp4';if(id==='gif')format='gif';if(id==='frame')format=format==='jpg'?'jpg':'png';if(!['mp4','mov','webm','gif','mp3','wav','m4a','png','jpg'].includes(format))throw Error('Unsupported output format.');const dest=await saveDialog(base+'-edited.'+format);if(!dest)return {paths};let args=['-y'];const start=Math.max(0,finite(opts['v-start'])),end=finite(opts['v-end'],a.duration);if(['trim','atrim','gif','vaudio'].includes(id)){if(end<=start||end>a.duration+.1)throw Error('Trim end must be after start and within the source duration ('+a.duration.toFixed(1)+'s).');args.push('-ss',String(start));}if(id==='frame'){const time=finite(opts['v-frame-time']??opts.input0,0);if(time<0||time>=a.duration)throw Error('Choose a frame time within the video duration.');args.push('-ss',String(Math.max(0,time-.0001)));}args.push('-i',a.path);if(['trim','atrim','gif','vaudio'].includes(id))args.push('-t',String(end-start));
 if(id==='frame')args.push('-frames:v','1');
 else if(['vaudio','aclean','atrim'].includes(id)){if(!a.hasAudio)throw Error('The file has no audio track.');args.push('-vn');if(id==='aclean'){const filters=[];if(opts['v-clean-noise'])filters.push('afftdn=nf=-25');if(opts['v-clean-level'])filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');if(filters.length)args.push('-af',filters.join(','));}if(format==='mp3')args.push('-c:a','libmp3lame','-b:a',opts['v-quality-choice']?.startsWith('Standard')?'128k':'256k');if(format==='m4a')args.push('-c:a','aac','-b:a',opts['v-quality-choice']?.startsWith('Standard')?'128k':'256k');}
 else if(format==='gif'){const width=parseInt(opts['v-width']||opts['v-option'])||640,fps=parseInt(opts['v-fps'])||12;args.push('-filter_complex',`fps=${fps},scale=${Math.min(1920,Math.max(160,width))}:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`,'-loop',opts['v-loop']===false?'-1':'0');}
 else {const filters=[];const res=opts['v-resolution'];const h=res?.startsWith('4K')?2160:parseInt(res);/* 0.15 (FT-16): never upscale */if(h)filters.push(`scale=-2:'trunc(min(ih\\,${h})/2)*2'`);else filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');if(filters.length)args.push('-vf',filters.join(','));const fps=parseInt(opts['v-fps']);if(fps)args.push('-r',String(fps));if(format==='webm')args.push('-c:v','libvpx-vp9','-crf','32','-b:v','0','-row-mt','1','-deadline','good','-cpu-used','4','-c:a','libopus');/* 0.15: 5x faster, same quality */else args.push('-c:v','libx264','-preset','fast','-crf',id==='vcompress'?String(Math.round(40-finite(opts['v-quality'],75)*.24)):'20','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart');}
 await run(ffmpeg,[...args,dest]);
 /* 0.15 (FT-01): a frame asked for at the very end can fall after the last decodable frame; use the last frame instead */
 if(id==='frame'&&!(await fs.stat(dest).then(x=>x.size>0,()=>false)))await run(ffmpeg,['-y','-sseof','-1','-i',a.path,'-update','1','-frames:v','30',dest]);
 paths.push(dest);
 }return {paths};
}

// 0.15 (FT-12): errors in plain language. Messages written for people pass through; raw tool output is replaced.
function plainError(e){const m=String(e?.message||e);if(/cancel/i.test(m))return Error('Processing cancelled.');if(m.length<220&&!/\n|ffmpeg|libav|Error while|Conversion failed|Invalid argument|ENOENT|EACCES|EPERM|stack|at \w+ \(/.test(m))return e;
 if(/ENOSPC|No space left/i.test(m))return Error('There isn’t enough free disk space. Free some space and try again.');if(/EACCES|EPERM|Permission denied/i.test(m))return Error('Video Visor isn’t allowed to save there. Choose another folder.');if(/ENOENT|No such file/i.test(m))return Error('A file was moved or deleted while processing. Add it again and retry.');
 if(/Invalid data|moov atom|could not find codec|Unknown format|unsupported/i.test(m))return Error('This file couldn’t be read. It may be damaged or in a format this tool doesn’t support.');return Error('The file couldn’t be processed. Try another file or other settings; details are in the diagnostics log.');}
async function freeName(file){if(!await fs.stat(file).then(()=>true,()=>false))return file;const ext=path.extname(file),base=file.slice(0,-ext.length||undefined);for(let k=2;k<1000;k++){const f=base+' '+k+ext;if(!await fs.stat(f).then(()=>true,()=>false))return f;}return file;}
async function processTool(ctx){try{return await processToolInner(ctx);}catch(e){const p=plainError(e);if(p!==e)ctx.log?.('tool-error',{id:ctx.id,message:String(e?.message||e).slice(0,600)});throw p;}}
async function processToolInner(ctx){
 if(ctx.id==='pdfinfo')return executeTool(ctx);
 // 0.15 (FT-08): a batch of files asks for one output folder instead of one save dialog per file.
 const perFile=!['merge','jpgpdf','compare','split','organize','watermark','sign','editpdf','forms'].includes(ctx.id)&&ctx.assets.length>1;let outFolder=null;
 if(perFile&&ctx.dialog){const r=await ctx.dialog.showOpenDialog(ctx.win,{title:'Choose a folder for the '+ctx.assets.length+' processed files',properties:['openDirectory','createDirectory']});if(r.canceled||!r.filePaths[0])return null;outFolder=r.filePaths[0];}
 const stage=await fs.mkdtemp(path.join(ctx.root,'utility-')),destinations=[];
 try{
  const result=await executeTool({...ctx,saveDialog:async name=>{
   const dest=outFolder?await freeName(path.join(outFolder,name)):await ctx.saveDialog(name);if(!dest)return null;
   const folder=path.join(stage,String(destinations.length));await fs.mkdir(folder);
   destinations.push({folder,dest});return path.join(folder,path.basename(dest));
  }});
  if(!result?.paths)return result;
  if(ctx.cancelled?.())throw Error('Processing cancelled.');
  const files=[];
  for(const file of result.paths){
   const record=destinations.find(d=>path.dirname(file)===d.folder);if(!record)throw Error('Unexpected output path.');
   const dest=path.join(path.dirname(record.dest),path.basename(file));
   await ctx.validateOutput?.(dest);
   /* 0.15 (FT-17): extra outputs of a re-run get a free name ("page-1 2.pdf") instead of failing */
   files.push({file,dest:dest!==record.dest?await freeName(dest):dest});
  }
  for(const {file,dest}of files){if(ctx.cancelled?.())throw Error('Processing cancelled.');const temp=dest+'.videovisor-'+Date.now()+'.tmp';try{await fs.copyFile(file,temp);await fs.rename(temp,dest);}finally{await fs.rm(temp,{force:true});}}
  return {...result,paths:files.map(f=>f.dest)};
 }finally{await fs.rm(stage,{recursive:true,force:true});}
}
module.exports={processTool,pages};

