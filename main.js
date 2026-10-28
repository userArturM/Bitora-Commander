'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell,Menu,nativeImage}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{pathToFileURL,fileURLToPath}=require('node:url'),{Worker}=require('node:worker_threads'),C=require('./core');
const testing=process.argv.includes('--functional-test')||process.argv.includes('--smoke-test');
if(process.env.PORTABLE_EXECUTABLE_DIR)app.setPath('userData',path.join(process.env.PORTABLE_EXECUTABLE_DIR,'BitoraCommander-Data'));
if(!testing&&!app.requestSingleInstanceLock())app.exit(0);
let win,job=null,config={},configWrite=Promise.resolve();const page=path.join(__dirname,'index.html');
function trusted(e){if(!win||e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame)throw Error('Доступ запрещён');const u=new URL(e.senderFrame.url);if(u.protocol!=='file:'||u.search||u.hash||path.resolve(fileURLToPath(u)).toLowerCase()!==page.toLowerCase())throw Error('Доступ запрещён');}
function handle(name,fn){ipcMain.handle(name,async(e,...args)=>{trusted(e);try{return await fn(...args);}catch(error){if(error.name==='AbortError')throw Error('Операция отменена. Уже завершённые файлы сохранены.');const codes={EACCES:'Нет доступа к файлу или папке.',EPERM:'Операция запрещена или файл занят.',ENOENT:'Файл или папка больше не существует.',ENOSPC:'Недостаточно места на диске.',EBUSY:'Файл используется другой программой.'};throw Error(codes[error.code]||error.message);}});}
const command=c=>win?.webContents.send('command',c);
async function runJob(kind,fn){if(job)throw Error('Дождитесь завершения текущей операции.');const controller=new AbortController();job={kind,controller};win.webContents.send('progress',{kind,started:true});try{return await fn(controller.signal,p=>win.webContents.send('progress',{kind,...p}));}finally{job=null;win.webContents.send('progress',{done:true});}}
function archiveTask(kind,args){return new Promise((resolve,reject)=>{const worker=new Worker(path.join(__dirname,'archive-worker.js'),{workerData:{kind,args}});worker.once('message',m=>m.error?reject(Error(m.error)):resolve(m.result));worker.once('error',reject);worker.once('exit',c=>{if(c)reject(Error('Обработка архива прервана.'));});});}
async function saveConfig(value){config={...config,...value};configWrite=configWrite.catch(()=>{}).then(async()=>{const dest=path.join(app.getPath('userData'),'settings.json');await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest+'.tmp',JSON.stringify(config));await fs.rename(dest+'.tmp',dest);});await configWrite;}
app.whenReady().then(async()=>{
 try{config=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'settings.json'),'utf8'));}catch{}
 win=new BrowserWindow({width:1360,height:880,minWidth:900,minHeight:600,title:'Bitora Commander',autoHideMenuBar:true,backgroundColor:'#111b22',icon:path.join(__dirname,'assets/icon.ico'),webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.on('will-prevent-unload',event=>{const result=dialog.showMessageBoxSync(win,{type:'question',message:'Закрыть без сохранения текста?',buttons:['Отмена','Закрыть'],defaultId:0,cancelId:0});if(result===1)event.preventDefault();});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.session.setPermissionRequestHandler((w,p,cb)=>cb(false));
 Menu.setApplicationMenu(Menu.buildFromTemplate([
 {label:'Файлы',submenu:[{label:'Просмотр',click:()=>command('view')},{label:'Правка',click:()=>command('edit')},{label:'Новая папка',click:()=>command('mkdir')},{type:'separator'},{role:'quit',label:'Выход'}]},
 {label:'Выделение',submenu:[{label:'Выделить всё',click:()=>command('selectAll')},{label:'Снять выделение',click:()=>command('clearSelection')}]},
 {label:'Команды',submenu:[{label:'Копировать',click:()=>command('copy')},{label:'Переместить',click:()=>command('move')},{label:'Переименовать',click:()=>command('rename')},{label:'В корзину',click:()=>command('trash')},{label:'Создать ZIP',click:()=>command('zip')},{label:'Распаковать ZIP',click:()=>command('unzip')}]},
 {label:'Сеть',submenu:[{label:'Открыть папку / сетевой ресурс…',click:()=>command('browse')}]},
 {label:'Вид',submenu:[{label:'Обновить',click:()=>command('refresh')},{label:'Настройки',click:()=>command('settings')},{role:'togglefullscreen',label:'Полный экран'}]},
 {label:'Справка',submenu:[{label:'Горячие клавиши',click:()=>command('help')},{label:'О программе',click:()=>dialog.showMessageBox(win,{message:'Bitora Commander '+app.getVersion(),detail:'Локальный двухпанельный файловый менеджер.\nZIP, UTF-8 редактор, поиск и файловые операции.',buttons:['OK']})}]}]));
 handle('init',async()=>({home:os.homedir(),documents:app.getPath('documents'),downloads:app.getPath('downloads'),version:app.getVersion(),config}));
 handle('list',C.list);handle('roots',async()=>{if(process.platform!=='win32')return ['/'];const roots=await Promise.all('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(async c=>{const p=c+':\\';return await fs.stat(p).then(s=>s.isDirectory()?p:null,()=>null);}));return roots.filter(Boolean);});
 handle('choose',async p=>{const d=await dialog.showOpenDialog(win,{defaultPath:typeof p==='string'?p:undefined,properties:['openDirectory']});return d.canceled?null:d.filePaths[0];});
 handle('config',async patch=>{if(!patch||typeof patch!=='object')return;const next={};if(Array.isArray(patch.paths))next.paths=patch.paths.slice(0,2).map(a=>Array.isArray(a)?a.filter(p=>typeof p==='string'&&path.isAbsolute(p)).slice(0,12):[]);if(Array.isArray(patch.bookmarks))next.bookmarks=patch.bookmarks.filter(p=>typeof p==='string'&&path.isAbsolute(p)).slice(0,30);if(typeof patch.hidden==='boolean')next.hidden=patch.hidden;await saveConfig(next);});
 handle('transfer',(paths,dest,move)=>runJob(move?'move':'copy',(signal,onProgress)=>C.transfer(paths,dest,{move:!!move,signal,onProgress})));
 handle('cancel',()=>{if(job&&['copy','move','search'].includes(job.kind))job.controller.abort();});
 handle('mkdir',(p,n)=>runJob('mkdir',()=>C.mkdir(p,n)));handle('rename',(p,n)=>runJob('rename',()=>C.rename(p,n)));
 handle('trash',paths=>runJob('trash',async()=>{if(!Array.isArray(paths)||!paths.length||paths.length>10000)throw Error('Выберите файлы.');paths=paths.map(C.absolute);if(paths.some(p=>path.parse(p).root===p))throw Error('Нельзя удалить корень диска.');const r=await dialog.showMessageBox(win,{type:'warning',message:'Переместить в корзину: '+paths.length+' объектов?',detail:paths.slice(0,12).join('\n'),buttons:['Отмена','В корзину'],defaultId:0,cancelId:0});if(r.response!==1)return false;for(const p of paths)await shell.trashItem(p);return true;}));
 handle('open',async p=>{p=C.absolute(p);if(/\.(exe|com|bat|cmd|msi|ps1|vbs|js|lnk)$/i.test(p)){const r=await dialog.showMessageBox(win,{type:'question',message:'Запустить этот файл?',detail:p,buttons:['Отмена','Запустить'],cancelId:0,defaultId:0});if(r.response!==1)return;}const e=await shell.openPath(p);if(e)throw Error(e);});
 handle('reveal',p=>shell.showItemInFolder(C.absolute(p)));
 handle('read',C.readText);handle('save',(p,text,hash,bom)=>runJob('save',()=>C.saveText(p,text,hash,bom)));
 handle('image',async p=>{p=C.absolute(p);if(!/\.(png|jpe?g|webp|gif|bmp|ico)$/i.test(p)||(await fs.stat(p)).size>32*1024*1024)throw Error('Просмотр: PNG, JPEG, WebP, GIF, BMP, ICO до 32 МБ.');const image=nativeImage.createFromPath(p);if(image.isEmpty())throw Error('Изображение не распознано.');return image.toDataURL();});
 handle('search',(p,q)=>runJob('search',(signal,onProgress)=>C.search(p,q,{signal,onProgress})));
 handle('archive',(paths,target)=>runJob('zip',()=>archiveTask('create',[paths,target])));
 handle('extract',(p,target)=>runJob('unzip',()=>archiveTask('extract',[p,target])));
 win.on('close',e=>{if(job){e.preventDefault();dialog.showMessageBox(win,{message:'Дождитесь окончания операции или отмените её кнопкой «Отмена».',buttons:['OK']});}});
 require('./features')({win,handle,command,testing});
 await win.loadURL(pathToFileURL(page).href);
 if(testing){const report=process.env.BITORA_TEST_REPORT;try{const result=await require('./qa/functional.cjs')({win,app,C});if(report)await fs.writeFile(report,JSON.stringify(result,null,2));app.exit(0);}catch(e){if(report)await fs.writeFile(report,JSON.stringify({error:e.stack||String(e)}));app.exit(2);}}
}).catch(e=>{dialog.showErrorBox('Bitora Commander',e.message);app.quit();});
app.on('second-instance',()=>{if(win){win.restore();win.show();win.focus();}});app.on('window-all-closed',()=>app.quit());
