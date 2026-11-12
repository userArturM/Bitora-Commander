'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),S=require('../search-sync');
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bitora-sync-qa-')),left=path.join(root,'left'),right=path.join(root,'right');
 await Promise.all([fs.mkdir(left),fs.mkdir(right)]);
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 return {root,left,right};
}
test('sync validates whole action set before modifying files',async t=>{
 const {left,right}=await fixture(t);
 await fs.writeFile(path.join(left,'alpha.txt'),'source');
 const plan=await S.compare(left,right),index=plan.rows.findIndex(x=>x.relative==='alpha.txt');
 await assert.rejects(S.apply(plan,[{index,direction:'lr'},{index,direction:'delete-left'}]),/Повторное действие/);
 await assert.rejects(S.apply(plan,[{index:999,direction:'lr'}]),/Недопустимое действие/);
 await assert.rejects(S.apply(plan,[{index,direction:'destroy'}]),/Недопустимое действие/);
 assert.deepEqual(await fs.readdir(right),[]);
});
test('recursive sync detects stale destination and retains both originals',async t=>{
 const {left,right}=await fixture(t);
 await fs.mkdir(path.join(left,'nested'));await fs.mkdir(path.join(right,'nested'));
 await fs.writeFile(path.join(left,'nested','alpha.txt'),'left');
 await fs.writeFile(path.join(right,'nested','alpha.txt'),'right');
 const plan=await S.compare(left,right,{byHash:true}),index=plan.rows.findIndex(x=>x.relative===path.join('nested','alpha.txt'));
 assert.ok(index>=0);
 await fs.writeFile(path.join(right,'nested','alpha.txt'),'changed after comparison');
 await assert.rejects(S.apply(plan,[{index,direction:'lr'}]),/изменилось/);
 assert.equal(await fs.readFile(path.join(right,'nested','alpha.txt'),'utf8'),'changed after comparison');
 assert.equal(await fs.readFile(path.join(left,'nested','alpha.txt'),'utf8'),'left');
});
test('sync cancel before changes retains both folder trees',async t=>{
 const {left,right}=await fixture(t);
 await fs.writeFile(path.join(left,'alpha.txt'),'left');
 const plan=await S.compare(left,right),controller=new AbortController();
 controller.abort();
 await assert.rejects(S.apply(plan,[{index:0,direction:'lr'}],{signal:controller.signal}));
 assert.deepEqual(await fs.readdir(right),[]);
 assert.equal(await fs.readFile(path.join(left,'alpha.txt'),'utf8'),'left');
});
