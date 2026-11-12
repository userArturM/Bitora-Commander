const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{Writable,Readable}=require('node:stream'),O=require('../operations'),S=require('../search-sync');
async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'commander-v2-')),src=path.join(root,'src'),dest=path.join(root,'dest');await fs.mkdir(src);await fs.mkdir(dest);t.after(()=>fs.rm(root,{force:true,recursive:true}));return {root,src,dest};}
const put=(d,n,s)=>fs.writeFile(path.join(d,n),s),get=(d,n)=>fs.readFile(path.join(d,n),'utf8');
test('conflict replace, skip, keep both and apply to all',async t=>{const {src,dest}=await setup(t);for(const n of ['a','b']){await put(src,n,'new');await put(dest,n,'old');}let prompts=0;await O.transfer([path.join(src,'a'),path.join(src,'b')],dest,{resolveConflict:async()=>{prompts++;return {action:'replace',all:true};}});assert.equal(prompts,1);assert.equal(await get(dest,'a'),'new');await put(src,'a','changed');await O.transfer([path.join(src,'a')],dest,{resolveConflict:async()=>({action:'skip'})});assert.equal(await get(dest,'a'),'new');await O.transfer([path.join(src,'a')],dest,{resolveConflict:async()=>({action:'both'})});assert.equal(await get(dest,'a (2)'),'changed');});
test('disk-full injection preserves destination and source, cleans staging',async t=>{const {src,dest}=await setup(t);await put(src,'a','new');await put(dest,'a','old');const r=await O.transfer([path.join(src,'a')],dest,{resolveConflict:async()=>({action:'replace'}),io:{write:()=>new Writable({write(c,e,cb){cb(Object.assign(Error('disk full'),{code:'ENOSPC'}));}})}});assert.equal(r.failures[0].code,'ENOSPC');assert.equal(await get(dest,'a'),'old');assert.equal(await get(src,'a'),'new');assert.deepEqual(await fs.readdir(dest),['a']);});
test('network-read interruption preserves original during move',async t=>{const {src,dest}=await setup(t);await put(src,'a','original');const r=await O.transfer([path.join(src,'a')],dest,{move:true,io:{read:()=>new Readable({read(){this.destroy(Object.assign(Error('connection reset'),{code:'ECONNRESET'}));}})}});assert.equal(r.failures[0].code,'ECONNRESET');assert.equal(await get(src,'a'),'original');assert.deepEqual(await fs.readdir(dest),[]);});
test('large-file streaming progress and cancellation',async t=>{const {src,dest}=await setup(t),file=path.join(src,'large.bin');const f=await fs.open(file,'w');await f.truncate(128*1024*1024);await f.close();const abort=new AbortController();let bytes=0;await assert.rejects(O.transfer([file],dest,{move:true,io:{read:require('node:fs').createReadStream},signal:abort.signal,onProgress:p=>{bytes=p.completed;if(bytes>=1024*1024)abort.abort();}}));assert.ok(bytes>=1024*1024);assert.equal((await fs.stat(file)).size,128*1024*1024);assert.deepEqual(await fs.readdir(dest),[]);});
test('directory merge keeps skipped move sources',async t=>{const {src,dest}=await setup(t);await fs.mkdir(path.join(src,'folder'));await fs.mkdir(path.join(dest,'folder'));await put(path.join(src,'folder'),'a','new');await put(path.join(dest,'folder'),'a','old');await put(path.join(src,'folder'),'b','copy');const r=await O.transfer([path.join(src,'folder')],dest,{move:true});assert.equal(r.skipped.length,1);assert.equal(await get(path.join(src,'folder'),'a'),'new');assert.equal(await get(path.join(dest,'folder'),'b'),'copy');});
test('queue serializes, pauses, cancels waiting tasks and retries failures',async()=>{let attempts=0;const q=new O.Queue();q.pause(true);const id=q.add('retry',async()=>{if(++attempts===1)throw Error('once');return 'ok';});const cancelled=q.add('cancel',async()=>assert.fail());q.cancel(cancelled);assert.equal(q.running,null);q.pause(false);for(let i=0;i<100&&q.running;i++)await new Promise(r=>setTimeout(r,5));assert.equal(q.items[0].status,'failed');q.retry(id);for(let i=0;i<100&&q.running;i++)await new Promise(r=>setTimeout(r,5));assert.equal(q.items[2].status,'done');assert.equal(attempts,2);});
test('advanced search combines extension, size, date and content',async t=>{const {src}=await setup(t);await put(src,'report.txt','Hello Мир');await put(src,'report.csv','Hello Мир');await put(src,'other.txt','no');const r=await S.search(src,'report',{extensions:'txt',content:'мир',minSize:3,maxSize:100,after:'2000-01-01'});assert.equal(r.results.length,1);assert.equal(r.results[0].name,'report.txt');});
test('hash comparison detects equal size different content and sync rechecks stale plans',async t=>{const {src,dest}=await setup(t);await put(src,'a','new');await put(dest,'a','old');const time=new Date('2025-01-01');await fs.utimes(path.join(src,'a'),time,time);await fs.utimes(path.join(dest,'a'),time,time);const plan=await S.compare(src,dest,{byHash:true});assert.equal(plan.rows.length,1);await put(dest,'a','changed-after-plan');await assert.rejects(S.apply(plan,[{index:0,direction:'lr'}]),/изменилось/);assert.equal(await get(dest,'a'),'changed-after-plan');});
test('sync copies chosen direction without deleting destination-only files',async t=>{const {src,dest}=await setup(t);await put(src,'a','copy');await put(dest,'keep','keep');const plan=await S.compare(src,dest);const index=plan.rows.findIndex(r=>r.relative==='a');await S.apply(plan,[{index,direction:'lr'}]);assert.equal(await get(dest,'a'),'copy');assert.equal(await get(dest,'keep'),'keep');});
test('changed destination after conflict confirmation is never overwritten',async t=>{const {src,dest}=await setup(t);await put(src,'a','new');await put(dest,'a','old');const r=await O.transfer([path.join(src,'a')],dest,{resolveConflict:async()=>{await put(dest,'a','external modification');return {action:'replace'};}});assert.equal(r.failures.length,1);assert.equal(await get(dest,'a'),'external modification');});
test('successful 128MB streaming copy has identical hash',async t=>{const {src,dest}=await setup(t),file=path.join(src,'large.bin'),f=await fs.open(file,'w');await f.truncate(128*1024*1024);await f.write(Buffer.from('begin'),0,5,0);await f.write(Buffer.from('end'),0,3,128*1024*1024-3);await f.close();let max=0;const r=await O.transfer([file],dest,{onProgress:p=>max=Math.max(max,p.completed)});assert.equal(r.failures.length,0);assert.equal(max,128*1024*1024);async function hash(p){const h=require('node:crypto').createHash('sha256');for await(const b of require('node:fs').createReadStream(p))h.update(b);return h.digest('hex');}assert.equal(await hash(file),await hash(path.join(dest,'large.bin')));});
test('queue rejects duplicate retries while a retry clone is active',async()=>{const q=new O.Queue();q.pause(true);const id=q.add('dup',async()=>{throw Error('fail');});q.pause(false);for(let i=0;i<100&&q.running;i++)await new Promise(r=>setTimeout(r,5));assert.equal(q.items[0].status,'failed');q.retry(id);assert.throws(()=>q.retry(id),/уже выполняется/);assert.equal(q.items.filter(i=>i.retryOf===id).length,1);});

