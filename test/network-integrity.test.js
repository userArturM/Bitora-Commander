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
