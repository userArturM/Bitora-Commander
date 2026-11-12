const {test}=require('node:test'),assert=require('node:assert/strict'),{retry}=require('../remote-transfer');
test('network retry reconnects interrupted requests but not conflicts or cancellation',async()=>{let reconnects=0,calls=0;const r={client:{},reconnect:async()=>reconnects++};assert.equal(await retry(r,async()=>{if(!calls++)throw Object.assign(Error('lost'),{code:'ECONNRESET'});return 'ok';}),'ok');assert.equal(reconnects,1);await assert.rejects(retry(r,async()=>{throw Error('Назначение изменилось');}));assert.equal(reconnects,1);const c=new AbortController();c.abort();await assert.rejects(retry(r,async()=> 'should not run',{signal:c.signal}));assert.equal(reconnects,1);});

test('network reconnect backoff can be cancelled before a second request',async()=>{
 const controller=new AbortController();
 let calls=0,reconnects=0;
 const remote={client:{},reconnect:async()=>{reconnects++;}};
 const started=Date.now();
 const request=retry(remote,async()=>{calls++;throw Object.assign(Error('timeout'),{code:'ETIMEDOUT'});},{signal:controller.signal});
 setTimeout(()=>controller.abort(),40);
 await assert.rejects(request);
 assert.equal(calls,1);
 assert.equal(reconnects,0);
 assert.ok(Date.now()-started<2500);
});
test('non-recoverable authentication and host-key errors never automatically reconnect',async()=>{
 let reconnects=0;
 const remote={client:{},reconnect:async()=>{reconnects++;}};
 for(const e of [Error('Authentication failure'),Error('Host fingerprint mismatch'),Object.assign(Error('TLS certificate invalid'),{code:'CERT_HAS_EXPIRED'})]){
  await assert.rejects(retry(remote,async()=>{throw e;}));
 }
 assert.equal(reconnects,0);
});
