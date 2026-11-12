'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),PartialStore=require('../partial-store');
test('network transfer checkpoints survive process-style store reinitialization',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bitora-partial-restart-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const location=path.join(root,'partials.json'),target=path.join(root,'download.bin'),tmp=path.join(root,'.bitora-download-'+crypto.randomUUID());
 const id=JSON.stringify(['sftp','example.test',22,'user','pinned','/remote/download.bin',target]);
 const record={kind:'download',source:'stat',tmp};
 const first=new PartialStore(location);first.set(id,record);
 const second=new PartialStore(location);
 assert.deepEqual(second.get(id),record);
 assert.equal((await fs.stat(location)).isFile(),true);
 await assert.rejects(fs.stat(location+'.tmp'),{code:'ENOENT'});
 second.delete(id);
 const third=new PartialStore(location);assert.equal(third.size,0);
});