test('large transfers bound progress notifications and report completion',async t=>{const {src,dest}=await setup(t),file=path.join(src,'progress.bin');await fs.writeFile(file,Buffer.alloc(8*1024*1024));const events=[];const result=await O.transfer([file],dest,{onProgress:p=>events.push(p)});assert.equal(result.failures.length,0);assert.ok(events.length>0);assert.ok(events.length<=12,'too many progress notifications: '+events.length);assert.equal(events.at(-1).completed,8*1024*1024);assert.equal((await fs.stat(path.join(dest,'progress.bin'))).size,8*1024*1024);});

test('SHA-256 verified copy preserves bytes and original',async t=>{const {src,dest}=await setup(t);const file=path.join(src,'verified.bin'),data=Buffer.alloc(1024*1024,173);await fs.writeFile(file,data);const result=await O.transfer([file],dest);assert.deepEqual(result.failures,[]);assert.deepEqual(await fs.readFile(path.join(dest,'verified.bin')),data);assert.deepEqual(await fs.readFile(file),data);});

test('bandwidth limit paces local copy and preserves contents',async t=>{const {src,dest}=await setup(t);const file=path.join(src,'limited.bin');await fs.writeFile(file,Buffer.alloc(256*1024,97));const start=Date.now();const result=await O.transfer([file],dest,{speedLimitMBps:1});assert.deepEqual(result.failures,[]);assert.ok(Date.now()-start>=180,'transfer completed before bandwidth delay');assert.deepEqual(await fs.readFile(path.join(dest,'limited.bin')),await fs.readFile(file));});
test('bandwidth limit can be aborted without publishing a partial file',async t=>{const {src,dest}=await setup(t),file=path.join(src,'limited-abort.bin');await fs.writeFile(file,Buffer.alloc(1024*1024));const controller=new AbortController();setTimeout(()=>controller.abort(),80);await assert.rejects(O.transfer([file],dest,{speedLimitMBps:0.25,signal:controller.signal}));assert.deepEqual(await fs.readdir(dest),[]);});

