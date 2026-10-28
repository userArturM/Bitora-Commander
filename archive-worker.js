const {parentPort,workerData}=require('node:worker_threads');
require('./archive')[workerData.kind](...workerData.args).then(result=>parentPort.postMessage({result})).catch(e=>parentPort.postMessage({error:e.message}));
