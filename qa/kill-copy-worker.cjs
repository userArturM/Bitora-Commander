'use strict';
// Dedicated subprocess for testing abrupt termination of a real local stream.
const fs=require('node:fs/promises'),O=require('../operations');
const [source,target,record]=process.argv.slice(2);
let reported=false;
O.transfer([source],target,{
 preservePartial:true,
 speedLimitMBps:0.125,
 onPartial:async data=>{
  if(data.clear)return;
  if(!reported){
   await fs.writeFile(record,JSON.stringify(data),{flag:'wx'});
   reported=true;
   process.send?.({type:'registered'});
  }
 },
 onProgress:progress=>{
  if(progress.completed>0)process.send?.({type:'copying'});
 }
}).then(result=>{
 process.send?.({type:'finished',result});
},error=>{
 console.error(error);
 process.exitCode=1;
});
