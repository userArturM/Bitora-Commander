'use strict';
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const {createReadStream}=require('node:fs');
const {pipeline}=require('node:stream/promises');
const {Writable}=require('node:stream');
const {basename,dirname,join}=require('node:path');
const STAGING=/^\.bitora-local-[0-9a-f]{8}-[0-9a-f-]{36}\.partial$/i;
function validStaging(destination,temporary){
 if(typeof destination!=='string'||typeof temporary!=='string'||dirname(destination)!==dirname(temporary)||!STAGING.test(basename(temporary)))throw Error('Некорректный путь временного файла.');
 return temporary;
}
async function prefixHash(file,bytes,signal){
 const hash=crypto.createHash('sha256');let seen=0;
 if(!Number.isSafeInteger(bytes)||bytes<0)throw Error('Некорректный размер префикса.');
 if(!bytes)return hash.digest('hex');
 for await(const chunk of createReadStream(file,{start:0,end:bytes-1})){
  signal?.throwIfAborted();seen+=chunk.length;hash.update(chunk);
 }
 if(seen!==bytes)throw Error('Частичный файл изменён или усечён.');
 return hash.digest('hex');
}
async function verifyPartial(source,destination,temporary,signal){
 validStaging(destination,temporary);
 const [src,tmp]=await Promise.all([fs.lstat(source),fs.lstat(temporary)]);
 if(!src.isFile()||!tmp.isFile()||tmp.size>src.size)throw Error('Частичная копия не соответствует исходному файлу.');
 const [a,b]=await Promise.all([prefixHash(source,tmp.size,signal),prefixHash(temporary,tmp.size,signal)]);
 if(a!==b)throw Error('Частичная копия не совпадает с исходным файлом (SHA-256).');
 return {offset:tmp.size,total:src.size,sourceMtimeMs:src.mtimeMs};
}
module.exports={validStaging,prefixHash,verifyPartial};
