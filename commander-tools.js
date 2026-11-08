'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),C=require('./core');
async function chunk(file,offset=0,encoding='utf-8'){
 file=C.absolute(file);if(!Number.isSafeInteger(offset)||offset<0)throw Error('Некорректное смещение.');if(!['utf-8','windows-1251','utf-16le','utf-16be','hex'].includes(encoding))throw Error('Неизвестная кодировка.');
 const h=await fs.open(file,'r');try{const s=await h.stat();if(!s.isFile())throw Error('Выберите обычный файл.');const length=Math.min(65536,Math.max(0,s.size-offset)),b=Buffer.alloc(length);const {bytesRead}=await h.read(b,0,length,offset),data=b.subarray(0,bytesRead);let text;
 if(encoding==='hex'){text=Array.from({length:Math.ceil(data.length/16)},(_,i)=>{const a=data.subarray(i*16,i*16+16);return (offset+i*16).toString(16).padStart(12,'0')+'  '+[...a].map(v=>v.toString(16).padStart(2,'0')).join(' ').padEnd(47)+'  '+[...a].map(v=>v>=32&&v<127?String.fromCharCode(v):'.').join('');}).join('\n');}else{text=new TextDecoder(encoding).decode(data);}
 return {text,size:s.size,offset,bytesRead,next:offset+bytesRead};
 }finally{await h.close();}
}
async function branch(root){const entries=await C.scan(await C.directory(root));return entries.filter(e=>!e.dir).map(e=>({...e,name:path.relative(root,e.path),ext:path.extname(e.path).slice(1).toLowerCase(),hidden:path.basename(e.path).startsWith('.')}));}
module.exports={chunk,branch};
