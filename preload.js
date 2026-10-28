const {contextBridge,ipcRenderer}=require('electron');
const methods=['init','list','roots','choose','config','transfer','cancel','mkdir','rename','trash','open','reveal','read','save','image','search','archive','extract'];
const api={};for(const name of methods)api[name]=(...args)=>ipcRenderer.invoke(name,...args);
api.onProgress=fn=>ipcRenderer.on('progress',(_,p)=>fn(p));api.onCommand=fn=>ipcRenderer.on('command',(_,c)=>fn(c));
contextBridge.exposeInMainWorld('commander',api);
