'use strict';
// Run with: node qa/stress-directories.cjs --count 10000
// Optional: --count 50000 or --count 100000 for extended release qualification.
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../core');
async function main(){
 const index=process.argv.indexOf('--count'),count=index<0?10000:Number(process.argv[index+1]);
 if(![10000,50000,100000].includes(count))throw Error('Use --count 10000, 50000, or 100000');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bitora-directory-load-'));
 const record={count,platform:process.platform,node:process.version,steps:[]};
 const measure=async(label,fn)=>{
  const start=process.hrtime.bigint(),before=process.memoryUsage().heapUsed;
  const result=await fn();
  record.steps.push({label,ms:Math.round(Number(process.hrtime.bigint()-start)/1e6),heapDeltaMiB:Math.round((process.memoryUsage().heapUsed-before)/1024/1024)});
  return result;
 };
 try{
  const chunk=200;
  await measure('create',async()=>{for(let first=0;first<count;first+=chunk){
   await Promise.all(Array.from({length:Math.min(chunk,count-first)},(_,i)=>{
    const n=String(first+i).padStart(6,'0');
    return fs.writeFile(path.join(root,'file-'+n+'.txt'),'content-'+n);
   }));
  }});
  const listing=await measure('list',()=>C.list(root));
  assert.equal(listing.items.length,count,'listing lost files');
  const sample=new Set(listing.items.map(x=>x.name));
  assert.equal(sample.size,count,'duplicate entries detected');
  for(const n of [0,Math.floor(count/2),count-1])
   assert.ok(sample.has('file-'+String(n).padStart(6,'0')+'.txt'));
  const last='file-'+String(count-1).padStart(6,'0')+'.txt';
  const search=await measure('search-last-file',()=>C.search(root,last));
  assert.equal(search.results.length,1,'search did not find last file');
  assert.equal(search.results[0].name,last);
  await measure('sort',async()=>{const sorted=[...listing.items].sort((a,b)=>a.name.localeCompare(b.name));assert.equal(sorted.length,count);});
  record.peakHeapMiB=Math.round(process.memoryUsage().heapUsed/1024/1024);
  process.stdout.write(JSON.stringify(record,null,2)+'\n');
 }finally{await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
