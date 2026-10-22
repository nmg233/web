// Local acceptance only. Fresh synthetic fixture on first start; restart never resets it.
import fs from 'node:fs';
import path from 'node:path';
import {prepareMentorFixture,serveFixture,root,Database} from '../tests/mentor-fixture.mjs';

const api=3241,front=4241;
const privateDir=path.join(root,'.local/content-authoring-preview');
const configFile=path.join(privateDir,'preview-private.json');
fs.mkdirSync(privateDir,{recursive:true});
let saved;
if(fs.existsSync(configFile)){
  saved=JSON.parse(fs.readFileSync(configFile,'utf8'));
  if(!saved.synthetic||!fs.existsSync(saved.settings.DB_PATH))throw Error('私有预览标记或数据库失效；停止，不覆盖原数据');
}else{
  const f=prepareMentorFixture(api,front),db=new Database(f.env.DB_PATH);
  try{
    db.prepare("UPDATE courses SET title='星海远航 · 集中填写验收（合成）',description='这里只包含合成验收内容。正式教材和原教学库未迁入。故事与课程说明在此集中填写。',presentation_theme='voyage',public_theme=NULL WHERE id=91001").run();
    db.prepare("UPDATE lessons SET title='实践操作 · 草稿体验',presentation_type='experiment',cards_required=0,content_state='ready',publication_state='draft',review_content='合成练习：观察纸翼并记录自己比较的条件。',description='可在这里写时间、地点、授课人和材料。本段为验收示例。' WHERE id=91001").run();
    for(const[id,type,title,state]of[[91011,'visit','参观体验 · 草稿文章','draft'],[91012,'theory','理论学习 · 草稿卡片','draft'],[91013,'learning','普通教学 · 学生同步示例','legacy']]){
      db.prepare("INSERT INTO lessons(id,course_id,title,description,sort_order,presentation_type,content_state,publication_state,cards_required,review_content,article_blocks) VALUES(?,91001,?,'',?,?,'ready',?,0,'合成回顾：请比较观察条件并说明依据。',?)").run(id,title,id-91000,type,state,JSON.stringify(type==='visit'?[{id:'synthetic-preview',type:'paragraph',text:'合成参观文章，可替换为已有公众号 HTML＋图片包。不是正式教材。'}]:[]));
    }
    db.prepare("INSERT INTO course_experiments(course_id,experiment_id,label,enabled) VALUES(91001,'glider','验收配置：课程明确关联滑翔机',1)").run();
    const target=path.join(privateDir,'acceptance.sqlite');
    await db.backup(target);
    const keys=['NODE_ENV','PORT','JWT_SECRET','FEEDBACK_UPLOAD_PATH','CORS_ORIGIN','API_PROXY_TARGET','LOGIN_RATE_LIMIT_IP','LOGIN_RATE_LIMIT_USER'];
    saved={synthetic:true,settings:{...Object.fromEntries(keys.map(k=>[k,f.env[k]])),DB_PATH:target,UPLOAD_PATH:path.join(privateDir,'uploads')},password:f.password,createdAt:new Date().toISOString()};
    fs.writeFileSync(configFile,JSON.stringify(saved,null,2),{flag:'wx'});
  }finally{db.close();}
}
const accounts=path.join(privateDir,'验收账号.txt');
fs.writeFileSync(accounts,`本机隔离合成预览：http://127.0.0.1:${front}\n管理员：mentor_review_admin\n导师：mentor_review_mentor\n学生：mentor_review_student\n以上账号密码：${saved.password}\n仅供本机私有验收；不适用于正式站。勿上传此文件。\n`);
process.env.PBL_REGRESSION_DIST='build/content-authoring';
const server=await serveFixture({env:{...process.env,...saved.settings}},api,front);
console.log('Synthetic authoring preview: '+server.base+' · private accounts: '+accounts);
for(const signal of['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();process.exit(0);});
