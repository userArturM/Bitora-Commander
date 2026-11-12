'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{createReadStream,createWriteStream}=require('node:fs'),{pipeline}=require('node:stream/promises'),{Transform}=require('node:stream'),C=require('./core');
const stamp=s=>({size:s.size,date:s.mtimeMs,dir:s.isDirectory()});
const same=(a,b)=>a.size===b.size&&a.date===b.date&&a.dir===b.dir;
async function freeName(dest){const ext=path.extname(dest),base=dest.slice(0,dest.length-ext.length);for(let i=2;i<100000;i++){const p=base+' ('+i+')'+ext;if(!await C.exists(p))return p;}throw Error('Не удалось подобрать свободное имя.');}
async function transfer(paths,target,{move=false,signal,onProgress=()=>{},resolveConflict=async()=>({action:'skip'}),onError=()=>{},io={},speedLimitMBps=0,resumePartials={},preservePartial=false,onPartial=()=>{}}={}){
 target=await C.directory(target);if(!Array.isArray(paths)||!paths.length)throw Error('Выберите файлы.');paths=[...new Set(paths.map(C.absolute))];
 for(const p of paths){if(C.inside(await fs.realpath(p),target))throw Error('Нельзя копировать объект в себя.');if(paths.some(q=>q!==p&&C.inside(q,p)))throw Error('Выберите папку или её содержимое, но не оба сразу.');}
 const rate=Number(speedLimitMBps);if(!Number.isFinite(rate)||rate<0||rate>1024)throw Error('Некорректный лимит скорости копирования.');
 const bytesPerSecond=rate*1024*1024;let started=0,paced=0;
 async function throttle(bytes){if(!bytesPerSecond)return;if(!started)started=Date.now();paced+=bytes;const due=started+paced/bytesPerSecond*1000;while(Date.now()<due){signal?.throwIfAborted();await signal?.waitIfPaused?.();await new Promise(resolve=>setTimeout(resolve,Math.min(60,Math.max(1,due-Date.now()))));}signal?.throwIfAborted();}
 let total=0,completed=0,allPolicy=null;const failures=[],done=[],skipped=[];const plans=[];
 for(const p of paths){const entries=await C.scan(p,signal);total+=entries.reduce((n,e)=>n+(e.dir?0:e.size),0);plans.push({p,entries});}
 const targetDevice=(await fs.stat(target)).dev;const required=move?(await Promise.all(plans.map(async plan=>(await fs.lstat(plan.p)).dev===targetDevice?0:plan.entries.reduce((n,e)=>n+(e.dir?0:e.size),0)))).reduce((a,b)=>a+b,0):total;const disk=await fs.statfs(target).catch(()=>null);if(disk&&Number(disk.bavail)*Number(disk.bsize)<required)throw Error('Недостаточно свободного места для безопасного копирования.');
 let lastProgressAt=0,lastProgressBytes=0;
 const progress=(file,force=false)=>{const now=Date.now();if(force||completed===total||completed-lastProgressBytes>=1024*1024||now-lastProgressAt>=120){lastProgressAt=now;lastProgressBytes=completed;onProgress({file,completed,total});}};
 async function copy(src,dest){signal?.throwIfAborted();await signal?.waitIfPaused?.();let source=await fs.lstat(src);if(source.isSymbolicLink())throw Error('Ссылки не копируются.');let before=await fs.lstat(dest).then(stamp,e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(before&&source.isDirectory()&&before.dir){let complete=true;for(const n of await fs.readdir(src))complete=(await copy(path.join(src,n),path.join(dest,n)))&&complete;if(move&&complete)await fs.rmdir(src);return complete;}
  if(before){let decision=allPolicy?{action:allPolicy}:await resolveConflict({source:src,target:dest,sourceInfo:stamp(source),targetInfo:before});signal?.throwIfAborted();if(decision.all)allPolicy=decision.action;if(decision.action==='cancel')throw Object.assign(Error('Операция отменена'),{name:'AbortError'});if(decision.action==='skip'){skipped.push(src);return false;}if(decision.action==='both'){dest=await freeName(dest);before=null;}else if(decision.action!=='replace')throw Error('Неизвестное действие при конфликте.');if(before&&(source.isDirectory()||before.dir))throw Error('Для разных типов объектов выберите «Сохранить оба».');}
  if(source.isDirectory()){await fs.mkdir(dest);let complete=true;for(const n of await fs.readdir(src))complete=(await copy(path.join(src,n),path.join(dest,n)))&&complete;if(move&&complete)await fs.rmdir(src);return complete;}
  if(move&&!before&&source.dev===targetDevice&&!io.read&&!io.write){let linked=false;try{await fs.link(src,dest);linked=true;}catch(e){if(!['ENOTSUP','EPERM','EXDEV','EOPNOTSUPP'].includes(e.code))throw e;}if(linked){if(!same(stamp(source),stamp(await fs.lstat(src))))throw Error('Исходник изменился; обе копии сохранены.');await fs.unlink(src);completed+=source.size;progress(src);done.push(src);return true;}}
  const resumePath=resumePartials[src];const tmp=resumePath?await fs.realpath(resumePath):path.join(path.dirname(dest),preservePartial?'.bitora-local-deadbeef-'+crypto.randomUUID()+'.partial':'.bitora-'+crypto.randomUUID()),backup=tmp+'.previous';let backed=false,published=false,offset=0;
  if(resumePath){if(io.read||io.write)throw Error('Возобновление доступно только для локальных файлов.');const check=await require('./resume-local').verifyPartial(src,dest,tmp,signal);offset=check.offset;completed+=offset;progress(src,true);}
  try{const meter=new Transform({transform(chunk,encoding,cb){Promise.resolve(signal?.waitIfPaused?.()).then(()=>{signal?.throwIfAborted();return throttle(chunk.length).then(()=>{completed+=chunk.length;progress(src);cb(null,chunk);});}).catch(cb);}});await pipeline((io.read||((p)=>createReadStream(p,{start:offset})))(src),meter,(io.write||((p)=>createWriteStream(p,resumePath?{flags:'a'}:{flags:'wx'})))(tmp),{signal});signal?.throwIfAborted();const now=await fs.lstat(src);if(!same(stamp(source),stamp(now)))throw Error('Исходник изменился при копировании.');await fs.utimes(tmp,source.atime,source.mtime);
   // Verify staging bytes before publishing or deleting the original.
   // Skip injected streams used by fault-injection tests; actual filesystem reads are checked.
   if(!io.read&&!io.write){const hashFile=async p=>{const hash=crypto.createHash('sha256');for await(const chunk of createReadStream(p)) {signal?.throwIfAborted();hash.update(chunk);}return hash.digest('hex');};const sourceHash=await hashFile(src),targetHash=await hashFile(tmp);if(sourceHash!==targetHash)throw Error('Контрольная сумма SHA-256 не совпала. Исходный файл сохранён.');if(!same(stamp(source),stamp(await fs.lstat(src))))throw Error('Исходник изменился при проверке SHA-256.');}
   if(before){const current=stamp(await fs.lstat(dest));if(!same(before,current))throw Error('Файл назначения изменился после подтверждения.');await fs.rename(dest,backup);backed=true;}
   // Hard-link publication is exclusive and cannot overwrite a file created by another process.
   try{await fs.link(tmp,dest);await fs.unlink(tmp);}catch(e){if(e.code==='EEXIST')throw e;if(!['ENOTSUP','EPERM','EXDEV','EOPNOTSUPP'].includes(e.code))throw e;await fs.copyFile(tmp,dest,require('node:fs').constants.COPYFILE_EXCL);await fs.unlink(tmp);}
   published=true;if(backed)await fs.unlink(backup);if(move){if(!same(stamp(source),stamp(await fs.lstat(src))))throw Error('Копия сохранена; исходник изменился и оставлен.');await fs.unlink(src);}progress(src,true);done.push(src);return true;
  }catch(e){if(backed&&!published){if(!await C.exists(dest))await fs.rename(backup,dest);else e.message+=' Предыдущая версия сохранена: '+backup;}throw e;}finally{if(published||(!resumePath&&!preservePartial))await fs.rm(tmp,{force:true}).catch(()=>{});else if(preservePartial&&!published){const st=await fs.stat(tmp).catch(()=>null);if(st?.size>0)await onPartial({source:src,destination:dest,temporary:tmp,size:st.size,move});}}
 }
 for(const plan of plans){try{await copy(plan.p,path.join(target,path.basename(plan.p)));}catch(e){if(e.name==='AbortError'||signal?.aborted)throw e;failures.push({path:plan.p,message:e.message,code:e.code});onError({path:plan.p,message:e.message,code:e.code});}}
 return {done,skipped,failures};
}
class Queue{
 constructor(notify=()=>{},log=()=>{}){this.notify=notify;this.log=log;this.items=[];this.active=new Set();this.running=null;this.paused=false;this.concurrency=1;}
 snapshot(){return this.items.map(({id,label,status,progress,error,result,retryOf,priority})=>({id,label,status,progress,error,result,retryOf,priority}));}
 emit(){this.notify(this.snapshot());while(this.items.length>200){const index=this.items.findIndex(i=>!this.active.has(i)&&!['waiting','running'].includes(i.status));if(index<0)break;this.items.splice(index,1);}}
 add(label,fn,retryOf,priority=0,resource=null){if(![-1,0,1].includes(priority))throw Error('Недопустимый приоритет задачи.');const item={id:crypto.randomUUID(),label,fn,status:'waiting',retryOf,priority,resource};this.items.push(item);this.emit();this.pump();return item.id;}
 setConcurrency(value){if(!Number.isInteger(value)||value<1||value>4)throw Error('Количество одновременных операций должно быть от 1 до 4.');this.concurrency=value;this.pump();return value;}
 conflict(item){
  const normalize=value=>typeof value==='string'?{reads:[],writes:[value]}:value;
  const overlaps=(a,b)=>C.inside(a,b)||C.inside(b,a);
  const a=normalize(item.resource);
  return [...this.active].some(current=>{
   const b=normalize(current.resource);
   if(!a||!b)return true;
   if(!Array.isArray(a.reads)||!Array.isArray(a.writes)||!Array.isArray(b.reads)||!Array.isArray(b.writes))return true;
   return a.writes.some(p=>[...b.reads,...b.writes].some(q=>overlaps(p,q)))||
    b.writes.some(p=>a.reads.some(q=>overlaps(p,q)));
  });
 }
 pump(){if(this.paused)return;while(this.active.size<this.concurrency){const item=this.items.filter(i=>i.status==='waiting'&&!this.conflict(i)).sort((a,b)=>b.priority-a.priority)[0];if(!item)break;this.run(item);}}
 async run(item){this.active.add(item);this.running=item;item.status='running';item.controller=new AbortController();item.controller.signal.waitIfPaused=()=>this.waitIfPaused(item.controller.signal);const start=Date.now();let last=0;this.emit();try{item.result=await item.fn(item.controller.signal,p=>{const elapsed=Math.max(.1,(Date.now()-start)/1000),speed=(p.completed||0)/elapsed;item.progress={...p,speed,eta:speed>0?Math.max(0,(p.total-p.completed)/speed):null};if(Date.now()-last>150){last=Date.now();this.emit();}});item.status=item.result?.failures?.length?'failed':'done';if(item.status==='failed')item.error=item.result.failures.map(f=>f.path+': '+f.message).join('\n');}catch(e){item.status=item.controller.signal.aborted||e.name==='AbortError'?'cancelled':'failed';item.error=e.message;}finally{this.log({time:new Date().toISOString(),label:item.label,status:item.status,error:item.error});this.active.delete(item);this.running=this.active.values().next().value||null;this.emit();this.pump();}}
 clearFinished(){const before=this.items.length;this.items=this.items.filter(i=>['waiting','running'].includes(i.status));this.emit();return before-this.items.length;}
 setPriority(id,priority){if(![-1,0,1].includes(priority))throw Error('Недопустимый приоритет задачи.');const item=this.items.find(i=>i.id===id);if(!item||item.status!=='waiting')throw Error('Приоритет можно изменить только для ожидающей задачи.');item.priority=priority;this.emit();return true;}
 cancel(id){const item=this.items.find(i=>i.id===id);if(item?.status==='waiting')item.status='cancelled';else if(item?.status==='running')item.controller.abort();this.emit();}
 retry(id){const item=this.items.find(i=>i.id===id);if(!item||!['failed','cancelled'].includes(item.status))throw Error('Повтор доступен для неудачных и отменённых задач.');if(this.items.some(i=>i.retryOf===item.id&&['waiting','running'].includes(i.status)))throw Error('Повтор этой задачи уже выполняется.');return this.add(item.label,item.fn,item.id,item.priority,item.resource);}
 async waitIfPaused(signal){while(this.paused){signal?.throwIfAborted();await new Promise((resolve,reject)=>{const wake=()=>{signal?.removeEventListener('abort',abort);this.waiters?.delete(wake);resolve();},abort=()=>{this.waiters?.delete(wake);reject(signal.reason);};(this.waiters??=new Set()).add(wake);signal?.addEventListener('abort',abort,{once:true});});}signal?.throwIfAborted();}
 pause(value){this.paused=!!value;if(!this.paused)for(const wake of this.waiters||[])wake();this.emit();if(!this.paused)this.pump();}
}
module.exports={transfer,Queue,freeName,stamp,same};
