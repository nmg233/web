// 本轮需求浏览器验收：只使用隔离临时库和合成账号，不读取业务库。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const repo = path.resolve(__dirname, '..');
const req = createRequire(path.join(repo, 'backend/package.json'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-revision-ui-'));
Object.assign(process.env, {
  DB_PATH: path.join(dir,'test.db'), UPLOAD_PATH: path.join(dir,'uploads'),
  FEEDBACK_UPLOAD_PATH: path.join(dir,'feedback'), NODE_ENV:'test',
  JWT_SECRET:'revision-ui-synthetic', LOGIN_RATE_LIMIT_IP:'1000',
});
const app = req('./app');
const db = req('./config/database');
const hash = req('bcryptjs').hashSync('UiTest!1234',4);
for (const [id,role] of [[1,'admin'],[2,'academic_mentor'],[3,'student'],[4,'student'],[5,'teacher']]) {
  db.prepare('INSERT INTO users (id,username,real_name,role,password_hash) VALUES (?,?,?,?,?)')
    .run(id,`revision_${id}`,`验收${role}${id}`,role,hash);
}
db.prepare('UPDATE users SET teacher_id=5 WHERE role=\'student\'').run();
for (const id of [1,2]) {
  db.prepare("INSERT INTO courses (id,title,description,grade_level,difficulty,status,created_by) VALUES (?,?,?,'primary','basic','published',2)")
    .run(id,`需求验收课程${id}`,'仅用于本轮隔离浏览器验收');
  db.prepare("INSERT INTO lessons (id,course_id,title,status,sort_order,instructor_id) VALUES (?,?,?,'completed',1,2)")
    .run(id,id,`需求验收课时${id}`);
  for (const studentId of [3,4]) db.prepare("INSERT INTO enrollments (student_id,course_id,status) VALUES (?,?,'active')").run(studentId,id);
  db.prepare("INSERT INTO knowledge_cards (id,lesson_id,title,content,status,created_by) VALUES (?,?,?,?,'published',2)")
    .run(id,id,`升力知识卡片${id}`,'## 升力与阻力\n\n**核心概念**：观察机翼气流。\n\n- 调整角度\n- 记录距离\n\n> 每次只修改一个参数\n\n```js\nconst lift = 10;\n```\n\n| 参数 | 含义 |\n| --- | --- |\n| L | 升力 |\n\n[参考资料](https://example.com)\n\n<script>window.__markdownInjected = true</script>\n\n[危险链接](javascript:alert(1))');
  const videoPath = path.join(dir,'uploads','course-replays',`replay${id}.mp4`);
  fs.mkdirSync(path.dirname(videoPath),{recursive:true});
  fs.writeFileSync(videoPath,Buffer.from('0000ftypisom0000'));
  db.prepare('INSERT INTO course_replays (id,course_id,lesson_id,title,description,summary,video_path,duration_seconds,sort_order,created_by) VALUES (?,?,?,?,?,?,?,?,?,2)')
    .run(id,id,id,`课堂回放${id}`,'原回放简介',`初始回放摘要${id}\n重点：观察升力，记录实验结果`,videoPath,1800,1);
}
db.prepare("INSERT INTO card_exercises (id,card_id,question_type,prompt,options_json,answer_json,explanation) VALUES (1,1,'single_choice','机翼主要产生什么力？','[\"升力\",\"重力\"]','\"升力\"','机翼与空气作用产生升力。')").run();
for (const studentId of [3,4]) {
  db.prepare('INSERT INTO lesson_review_completions (student_id,lesson_id) VALUES (?,2)').run(studentId);
  db.prepare('INSERT INTO student_card_progress (student_id,card_id,completed_at,best_score) VALUES (?,2,CURRENT_TIMESTAMP,100)').run(studentId);
}
const express = req('express');
const ui = express();
// 浏览器用画布生成可播放的合成 WebM，替代 API 测试的签名占位视频。
ui.get('/__fixtures/video', (_request,response) => response.type('html').send(`<!doctype html><html lang="zh"><meta charset="utf-8"><title>合成回放测试素材</title><h1>生成隔离验收回放</h1><button id="generate">生成三秒测试视频</button><p id="status">仅写入合成测试库</p><canvas id="canvas" width="320" height="180"></canvas><script>
document.querySelector('#generate').onclick = () => {
  const canvas = document.querySelector('#canvas'), context = canvas.getContext('2d'), chunks = [];
  let frame = 0;
  const paint = () => { context.fillStyle='#e6f4ff'; context.fillRect(0,0,320,180); context.fillStyle='#0958d9'; context.font='24px sans-serif'; context.fillText('PBL TEST VIDEO',40,70); context.fillText('Frame '+frame++,40,120); };
  paint(); const timer = setInterval(paint,50), stream = canvas.captureStream(20);
  const recorder = new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
  recorder.ondataavailable = (event) => chunks.push(event.data);
  recorder.onstop = async () => { clearInterval(timer); stream.getTracks().forEach(track=>track.stop()); const result = await fetch('/__fixtures/video',{method:'POST',headers:{'Content-Type':'video/webm'},body:new Blob(chunks,{type:'video/webm'})}); document.querySelector('#status').textContent = result.ok ? '测试视频生成成功，可返回学习页播放' : '生成失败'; };
  recorder.start(); document.querySelector('#status').textContent='正在生成'; setTimeout(()=>recorder.stop(),3000);
};</script></html>`));
ui.post('/__fixtures/video', express.raw({type:'video/webm',limit:'1mb'}), (request,response) => {
  const videoPath = path.join(dir,'uploads','course-replays','playable-test.webm');
  fs.writeFileSync(videoPath,request.body);
  db.prepare('UPDATE course_replays SET video_path=?').run(videoPath);
  response.json({message:'合成测试回放已生成'});
});
ui.use((request,response,next) => request.path.startsWith('/api/') ? app(request,response) : next());
ui.use(express.static(path.join(repo,'frontend/dist')));
ui.get('*',(request,response) => response.sendFile(path.join(repo,'frontend/dist/index.html')));
const server = ui.listen(0,'127.0.0.1',() => console.log(`PREVIEW_URL=http://127.0.0.1:${server.address().port}`));
function stop() {
  server.closeAllConnections();
  server.close(() => { db.close(); fs.rmSync(dir,{recursive:true,force:true}); process.exit(0); });
}
process.on('SIGINT',stop); process.on('SIGTERM',stop);
