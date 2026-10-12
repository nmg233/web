import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import {Buffer} from 'node:buffer';
import {createServer} from 'vite';
let server,client,handler,auth;
const storage=new Map();
const originalAdapter=axios.defaults.adapter;
const originalWindow=globalThis.window, originalStorage=globalThis.localStorage;
const tokenFor=(id,seconds=3600)=>`header.${Buffer.from(JSON.stringify({id,role:'student',exp:Math.floor(Date.now()/1000)+seconds})).toString('base64url')}.sig`;
const session=(token,refresh)=>{storage.set('token',token);storage.set('refresh_token',refresh);auth.resumeAuthSession();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
before(async()=>{
  axios.defaults.adapter=config=>handler(config);
  server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
  globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  const events=new EventTarget();
  globalThis.window={localStorage:globalThis.localStorage,sessionStorage:globalThis.localStorage,navigator:{},location:{pathname:'/courses',href:'/courses'},addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)};
  auth=await server.ssrLoadModule('/src/utils/authSession.js');
  client=(await server.ssrLoadModule('/src/api/client.js')).default;
});
after(async()=>{await server?.close();axios.defaults.adapter=originalAdapter;globalThis.window=originalWindow;globalThis.localStorage=originalStorage;});
test('旧会话401迟到不能清除新账号凭据或重放为新用户请求',{timeout:5000},async()=>{
  const sent=deferred(),response=deferred();session(tokenFor(1),'old-refresh');
  handler=config=>{sent.resolve(config);return response.promise;};
  const result=client.get('/test/slow').then(()=>assert.fail('旧请求应拒绝'),e=>e);
  const config=await sent.promise;session(tokenFor(2),'new-refresh');
  response.reject(Object.assign(new Error('old 401'),{config,response:{status:401,data:{error:'旧凭据无效'}}}));
  assert.equal((await result).code,'AUTH_STOPPED');assert.equal(storage.get('token'),tokenFor(2));assert.equal(window.location.href,'/courses');
});
test('刷新响应在退出/重新登录后到达，不能覆盖凭据或以新用户发送旧业务',{timeout:5000},async()=>{
  const started=deferred(),refresh=deferred();let business=0;
  const expiring=tokenFor(1,10);
  session(expiring,'old-refresh');
  handler=config=>{
    if(config.url==='/auth/refresh'){started.resolve(config);return refresh.promise;}
    business++;return Promise.resolve({config,data:{ok:true},status:200,headers:{}});
  };
  const result=client.post('/test/write',{id:1}).then(()=>assert.fail('失效业务应拒绝'),e=>e);
  const config=await started.promise;session(tokenFor(2),'new-refresh');
  refresh.resolve({config,data:{token:'late-old-access',refresh_token:'late-old-refresh'},status:200,headers:{}});
  const error=await result;assert.equal(error.code,'AUTH_STOPPED');assert.equal(business,0);
  assert.equal(storage.get('token'),tokenFor(2));assert.equal(storage.get('refresh_token'),'new-refresh');
});
