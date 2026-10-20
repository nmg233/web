// Private, synthetic preview only. Never points at the teaching database.
import fs from 'node:fs';import path from 'node:path';
import {prepareDeskFixture} from '../tests/staff-desk-fixture.mjs';
import {serveFixture,root} from '../tests/mentor-fixture.mjs';
const privateDir=path.join(root,'.local/staff-desk-review'),configFile=path.join(privateDir,'preview-private.json');fs.mkdirSync(privateDir,{recursive:true});
const api=3220,front=4220;let saved;
if(fs.existsSync(configFile)){saved=JSON.parse(fs.readFileSync(configFile,'utf8'));if(!saved.synthetic||!fs.existsSync(saved.settings.DB_PATH))throw Error('私有预览库标记或路径无效，停止；不会重新初始化已有数据');}
else{const f=prepareDeskFixture(api,front),keys=['NODE_ENV','DB_PATH','PORT','JWT_SECRET','UPLOAD_PATH','FEEDBACK_UPLOAD_PATH','CORS_ORIGIN','API_PROXY_TARGET','LOGIN_RATE_LIMIT_IP','LOGIN_RATE_LIMIT_USER'];saved={synthetic:true,settings:Object.fromEntries(keys.map(k=>[k,f.env[k]])),password:f.password,accounts:{admin:'mentor_review_admin',mentor:'mentor_review_mentor'},createdAt:new Date().toISOString()};fs.writeFileSync(configFile,JSON.stringify(saved,null,2));}
process.env.PBL_REGRESSION_DIST='build/staff-desk';const server=await serveFixture({env:{...process.env,...saved.settings}},api,front);console.log('Private synthetic preview: '+server.base+' · credentials stored only in '+configFile);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();process.exit(0);});
