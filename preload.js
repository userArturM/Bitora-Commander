const {contextBridge,ipcRenderer}=require('electron');
const methods=['init','list','roots','choose','config','transfer','cancel','mkdir','rename','trash','open','reveal','read','save','image','search','archive','extract','enqueueTransfer','queueList','queueCancel','queueRetry','queuePause','operationLog','watch','attributes','icons','properties','openWith','copyPath','fileClipboard','pasteFiles','context','searchAdvanced','searchCancel','searchPresets','saveSearch','deleteSearch','compare','sync','archiveList','archiveExtract','archiveCreate','profiles','profileDelete','connect','remoteList','disconnect','remoteDownload','remoteUpload','remoteMkdir','updates','openRelease'];
const api={};for(const name of methods)api[name]=(...args)=>ipcRenderer.invoke(name,...args);
api.onProgress=fn=>ipcRenderer.on('progress',(_,p)=>fn(p));api.onCommand=fn=>ipcRenderer.on('command',(_,c)=>fn(c));
api.onQueue=fn=>ipcRenderer.on('queue',(_,v)=>fn(v));api.onFolderChanged=fn=>ipcRenderer.on('folderChanged',(_,v)=>fn(v));
api.droppedFiles=files=>Array.from(files).map(file=>require('electron').webUtils.getPathForFile(file));
contextBridge.exposeInMainWorld('commander',api);
