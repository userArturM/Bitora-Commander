const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),A=require('../archive-plus');
const enabled=process.platform==='win32'||!!process.env.BITORA_7Z;if(process.platform==='win32')A.setBinary(path.join(__dirname,'../tools/7zip/7z.exe'));
async function fixture(t){const r=await fs.mkdtemp(path.join(os.tmpdir(),'archive2-'));t.after(()=>fs.rm(r,{recursive:true,force:true}));return r;}
test('bundled 7-Zip creates 7z and selectively extracts a nested file',{skip:!enabled},async t=>{const r=await fixture(t);await fs.mkdir(path.join(r,'nested'));await fs.writeFile(path.join(r,'nested','данные.txt'),'content');await fs.writeFile(path.join(r,'nested','other.txt'),'other');const archive=path.join(r,'archive.7z');await A.create([path.join(r,'nested')],archive);const entries=await A.list(archive);assert.ok(entries.some(e=>e.name==='nested/данные.txt'));const dest=await A.extract(archive,r,['nested/данные.txt']);assert.equal(await fs.readFile(path.join(dest,'nested','данные.txt'),'utf8'),'content');await assert.rejects(fs.stat(path.join(dest,'nested','other.txt')));});
test('RAR5 listing and extraction with upstream libarchive fixture',{skip:!enabled},async t=>{const r=await fixture(t),text=await fs.readFile(path.join(__dirname,'rar5.uu'),'utf8'),bytes=[];for(const line of text.split('\n').slice(1)){if(line==='end'||!line)break;const count=(line.charCodeAt(0)-32)&63;let out=[];for(let i=1;i<line.length;i+=4){const a=[0,1,2,3].map(j=>(line.charCodeAt(i+j)-32)&63);out.push((a[0]<<2)|(a[1]>>4),((a[1]&15)<<4)|(a[2]>>2),((a[2]&3)<<6)|a[3]);}bytes.push(...out.slice(0,count));}const file=path.join(r,'sample.rar');await fs.writeFile(file,Buffer.from(bytes));const entries=await A.list(file);assert.ok(entries.some(e=>e.name==='helloworld.txt'));const dest=await A.extract(file,r);assert.match(await fs.readFile(path.join(dest,'helloworld.txt'),'utf8'),/hello libarchive/);});

test('corrupted 7z is rejected before extraction directory is published',{skip:!enabled},async t=>{const root=await fixture(t),source=path.join(root,'input.txt'),file=path.join(root,'bad.7z');await fs.writeFile(source,'archive integrity');await A.create([source],file);const data=await fs.readFile(file);await fs.writeFile(file,data.subarray(0,Math.min(data.length,24)));await assert.rejects(A.extract(file,root));assert.equal((await fs.readdir(root)).some(x=>x.endsWith('— распаковано')),false);});

test('archive verification returns integrity and summary',{skip:!enabled},async t=>{const root=await fixture(t),source=path.join(root,'content.txt'),archive=path.join(root,'verify.7z');await fs.writeFile(source,'verified archive');await A.create([source],archive);const result=await A.verify(archive);assert.equal(result.ok,true);assert.ok(result.entries>=1);assert.ok(result.totalBytes>=16);});

test('encrypted 7z uses stdin password and hides file names',{skip:!enabled},async t=>{
 const root=await fixture(t),name=path.join(root,'top-secret.txt'),archive=path.join(root,'locked.7z');
 await fs.writeFile(name,'secret plaintext');
 await A.create([name],archive,{password:'Correct Horse 52'});
 await assert.rejects(A.verify(archive),/7-Zip/);
 await assert.rejects(A.verify(archive,{password:'incorrect'}),/7-Zip/);
 const verified=await A.verify(archive,{password:'Correct Horse 52'});
 assert.equal(verified.ok,true);
 const extracted=await A.extract(archive,root,null,{password:'Correct Horse 52'});
 assert.equal(await fs.readFile(path.join(extracted,'top-secret.txt'),'utf8'),'secret plaintext');
});
test('split archive can be extracted from first volume',{skip:!enabled},async t=>{
 const root=await fixture(t),name=path.join(root,'random.bin'),archive=path.join(root,'parts.7z');
 await fs.writeFile(name,require('node:crypto').randomBytes(2500000));
 const volumes=await A.create([name],archive,{volumeBytes:1024*1024});
 assert.ok(volumes.length>=2);
 assert.ok(volumes.every(v=>/\\.7z\\.\\d{3}$/.test(v)));
 const verified=await A.verify(volumes[0]);
 assert.equal(verified.ok,true);
 const target=await A.extract(volumes[0],root);
 assert.deepEqual(await fs.readFile(path.join(target,'random.bin')),await fs.readFile(name));
});
test('archive password validation rejects newlines and excess input',()=>{
 assert.throws(()=>A.validPassword('line\nbreak'),/пароль/);
 assert.throws(()=>A.validPassword('X'.repeat(513)),/пароль/);
 assert.equal(A.validPassword('simple'),'simple');
});
