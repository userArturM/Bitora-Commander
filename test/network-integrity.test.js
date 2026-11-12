'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{Readable}=require('node:stream'),N=require('../network-files');
test('network download never publishes corrupted bytes with a matching size',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bitora-net-hash-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 let reads=0;
 const client={
  async list(){return [{name:'download.bin',size:4,modifyTime:1000,type:'-'}];},
  createReadStream(){return Readable.from([Buffer.from(reads++===0?'good':'evil')]);}
 };
 const remote={config:{protocol:'sftp',host:'localhost',port:22,user:'test',fingerprint:'trusted'},partials:new Map(),use:fn=>fn(client,true)};
 await assert.rejects(N.download(remote,'/download.bin',dir),/SHA-256/);
 await assert.rejects(fs.stat(path.join(dir,'download.bin')),{code:'ENOENT'});
 assert.equal(reads,2);
 assert.equal(remote.partials.size,1);
});

test('interrupted SFTP download resumes the verified prefix and preserves existing destination',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bitora-net-resume-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const original=Buffer.from('old destination'),full=Buffer.alloc(256*1024,119),dest=path.join(dir,'download.bin');
 await fs.writeFile(dest,original);
 let interrupted=false,starts=[];
 const client={
  async list(){return [{name:'download.bin',size:full.length,modifyTime:1000,type:'-'}];},
  createReadStream(p,options={}){
   const from=options.start||0;
   starts.push(from);
   if(!interrupted){interrupted=true;return Readable.from((async function*(){yield full.subarray(0,32768);throw Object.assign(Error('connection reset'),{code:'ECONNRESET'});})());}
   return Readable.from([full.subarray(from)]);
  }
 };
 const remote={config:{protocol:'sftp',host:'localhost',port:22,user:'test',fingerprint:'trusted'},partials:new Map(),use:fn=>fn(client,true)};
 const before={size:original.length,date:(await fs.stat(dest)).mtimeMs,dir:false,link:false};
 await assert.rejects(N.download(remote,'/download.bin',dir,{replace:true,expected:before}),/connection reset/);
 assert.deepEqual(await fs.readFile(dest),original,'destination must survive interrupted replacement');
 assert.equal(remote.partials.size,1);
 const result=await N.download(remote,'/download.bin',dir,{replace:true,expected:before});
 assert.equal(await fs.realpath(result),await fs.realpath(dest));
 assert.deepEqual(await fs.readFile(dest),full);
 assert.ok(starts.some(x=>x>0&&x<full.length),'transfer must resume from a verified offset');
 assert.equal(remote.partials.size,0);
});