test('waiting queue priorities execute high before low without interrupting current work',async()=>{const seen=[],q=new O.Queue();q.pause(true);const make=label=>async()=>{seen.push(label);};const low=q.add('low',make('low'));const high=q.add('high',make('high'));assert.equal(q.setPriority(high,1),true);assert.equal(q.setPriority(low,-1),true);q.pause(false);for(let n=0;n<100&&q.snapshot().some(i=>['waiting','running'].includes(i.status));n++)await new Promise(r=>setTimeout(r,5));assert.deepEqual(seen,['high','low']);assert.equal(q.snapshot().find(i=>i.id===high).priority,1);await assert.rejects(async()=>q.setPriority(high,0),/ожидающей/);});

test('verified partial is resumed and atomically published',async t=>{const {src,dest}=await setup(t);const file=path.join(src,'partial.bin'),target=path.join(dest,'partial.bin'),tmp=path.join(dest,'.bitora-local-deadbeef-123e4567-e89b-12d3-a456-426614174000.partial');const data=Buffer.alloc(1024*1024,79);await fs.writeFile(file,data);await fs.writeFile(tmp,data.subarray(0,400000));const result=await O.transfer([file],dest,{resumePartials:{[file]:tmp}});assert.deepEqual(result.failures,[]);assert.deepEqual(await fs.readFile(target),data);await assert.rejects(fs.stat(tmp),{code:'ENOENT'});});
test('damaged resume data is never published or deleted',async t=>{const {src,dest}=await setup(t);const file=path.join(src,'damaged.bin'),tmp=path.join(dest,'.bitora-local-deadbeef-123e4567-e89b-12d3-a456-426614174000.partial');await fs.writeFile(file,'valid complete data');await fs.writeFile(tmp,'invalid');const result=await O.transfer([file],dest,{resumePartials:{[file]:tmp}});assert.equal(result.failures.length,1);assert.deepEqual(await fs.readdir(dest),[path.basename(tmp)]);});

test('interrupted local transfer retains verified recovery staging when enabled',async t=>{const {src,dest}=await setup(t);const file=path.join(src,'recoverable.bin');await fs.writeFile(file,Buffer.alloc(1024*1024,42));const controller=new AbortController();const rows=[];setTimeout(()=>controller.abort(),600);await assert.rejects(O.transfer([file],dest,{signal:controller.signal,speedLimitMBps:0.25,preservePartial:true,onPartial:r=>rows.push(r)}));assert.ok(rows.length<=1);if(rows.length){assert.equal(rows[0].source,file);assert.ok(rows[0].size>0);assert.equal((await require('../resume-local').verifyPartial(file,path.join(dest,'recoverable.bin'),rows[0].temporary)).offset,rows[0].size);}else assert.deepEqual(await fs.readdir(dest),[]);});

