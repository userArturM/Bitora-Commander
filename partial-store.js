'use strict';
const fs=require('node:fs'),path=require('node:path');
class PartialStore extends Map{
 constructor(file){super();this.file=file;try{const entries=JSON.parse(fs.readFileSync(file,'utf8'));for(const [key,value]of entries){const parts=JSON.parse(key);if(parts.length!==7||!['download','upload'].includes(value.kind)||typeof value.tmp!=='string'||typeof value.source!=='string')continue;const api=value.kind==='upload'?path.posix:path,dest=parts[6];if(api.dirname(value.tmp)!==api.dirname(dest)||!/^\.bitora-(download|upload)-[0-9a-f-]{36}$/.test(api.basename(value.tmp)))continue;super.set(key,value);}}catch{}}
 persist(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify([...this]),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 set(key,value){super.set(key,value);this.persist();return this;}
 delete(key){const result=super.delete(key);if(result)this.persist();return result;}
}
module.exports=PartialStore;
