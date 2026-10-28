'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{createReadStream,createWriteStream}=require('node:fs'),{pipeline}=require('node:stream/promises'),{Transform}=require('node:stream'),C=require('./core');
const stamp=s=>({size:s.size,date:s.mtimeMs,dir:s.isDirectory()});
const same=(a,b)=>a.size===b.size&&a.date===b.date&&a.dir===b.dir;
async function freeName(dest){const ext=path.extname(dest),base=dest.slice(0,dest.length-ext.length);for(let i=2;i<100000;i++){const p=base+' ('+i+')'+ext;if(!await C.exists(p))return p;}throw Error('Не удалось подобрать свободное имя.');}
async function transfer(paths,target,{move=false,signal,onProgress=()=>{},resolveConflict=async()=>({action:'skip'}),onError=()=>{},io={}}={}){
 target=await C.directory(target);if(!Array.isArray(paths)||!paths.length)throw Error('Выберите файлы.');paths=[...new Set(paths.map(C.absolute))];
 for(const p of paths){if(C.inside(await fs.realpath(p),target))throw Error('Нельзя копировать объект в себя.');if(paths.some(q=>q!==p&&C.inside(q,p)))throw Error('Выберите папку или её содержимое, но не оба сразу.');}
 let total=0,completed=0,allPolicy=null;const failures=[],done=[],skipped=[];const plans=[];
 for(const p of paths){const entries=await C.scan(p,signal);total+=entries.reduce((n,e)=>n+(e.dir?0:e.size),0);plans.push({p,entries});}
 const disk=await fs.statfs(target).catch(()=>null);if(disk&&Number(disk.bavail)*Number(disk.bsize)<total)throw Error('Недостаточно свободного места для безопасного копирования.');
 const progress=file=>onProgress({file,completed,total});
 async function copy(src,dest){signal?.throwIfAborted();let source=await fs.lstat(src);if(source.isSymbolicLink())throw Error('Ссылки не копируются.');let before=await fs.lstat(dest).then(stamp,e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(before&&source.isDirectory()&&before.dir){let complete=true;for(const n of await fs.readdir(src))complete=(await copy(path.join(src,n),path.join(dest,n)))&&complete;if(move&&complete)await fs.rmdir(src);return complete;}
  if(before){let decision=allPolicy?{action:allPolicy}:await resolveConflict({source:src,target:dest,sourceInfo:stamp(source),targetInfo:before});signal?.throwIfAborted();if(decision.all)allPolicy=decision.action;if(decision.action==='cancel')throw Object.assign(Error('Операция отменена'),{name:'AbortError'});if(decision.action==='skip'){skipped.push(src);return false;}if(decision.action==='both'){dest=await freeName(dest);before=null;}else if(decision.action!=='replace')throw Error('Неизвестное действие при конфликте.');if(before&&(source.isDirectory()||before.dir))throw Error('Для разных типов объектов выберите «Сохранить оба».');}
  if(source.isDirectory()){await fs.mkdir(dest);let complete=true;for(const n of await fs.readdir(src))complete=(await copy(path.join(src,n),path.join(dest,n)))&&complete;if(move&&complete)await fs.rmdir(src);return complete;}
  const tmp=path.join(path.dirname(dest),'.bitora-'+crypto.randomUUID()),backup=tmp+'.previous';let backed=false,published=false;
  try{const meter=new Transform({transform(chunk,encoding,cb){completed+=chunk.length;progress(src);cb(null,chunk);}});await pipeline((io.read||createReadStream)(src),meter,(io.write||createWriteStream)(tmp,{flags:'wx'}),{signal});signal?.throwIfAborted();const now=await fs.lstat(src);if(!same(stamp(source),stamp(now)))throw Error('Исходник изменился при копировании.');await fs.utimes(tmp,source.atime,source.mtime);
   if(before){const current=stamp(await fs.lstat(dest));if(!same(before,current))throw Error('Файл назначения изменился после подтверждения.');await fs.rename(dest,backup);backed=true;}
   // Hard-link publication is exclusive and cannot overwrite a file created by another process.
   try{await fs.link(tmp,dest);await fs.unlink(tmp);}catch(e){if(e.code==='EEXIST')throw e;if(!['ENOTSUP','EPERM','EXDEV','EOPNOTSUPP'].includes(e.code))throw e;await fs.copyFile(tmp,dest,require('node:fs').constants.COPYFILE_EXCL);await fs.unlink(tmp);}
   published=true;if(backed)await fs.unlink(backup);if(move){if(!same(stamp(source),stamp(await fs.lstat(src))))throw Error('Копия сохранена; исходник изменился и оставлен.');await fs.unlink(src);}done.push(src);return true;
  }catch(e){if(backed&&!published){if(!await C.exists(dest))await fs.rename(backup,dest);else e.message+=' Предыдущая версия сохранена: '+backup;}throw e;}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
 }
 for(const plan of plans){try{await copy(plan.p,path.join(target,path.basename(plan.p)));}catch(e){if(e.name==='AbortError'||signal?.aborted)throw e;failures.push({path:plan.p,message:e.message,code:e.code});onError({path:plan.p,message:e.message,code:e.code});}}
 return {done,skipped,failures};
}
class Queue{
 constructor(notify=()=>{},log=()=>{}){this.notify=notify;this.log=log;this.items=[];this.running=null;this.paused=false;}
 snapshot(){return this.items.map(({id,label,status,progress,error,result,retryOf})=>({id,label,status,progress,error,result,retryOf}));}
 emit(){this.notify(this.snapshot());}
 add(label,fn,retryOf){const item={id:crypto.randomUUID(),label,fn,status:'waiting',retryOf};this.items.push(item);this.emit();this.pump();return item.id;}
 async pump(){if(this.running||this.paused)return;const item=this.items.find(i=>i.status==='waiting');if(!item)return;this.running=item;item.status='running';item.controller=new AbortController();const start=Date.now();let last=0;this.emit();try{item.result=await item.fn(item.controller.signal,p=>{const elapsed=Math.max(.1,(Date.now()-start)/1000),speed=(p.completed||0)/elapsed;item.progress={...p,speed,eta:speed>0?Math.max(0,(p.total-p.completed)/speed):null};if(Date.now()-last>150){last=Date.now();this.emit();}});item.status=item.result?.failures?.length?'failed':'done';if(item.status==='failed')item.error=item.result.failures.map(f=>f.path+': '+f.message).join('\n');}catch(e){item.status=item.controller.signal.aborted||e.name==='AbortError'?'cancelled':'failed';item.error=e.message;}finally{this.log({time:new Date().toISOString(),label:item.label,status:item.status,error:item.error});this.running=null;this.emit();this.pump();}}
 cancel(id){const item=this.items.find(i=>i.id===id);if(item?.status==='waiting')item.status='cancelled';else if(item?.status==='running')item.controller.abort();this.emit();}
 retry(id){const item=this.items.find(i=>i.id===id);if(!item||!['failed','cancelled'].includes(item.status))throw Error('Повтор доступен для неудачных и отменённых задач.');return this.add(item.label,item.fn,item.id);}
 pause(value){this.paused=!!value;this.emit();if(!this.paused)this.pump();}
}
module.exports={transfer,Queue,freeName,stamp,same};