test('concurrent queue runs independent resources but serializes overlapping destinations',async()=>{
 const q=new O.Queue();q.pause(true);q.setConcurrency(3);let running=0,max=0;const starts=[];
 const task=label=>async()=>{running++;max=Math.max(max,running);starts.push(label);await new Promise(r=>setTimeout(r,60));running--;};
 q.add('a',task('a'),undefined,0,'C:\\files\\a');q.add('same',task('same'),undefined,0,'C:\\files\\a\\nested');q.add('b',task('b'),undefined,0,'D:\\files\\b');
 q.pause(false);for(let n=0;n<100&&q.snapshot().some(x=>['waiting','running'].includes(x.status));n++)await new Promise(r=>setTimeout(r,10));
 assert.equal(max,2);assert.equal(q.snapshot().filter(x=>x.status==='done').length,3);assert.ok(starts.indexOf('same')>starts.indexOf('a'));assert.throws(()=>q.setConcurrency(5),/1 до 4/);
});

test('clearing queue history retains waiting and running tasks',async()=>{
 const q=new O.Queue();q.pause(true);
 const done=q.add('finished',async()=>{});
 q.pause(false);
 for(let i=0;i<100&&q.snapshot().some(x=>x.status==='running'||x.status==='waiting');i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(q.snapshot().find(x=>x.id===done)?.status,'done');
 q.pause(true);
 const waiting=q.add('waiting',async()=>{});
 assert.equal(q.clearFinished(),1);
 assert.equal(q.snapshot().length,1);
 assert.equal(q.snapshot()[0].id,waiting);
 q.cancel(waiting);
 assert.equal(q.clearFinished(),1);
 assert.deepEqual(q.snapshot(),[]);
});

test('clearing finished entries does not cancel an active transfer task',async()=>{
 const q=new O.Queue();let release;const gate=new Promise(resolve=>{release=resolve;});
 const id=q.add('active',async()=>{await gate;return {done:['ok']};});
 assert.equal(q.snapshot().find(x=>x.id===id).status,'running');
 assert.equal(q.clearFinished(),0);
 assert.equal(q.snapshot().length,1);
 release();
 for(let n=0;n<100&&q.snapshot().find(x=>x.id===id)?.status==='running';n++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(q.snapshot().find(x=>x.id===id)?.status,'done');
 assert.equal(q.clearFinished(),1);
});

test('queue prevents a writer racing with another task reading the same file tree',async()=>{
 const q=new O.Queue();q.pause(true);q.setConcurrency(3);
 const activity=[],starts=[],finish=[],events=[];
 const run=label=>async()=>{activity.push(label);starts.push(label);events.push('start-'+label);await new Promise(resolve=>setTimeout(resolve,50));activity.splice(activity.indexOf(label),1);finish.push(label);events.push('end-'+label);};
 q.add('reader',run('reader'),undefined,0,{reads:['C:\\work\\source\\file.bin'],writes:['D:\\output\\a']});
 q.add('writer',run('writer'),undefined,0,{reads:['E:\\other'],writes:['C:\\work\\source']});
 q.add('independent',run('independent'),undefined,0,{reads:['F:\\data'],writes:['G:\\output']});
 q.pause(false);
 for(let n=0;n<100&&q.snapshot().some(x=>['running','waiting'].includes(x.status));n++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(q.snapshot().filter(x=>x.status==='done').length,3);
 assert.ok(starts.indexOf('writer')>starts.indexOf('reader'));
 assert.ok(events.indexOf('end-reader')<events.indexOf('start-writer'));
 assert.ok(events.indexOf('start-independent')<events.indexOf('end-reader'));
});
test('queue permits independent read-only access to the same source',async()=>{
 const q=new O.Queue();q.pause(true);q.setConcurrency(2);let running=0,max=0;
 const fn=async()=>{max=Math.max(max,++running);await new Promise(resolve=>setTimeout(resolve,35));running--;};
 q.add('copy-a',fn,undefined,0,{reads:['C:\\shared\\file'],writes:['D:\\destA']});
 q.add('copy-b',fn,undefined,0,{reads:['C:\\shared\\file'],writes:['E:\\destB']});
 q.pause(false);
 for(let n=0;n<100&&q.snapshot().some(x=>['running','waiting'].includes(x.status));n++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(max,2);
 assert.equal(q.snapshot().filter(x=>x.status==='done').length,2);
});
