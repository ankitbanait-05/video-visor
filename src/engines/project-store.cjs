'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {recoverWorkspace}=require('./timeline-retime.js');
function createProjectStore(file){
 let chain=Promise.resolve(),loaded=false,recovery=null;
 async function atomic(text){const temp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,text,{mode:0o600});await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(()=>{});}}
 return{
  async load(){
   let raw;
   try{raw=await fs.readFile(file,'utf8');}catch(e){if(e.code==='ENOENT'){loaded=true;return null;}throw e;}
   let data;try{data=JSON.parse(raw);}catch{throw Error('The saved workspace could not be read. It has been kept unchanged. Please keep projects.json for recovery.');}
   const report=recoverWorkspace(data);
   if(report.removed){
    const backup=path.join(path.dirname(file),'projects-before-recovery-'+Date.now()+'-'+randomUUID()+'.json');
    // Do not replace the original unless its exact contents are safely backed up.
    await fs.writeFile(backup,raw,{flag:'wx',mode:0o600});
    await atomic(JSON.stringify(data));recovery={...report,backup};
   }
   loaded=true;return data;
  },
  save(data){
   if(!loaded)return Promise.reject(Error('Workspace has not loaded. Saving is paused to protect your projects.'));
   const text=JSON.stringify(data);
   if(text.length>20e6)return Promise.reject(Error('Project storage limit reached'));
   chain=chain.catch(()=>{}).then(()=>atomic(text));return chain;
  },
  flush:()=>chain,
  recovery:()=>recovery
 };
}
module.exports={createProjectStore};
