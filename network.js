'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{createWriteStream}=require('node:fs'),Sftp=require('ssh2-sftp-client'),{Client}=require('basic-ftp'),C=require('./core');
function profile(p){if(!p||!['sftp','ftp','ftps'].includes(p.protocol)||typeof p.host!=='string'||!p.host.trim()||/[\s\r\n\/]/.test(p.host))throw Error('Укажите протокол и адрес сервера.');const port=Number(p.port)||(p.protocol==='sftp'?22:21);if(port<1||port>65535)throw Error('Недопустимый порт.');return {id:p.id||crypto.randomUUID(),name:String(p.name||p.host).slice(0,100),protocol:p.protocol,host:p.host.trim(),port,user:String(p.user||''),root:remotePath(p.root||'/'),fingerprint:p.fingerprint||''};}
function remotePath(p){if(typeof p!=='string'||/[\0\r\n]/.test(p)||!p.startsWith('/'))throw Error('Укажите абсолютный путь сервера.');return path.posix.normalize(p);}
class Remote{
 constructor(){this.client=null;this.config=null;this.busy=false;this.partials=new Map();this.credentials=null;}
 async connect(config,password,verify){await this.close();config=profile(config);let client;
 try{if(config.protocol==='sftp'){client=new Sftp();await client.connect({host:config.host,port:config.port,username:config.user,password,readyTimeout:15000,keepaliveInterval:10000,keepaliveCountMax:3,hostHash:'sha256',hostVerifier:(hash,cb)=>{if(config.fingerprint)return cb(hash===config.fingerprint);Promise.resolve(verify(hash)).then(ok=>{if(ok)config.fingerprint=hash;cb(!!ok);},()=>cb(false));}});}else{client=new Client(20000);await client.access({host:config.host,port:config.port,user:config.user,password,secure:config.protocol==='ftps',secureOptions:{rejectUnauthorized:true}});}this.client=client;this.config=config;this.credentials={config:{...config},password};return config;}catch(e){if(client)await Promise.resolve(config.protocol==='sftp'?client.end():client.close()).catch(()=>{});throw e;}}
 async close(){const c=this.client;this.client=null;if(c)await Promise.resolve(this.config?.protocol==='sftp'?c.end():c.close()).catch(()=>{});}
 async use(fn){const previous=this.tail||Promise.resolve();let release;this.tail=new Promise(r=>release=r);this.pending=(this.pending||0)+1;await previous;this.busy=true;try{if(!this.client)throw Error('Сначала подключитесь к серверу.');return await fn(this.client,this.config.protocol==='sftp');}finally{this.pending--;this.busy=false;release();}}

 list(p){p=remotePath(p);return this.use(async(c,s)=>({path:p,items:(await c.list(p)).filter(e=>e.name!=='.'&&e.name!=='..').map(e=>{C.name(e.name);return {name:e.name,path:path.posix.join(p,e.name),dir:s?e.type==='d':e.isDirectory,link:s?e.type==='l':e.isSymbolicLink,size:e.size,date:s?e.modifyTime:e.modifiedAt?.getTime()};})}));}
 download(p,target,options={}){return require('./network-files').download(this,remotePath(p),target,options);}
 upload(p,target,options={}){return require('./network-files').upload(this,p,remotePath(target),options);}
 async reconnect(){if(this.reconnecting)return this.reconnecting;if(!this.credentials)throw Error('Подключитесь заново.');const {config,password}=this.credentials;this.reconnecting=this.connect(config,password,()=>false);try{return await this.reconnecting;}finally{this.reconnecting=null;}}
 mkdir(p){p=remotePath(p);return this.use((c,s)=>s?c.mkdir(p):c.ensureDir(p));}
}
module.exports={Remote,profile,remotePath};
