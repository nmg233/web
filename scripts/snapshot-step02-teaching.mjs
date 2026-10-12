// 仅新建隔离夹具，读取真实 API；绝不读取/初始化用户数据库。
import {fixture,root} from '../tests/v2-fixture.mjs';
import {spawn} from 'node:child_process';
import {writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
const dir=path.join(root,'docs/redesign-v2/step-02'),file=path.join(dir,'teaching-snapshots.json');
if(existsSync(file))throw Error('保留已交接快照，不覆盖人工建议。');
const {env}=fixture(3151,5200),base='http://127.0.0.1:3151/api';
const child=spawn(process.execPath,['scripts/local-server.cjs'],{cwd:root,env,windowsHide:true,stdio:'pipe'});child.stdout.resume();child.stderr.resume();
const entries=[];
function row(scope,id,courseId,objectId,field,value,endpoint,page){entries.push({id,scope,courseId,objectId,sourceField:field,sourceEndpoint:endpoint,sourceFile:null,sourceLine:null,text:value??'',snapshot:value??'',enabled:true,optional:true,page,position:field,purpose:'教学来源快照与待改稿；只供人工审阅',futureTeacher:true,type:'teaching',fixture:true});}
try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const auth=await(await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'student_wang',password:'student123'})})).json();
 const get=async url=>{const r=await fetch(base+url,{headers:{Authorization:'Bearer '+auth.token}});if(!r.ok)throw Error(url+' '+r.status);return r.json();};
 for(const id of [9001,9002]){
  const endpoint=`/course-spaces/${id}/courses/${id}`,data=await get(endpoint);
  for(const field of ['title','description','driving_question','story_line','materials_needed'])row('course',`course.${id}.${field}`,id,id,'courses.'+field,data.course[field],endpoint,'课程介绍');
  for(const lesson of data.lessons){
   for(const field of ['title','description'])row('lesson',`lesson.${lesson.id}.${field}`,id,lesson.id,'lessons.'+field,lesson[field],endpoint,'课时与关卡');
   const le=`/course-spaces/${id}/learning/lessons/${lesson.id}`,pkg=await get(le);
   for(const card of pkg.cards||[])for(const field of ['title','content'])row('lesson',`card.${card.id}.${field}`,id,card.id,'knowledge_cards.'+field,card[field],le,'知识卡片');
   for(const task of pkg.consolidation_tasks||[])for(const field of ['title','description'])row('task',`task.${task.id}.${field}`,id,task.id,'tasks.'+field,task[field],le,'作品任务');
  }
 }
 writeFileSync(file,JSON.stringify(entries,null,2)+'\n');console.log('真实 API 合成测试快照',entries.length,'个；没有写回数据库。');
}finally{child.kill();}
