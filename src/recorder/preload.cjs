const {contextBridge,ipcRenderer}=require('electron');
const api={};
for(const name of ['state','sources','area','select-area','cancel-area','prepare','begin','chunk','pause','finish','screenshot','abort','close','show-controls','hide-for-shot','show-error','cancel-processing','screen-access','open-privacy'])api[name]=(...args)=>ipcRenderer.invoke('recorder:'+name,...args);
api.onCommand=fn=>ipcRenderer.on('recorder:command',(_event,command)=>fn(command));
contextBridge.exposeInMainWorld('capture',api);
