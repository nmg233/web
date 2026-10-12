import {spawn} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fixture,root} from '../tests/v2-fixture.mjs';
const {env,scratch}=fixture();const children=[];
function start(args,cwd=root){const p=spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:'inherit'});children.push(p);p.on('exit',code=>{if(code){children.forEach(c=>{if(c!==p)c.kill();});process.exitCode=code;}});return p;}
start(['scripts/local-server.cjs']);
start([path.join(root,'frontend/node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','4174','--strictPort'],path.join(root,'frontend'));
mkdirSync(path.join(root,'test-results/redesign-v2'),{recursive:true});writeFileSync(path.join(root,'test-results/redesign-v2/preview.json'),JSON.stringify({pid:process.pid,db:env.DB_PATH,scratch,url:'http://127.0.0.1:4174',api:'http://127.0.0.1:3144'}));
console.log('新版独立验收预览：http://127.0.0.1:4174；测试账号 student_wang / student123。仅使用新建临时数据库。');
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{children.forEach(p=>p.kill());process.exit(0);});
