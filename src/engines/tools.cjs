const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const {PDFDocument,StandardFonts,rgb,degrees}=require('pdf-lib');
const finite=(v,f=0)=>Number.isFinite(+v)?+v:f;
function pages(value,count){const result=[];for(const part of String(value).split(',')){const bits=part.trim().split('-').map(Number);if(bits.length>2||bits.some(n=>!Number.isInteger(n)||n<1||n>count))throw Error('Invalid page range. Choose pages 1–'+count);for(let i=bits[0];i<=(bits[1]??bits[0]);i++)result.push(i-1);}if(!result.length)throw Error('Select at least one page.');return result;}
async function executeTool({id,assets,opts={},run,ffmpeg,root,saveDialog,progress,nativeBin}){
 if(!assets.length)throw Error('Choose a file first.');const single=['bgremove','pdfjpg','pcompress','protect','unlock','repair','ocr','markdown','summary','pdfinfo','split','organize','watermark','forms','sign','editpdf'];if(single.includes(id)&&assets.length>1)throw Error('This tool processes one file at a time. Remove the extra files and try again.');const paths=[];
 if(['bgremove','pdfjpg','pcompress','protect','unlock','repair','ocr','markdown','compare','summary'].includes(id)){
  const ext=id==='bgremove'||id==='pdfjpg'?'png':id==='markdown'?'md':['ocr','compare','summary'].includes(id)?'txt':'pdf';
  const dest=await saveDialog(path.basename(assets[0].name,path.extname(assets[0].name))+'-'+id+'.'+ext);if(!dest)return null;
  if(['markdown','summary','compare'].includes(id)){
   const result=JSON.parse(await run(nativeBin,['pdftext',assets[0].path],null,JSON.stringify(opts)));let text=result.text;
   if(id==='summary'){const paragraphs=text.split(/(?<=[.!?])\s+/).filter(s=>s.trim().length>35);text='Extractive reading summary — review against the original.\n\n'+paragraphs.slice(0,opts['v-option']==='Detailed'?20:6).map(x=>'• '+x).join('\n\n');}
   if(id==='compare'){if(assets.length!==2)throw Error('Choose two PDFs to compare.');const second=JSON.parse(await run(nativeBin,['pdftext',assets[1].path],null,JSON.stringify(opts))).text;const a=text.split('\n'),b=second.split('\n');text='Text comparison (layout differences are not compared)\n\n'+a.filter(x=>!b.includes(x)).map(x=>'- '+x).join('\n')+'\n'+b.filter(x=>!a.includes(x)).map(x=>'+ '+x).join('\n');}
   await fs.writeFile(dest,text);return {paths:[dest]};
  }
  const result=JSON.parse(await run(nativeBin,[id,assets[0].path,dest],null,JSON.stringify(opts)));
  if(id==='pdfjpg'&&opts['v-option']==='JPG'){const paths=[];for(const png of result.paths){const jpg=png.replace(/\.png$/,'.jpg');await sharp(png).jpeg({quality:90}).toFile(jpg);await fs.unlink(png);paths.push(jpg);}return {paths};}
  return {paths:result.paths||[dest]};
 }
 if(id==='pdfinfo'){const doc=await PDFDocument.load(await fs.readFile(assets[0].path));return {count:doc.getPageCount(),fields:doc.getForm().getFields().map(f=>({name:f.getName(),type:f.constructor.name,value:typeof f.getText==='function'?f.getText():typeof f.isChecked==='function'?f.isChecked():''}))};}
 const pdfIds=['merge','split','organize','jpgpdf','watermark','forms','sign','editpdf'];
 if(pdfIds.includes(id)){
  let out=await PDFDocument.create();
  if(id==='jpgpdf')for(const a of assets){const png=await sharp(a.previewPath||a.path).rotate().png().toBuffer(),im=await out.embedPng(png);const fit=opts['v-option']==='Fit image',land=opts['v-orientation']==='Landscape',letter=opts['v-option']==='Letter';let [w,h]=fit?[im.width,im.height]:letter?[612,792]:[595.28,841.89];if(!fit&&(land||opts['v-orientation']==='Automatic'&&im.width>im.height))[w,h]=[h,w];const margin=fit?0:opts['v-margins']==='None'?0:opts['v-margins']==='Large'?48:20,p=out.addPage([w,h]),scale=Math.min((w-margin*2)/im.width,(h-margin*2)/im.height);p.drawImage(im,{x:(w-im.width*scale)/2,y:(h-im.height*scale)/2,width:im.width*scale,height:im.height*scale});}
  else if(id==='merge')for(const a of assets){const doc=await PDFDocument.load(await fs.readFile(a.path));for(const p of await out.copyPages(doc,doc.getPageIndices()))out.addPage(p);}
  else{
   const doc=await PDFDocument.load(await fs.readFile(assets[0].path));if(opts.formValues){const form=doc.getForm();for(const f of form.getFields()){const val=opts.formValues[f.getName()];if(val===undefined)continue;if(typeof f.setText==='function')f.setText(String(val));if(typeof f.check==='function')val?f.check():f.uncheck();}form.flatten();}
   if(id==='split'&&opts['v-option']==='Every page separately'){
    const dest=await saveDialog('Extracted-page.pdf');if(!dest)return null;
    for(let i=0;i<doc.getPageCount();i++){const part=await PDFDocument.create();part.addPage((await part.copyPages(doc,[i]))[0]);const file=dest.replace(/\.pdf$/i,'')+'-'+(i+1)+'.pdf';await fs.writeFile(file,await part.save(),{flag:'wx'});paths.push(file);}return {paths};
   }
   const order=id==='split'?pages(opts['v-range']||'1',doc.getPageCount()):opts.order?pages(opts.order,doc.getPageCount()):doc.getPageIndices();
   for(const p of await out.copyPages(doc,order))out.addPage(p);
   if(opts.newField){const form=out.getForm(),page=out.getPage(Math.max(0,Math.min(out.getPageCount()-1,finite(opts.page,1)-1)));const f=opts.newFieldType==='checkbox'?form.createCheckBox(opts.newField):form.createTextField(opts.newField);f.addToPage(page,{x:finite(opts.x,40),y:finite(opts.y,40),width:opts.newFieldType==='checkbox'?18:160,height:22});}
   if(opts.rotate)for(const p of out.getPages())p.setRotation(degrees((p.getRotation().angle+finite(opts.rotate))%360));
   const font=await out.embedFont(StandardFonts.Helvetica);
   if(id==='editpdf'&&opts.text){const p=out.getPage(Math.max(0,Math.min(out.getPageCount()-1,finite(opts.page,1)-1)));p.drawText(String(opts.text),{font,size:Math.max(6,Math.min(120,finite(opts.size,16))),x:finite(opts.x,40),y:finite(opts.y,40),color:rgb(.05,.15,.25)});}
   if(id==='watermark')for(const [i,p]of out.getPages().entries()){const text=opts.input0||'DRAFT',size=40,position=opts['v-option']||'Centre',tw=font.widthOfTextAtSize(text,size),x=position==='Centre'?Math.max(24,(p.getWidth()-tw)/2):Math.max(24,p.getWidth()-tw-30),y=position==='Top right'?p.getHeight()-65:position==='Bottom right'?45:p.getHeight()/2;p.drawText(text,{font,size,x,y,color:rgb(.25,.4,.65),opacity:.25});if(opts.input2)p.drawText(String(i+1),{font,size:10,x:p.getWidth()-40,y:25});}
   if(id==='sign'){const text=String(opts['v-signname']||'').trim();if(!text)throw Error('Enter a name to add a typed signature.');const p=out.getPage(opts['v-option']?.startsWith('First')?0:out.getPageCount()-1);p.drawText(text,{font,size:20,x:Math.max(20,p.getWidth()-font.widthOfTextAtSize(text,20)-40),y:50,color:rgb(.1,.2,.3)});}
   if(id==='forms')throw Error('Use PDF editor to add text. Interactive form-field creation is not available in this build.');
  }
  const dest=await saveDialog(id==='merge'?(opts['v-outputname']||'Combined document.pdf'):'Video Visor '+id+'.pdf');if(!dest)return null;await fs.writeFile(dest,await out.save());return {paths:[dest]};
 }
 for(let i=0;i<assets.length;i++){
 const a=assets[i],base=path.basename(a.name,path.extname(a.name));progress(i/assets.length*100,'Processing '+a.name);
 if(['iconvert','icompress','iresize'].includes(id)){
 let format=(opts['v-option']||'JPG').toLowerCase();if(format==='keep original'||id==='iresize')format=path.extname(a.name).slice(1).toLowerCase();if(format==='jpg')format='jpeg';if(!['jpeg','png','webp','tiff','avif'].includes(format))format='png';const dest=await saveDialog(base+'-edited.'+(format==='jpeg'?'jpg':format));if(!dest)return {paths};let p=sharp(a.previewPath||a.path).rotate();if(opts['v-alpha']!=='Preserve when supported'&&opts['v-alpha'])p=p.flatten({background:opts['v-alpha']==='Black background'?'#000':'#fff'});if(id==='iresize'){const w=finite(opts.input0,1920),h=finite(opts.input1,1080);if(w<1||h<1||w>16384||h>16384)throw Error('Choose image dimensions between 1 and 16384 pixels.');p=p.resize(w,h,{fit:opts['v-option']==='Stretch'?'fill':opts['v-option']==='Fill and crop'?'cover':'inside'});}await p.toFormat(format,{quality:Math.max(10,Math.min(100,finite(opts['v-quality'],85))),compressionLevel:9}).toFile(dest);paths.push(dest);continue;
 }
 let format=(opts['v-option']||'MP4').toLowerCase();if(id==='vcompress')format='mp4';if(id==='gif')format='gif';if(id==='frame')format=format==='jpg'?'jpg':'png';if(!['mp4','mov','webm','gif','mp3','wav','m4a','png','jpg'].includes(format))throw Error('Unsupported output format.');const dest=await saveDialog(base+'-edited.'+format);if(!dest)return {paths};let args=['-y'];const start=Math.max(0,finite(opts['v-start'])),end=finite(opts['v-end'],a.duration);if(['trim','atrim','gif','vaudio'].includes(id)){if(end<=start||end>a.duration+.1)throw Error('Trim end must be after start and within the source duration ('+a.duration.toFixed(1)+'s).');args.push('-ss',String(start));}if(id==='frame'){const time=finite(opts['v-frame-time']??opts.input0,0);if(time<0||time>=a.duration)throw Error('Choose a frame time within the video duration.');args.push('-ss',String(Math.max(0,time-.0001)));}args.push('-i',a.path);if(['trim','atrim','gif','vaudio'].includes(id))args.push('-t',String(end-start));
 if(id==='frame')args.push('-frames:v','1');
 else if(['vaudio','aclean','atrim'].includes(id)){if(!a.hasAudio)throw Error('The file has no audio track.');args.push('-vn');if(id==='aclean'){const filters=[];if(opts['v-clean-noise'])filters.push('afftdn=nf=-25');if(opts['v-clean-level'])filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');if(filters.length)args.push('-af',filters.join(','));}if(format==='mp3')args.push('-c:a','libmp3lame','-b:a',opts['v-quality-choice']?.startsWith('Standard')?'128k':'256k');if(format==='m4a')args.push('-c:a','aac','-b:a',opts['v-quality-choice']?.startsWith('Standard')?'128k':'256k');}
 else if(format==='gif'){const width=parseInt(opts['v-width']||opts['v-option'])||640,fps=parseInt(opts['v-fps'])||12;args.push('-filter_complex',`fps=${fps},scale=${Math.min(1920,Math.max(160,width))}:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`,'-loop',opts['v-loop']===false?'-1':'0');}
 else {const filters=[];const res=opts['v-resolution'];const h=res?.startsWith('4K')?2160:parseInt(res);if(h)filters.push(`scale=-2:${h}`);else filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');if(filters.length)args.push('-vf',filters.join(','));const fps=parseInt(opts['v-fps']);if(fps)args.push('-r',String(fps));if(format==='webm')args.push('-c:v','libvpx-vp9','-crf','32','-b:v','0','-c:a','libopus');else args.push('-c:v','libx264','-preset','fast','-crf',id==='vcompress'?String(Math.round(40-finite(opts['v-quality'],75)*.24)):'20','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart');}
 await run(ffmpeg,[...args,dest]);paths.push(dest);
 }return {paths};
}

async function processTool(ctx){
 if(ctx.id==='pdfinfo')return executeTool(ctx);
 const stage=await fs.mkdtemp(path.join(ctx.root,'utility-')),destinations=[];
 try{
  const result=await executeTool({...ctx,saveDialog:async name=>{
   const dest=await ctx.saveDialog(name);if(!dest)return null;
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
   if(dest!==record.dest&&await fs.stat(dest).then(()=>true,()=>false))throw Error('An output file already exists: '+path.basename(dest)+'. Choose a different output name.');
   files.push({file,dest});
  }
  for(const {file,dest}of files){if(ctx.cancelled?.())throw Error('Processing cancelled.');const temp=dest+'.videovisor-'+Date.now()+'.tmp';try{await fs.copyFile(file,temp);await fs.rename(temp,dest);}finally{await fs.rm(temp,{force:true});}}
  return {...result,paths:files.map(f=>f.dest)};
 }finally{await fs.rm(stage,{recursive:true,force:true});}
}
module.exports={processTool,pages};

