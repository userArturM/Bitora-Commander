'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto'),O=require('../operations');
async function main(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bitora-stress-transfer-')),src=path.join(root,'source'),dest=path.join(root,'target');
 const count=2000,start=Date.now(),snap=[];
 try{
  await Promise.all([fs.mkdir(src),fs.mkdir(dest)]);
  for(let first=0;first<count;first+=100)await Promise.all(Array.from({length:Math.min(count-first,100)},(_,i)=>{
   const index=first+i;
   return fs.writeFile(path.join(src,'sample-'+String(index).padStart(5,'0')+'.bin'),crypto.createHash('sha256').update(String(index)).digest());
  }));
  await fs.writeFile(path.join(src,'big.bin'),crypto.randomBytes(24*1024*1024));
  let progress=0;
  const result=await O.transfer([src],dest,{onProgress:p=>{progress=Math.max(progress,p.completed);}});
  assert.deepEqual(result.failures,[]);
  const copied=path.join(dest,'source');
  const files=await fs.readdir(copied);
  assert.equal(files.length,count+1);
  for(const i of [0,1,100,200,1000,1999]){
   const name='sample-'+String(i).padStart(5,'0')+'.bin';
   assert.deepEqual(await fs.readFile(path.join(src,name)),await fs.readFile(path.join(copied,name)));
  }
  const digest=async file=>{const h=crypto.createHash('sha256');for await(const chunk of require('node:fs').createReadStream(file))h.update(chunk);return h.digest('hex');};
  assert.equal(await digest(path.join(src,'big.bin')),await digest(path.join(copied,'big.bin')));
  assert.ok(progress>=24*1024*1024);
  console.log(JSON.stringify({status:'passed',files:count+1,bytes:progress,elapsedMs:Date.now()-start,heapMiB:Math.round(process.memoryUsage().heapUsed/1024/1024)}));
 }finally{await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
