const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),R=require('../resume-local');
test('verifyPartial accepts identical prefix and rejects mismatched bytes',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bitora-resume-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=path.join(root,'source.bin'),dest=path.join(root,'dest.bin'),tmp=path.join(root,'.bitora-local-deadbeef-123e4567-e89b-12d3-a456-426614174000.partial');
 await fs.writeFile(source,Buffer.from('abcdefghij'));await fs.writeFile(tmp,Buffer.from('abcde'));
 assert.deepEqual((await R.verifyPartial(source,dest,tmp)).offset,5);
 await fs.writeFile(tmp,'abXde');await assert.rejects(R.verifyPartial(source,dest,tmp),/SHA-256/);
 await assert.rejects(R.verifyPartial(source,dest,path.join(root,'arbitrary.partial')),/пути/);
 await fs.writeFile(tmp,'abcdefghijklmnop');await assert.rejects(R.verifyPartial(source,dest,tmp),/не соответствует/);
});
test('prefixHash rejects invalid size and supports zero bytes',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bitora-resume-hash-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=path.join(root,'file');await fs.writeFile(source,'data');
 await assert.rejects(R.prefixHash(source,-1),/размер/);
 assert.equal((await R.prefixHash(source,0)).length,64);
 await assert.rejects(R.prefixHash(source,10),/усечён/);
});
