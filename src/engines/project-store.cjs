'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {recoverWorkspace}=require('./timeline-retime.js');
// 0.15 (PR-02, PR-05): saving never fails silently and a damaged workspace can be restored.
//  - The limit is 100 MB (was 20 MB, reached with long recordings' cursor tracks and transcripts); from 25 MB each
//    save reports the size so the app can suggest tidying up.
//  - A failed save is remembered: flush() (used when quitting) rejects, so the app warns instead of quitting quietly.
//  - A backup copy is refreshed at most every 10 minutes; a workspace that can't be read can be restored from it,
//    or set aside so the app starts fresh. Nothing is deleted.
const LIMIT=100e6,WARN=25e6,BACKUP_EVERY=10*60e3;
function createProjectStore(file){
 let chain=Promise.resolve(),loaded=false,recovery=null,lastError=null,lastBackup=0;
 const backupFile=path.join(path.dirname(file),'projects-backup.json');
 async function atomic(target,text){const temp=target+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,text,{mode:0o600});await fs.rename(temp,target);}finally{await fs.unlink(temp).catch(()=>{});}}
 async function readable(target){try{JSON.parse(await fs.readFile(target,'utf8'));return true;}catch{return false;}}
 return{
  async load(){
   let raw;
   try{raw=await fs.readFile(file,'utf8');}catch(e){if(e.code==='ENOENT'){loaded=true;return null;}throw e;}
   let data;try{data=JSON.parse(raw);}catch{throw Error('The saved workspace could not be read. It has been kept unchanged.');}
   const report=recoverWorkspace(data);
   if(report.removed){
    const backup=path.join(path.dirname(file),'projects-before-recovery-'+Date.now()+'-'+randomUUID()+'.json');
    // Do not replace the original unless its exact contents are safely backed up.
    await fs.writeFile(backup,raw,{flag:'wx',mode:0o600});
    await atomic(file,JSON.stringify(data));recovery={...report,backup};
   }
   loaded=true;return data;
  },
  save(data){
   if(!loaded)return Promise.reject(Error('Workspace has not loaded. Saving is paused to protect your projects.'));
   const text=JSON.stringify(data);
   if(text.length>LIMIT){lastError=Error('Your projects are too large to save ('+Math.round(text.length/1e6)+' MB). Delete projects you no longer need, then try again.');return Promise.reject(lastError);}
   chain=chain.catch(()=>{}).then(async()=>{
    await atomic(file,text);lastError=null;
    if(Date.now()-lastBackup>BACKUP_EVERY){lastBackup=Date.now();await atomic(backupFile,text).catch(()=>{});}
    return {size:text.length,large:text.length>WARN};
   }).catch(e=>{lastError=e;throw e;});
   return chain;
  },
  flush:()=>chain.catch(()=>{}).then(()=>{if(lastError)throw lastError;}),
  recovery:()=>recovery,
  // For the "could not open" screen.
  async info(){return {backup:await readable(backupFile)};},
  async restore(mode){
   const aside=path.join(path.dirname(file),'projects-damaged-'+Date.now()+'.json');
   await fs.rename(file,aside).catch(e=>{if(e.code!=='ENOENT')throw e;});
   if(mode==='backup'){if(!await readable(backupFile))throw Error('The backup could not be read.');await fs.copyFile(backupFile,file);}
   return {aside};
  }
 };
}
module.exports={createProjectStore};
