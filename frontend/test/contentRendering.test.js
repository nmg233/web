import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server, MarkdownContent, ReportHistory, ReplaySummary, OutboxPanel, KnowledgePreview, ExerciseFeedback, LessonReplays, PageContainer;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  MarkdownContent = (await server.ssrLoadModule('/src/components/common/MarkdownContent.jsx')).default;
  ReportHistory = (await server.ssrLoadModule('/src/components/common/ReportHistory.jsx')).default;
  ReplaySummary = (await server.ssrLoadModule('/src/components/common/ReplaySummary.jsx')).default;
  OutboxPanel = (await server.ssrLoadModule('/src/components/notifications/OutboxPanel.jsx')).default;
  KnowledgePreview = (await server.ssrLoadModule('/src/components/learning/KnowledgePreview.jsx')).default;
  ExerciseFeedback = (await server.ssrLoadModule('/src/components/learning/ExerciseFeedback.jsx')).default;
  LessonReplays = (await server.ssrLoadModule('/src/components/courses/LessonReplays.jsx')).default;
  PageContainer = (await server.ssrLoadModule('/src/components/common/PageContainer.jsx')).default;
});
after(async () => { await server?.close(); });
const markdown = (source) => renderToStaticMarkup(createElement(MarkdownContent, null, source));

test('真实文章正文保留末尾句号、内部标点、网址与代码文字，不套系统标签去句号规则',async()=>{
 const Article=(await server.ssrLoadModule('/src/student/space/ArticleContent.jsx')).default;
 const text='真实正文。保留内部；网址 https://example.org/a；代码 x.y()。';
 const html=renderToStaticMarkup(createElement(Article,{blocks:[{id:'real-body',type:'paragraph',text}],resources:[]}));
 assert.ok(html.includes(text));assert.ok(html.includes('study-prose'));
});
test('共用页面容器保留显式文案绑定，教学及个人值不会通过 DOM 文本匹配定位',()=>{
 const html=renderToStaticMarkup(createElement(PageContainer,{title:'页面标签','data-copy-bindings':JSON.stringify(['stable.label'])},'真实业务值'));
 assert.ok(html.includes('data-copy-bindings="[&quot;stable.label&quot;]"'));assert.ok(html.includes('真实业务值'));
});
test('绑定文案的按钮在加载与恢复后保持相同可访问名称，不把加载图标算成按钮文字',async()=>{
 const {PixelButton}=await server.ssrLoadModule('/src/student/visual/PixelUI.jsx'),ManagedText=(await server.ssrLoadModule('/src/content/ManagedText.jsx')).default,runtime=await server.ssrLoadModule('/src/content/runtimeCopy.js');
 runtime.setCopyScope('isolated-button-label',true);runtime.receiveCopy('isolated-button-label',{'system.learning.118':{text:'服务器发布的按钮标签',enabled:true}});
 try{for(const loading of[true,false]){const html=renderToStaticMarkup(createElement(PixelButton,{loading},createElement(ManagedText,{id:'system.learning.118'})));assert.ok(html.includes('aria-label="服务器发布的按钮标签"'));assert.ok(html.includes('data-copy-id="system.learning.118"'));}}finally{runtime.setCopyScope('staff',false);}
});
test('可选空状态说明清空后不被共用容器补回，未提供说明时才用默认值',async()=>{
 const {ReadState}=await server.ssrLoadModule('/src/components/ServiceUI.jsx'),{AuthProvider}=await server.ssrLoadModule('/src/store/AuthContext.jsx');
 const render=emptyText=>renderToStaticMarkup(createElement(AuthProvider,null,createElement(ReadState,{empty:true,emptyText})));
 assert.ok(!render('').includes('暂时没有内容'));assert.ok(render(undefined).includes('暂时没有内容'));
});
test('新课时空图使用岩石和独立角色，存量校园节点保持原主题显示',async()=>{
 const Place=(await server.ssrLoadModule('/src/student/space/LessonMapPlace.jsx')).default;
 const render=lesson=>renderToStaticMarkup(createElement(Place,{theme:'campus',number:1,current:true,lesson}));
 const fresh=render({id:1,map_art_preset:'rock'});assert.ok(fresh.includes('data-place="rock"'));assert.ok(fresh.includes('unknown-platform-192.webp'));assert.ok(!fresh.includes('space-place-astronaut'));const voyage=renderToStaticMarkup(createElement(Place,{theme:'voyage',number:1,current:true,lesson:{id:3,map_art_preset:'rock'}}));assert.ok(voyage.includes('space-place-astronaut'));
 const legacy=render({id:2,map_art_preset:'moon-base'});assert.ok(legacy.includes('data-place="campus"'));assert.ok(!legacy.includes('space-place-art'));
});

test('课时视频实际组件只展示本课时，导师有上传入口，只读及关闭状态没有写入口', () => {
  const props = { lesson: { id: 2, title: '第二课时', status: 'completed' }, replays: [
    { id: 1, lesson_id: 1, title: '第一课时专属视频' }, { id: 2, lesson_id: 2, title: '第二课时专属视频' },
    { id: 3, lesson_id: null, title: '历史共享视频' },
  ], canEdit: true };
  const html = renderToStaticMarkup(createElement(LessonReplays, props));
  for (const text of ['本课时视频（1）', '第二课时专属视频', '上传本课时视频', '编辑视频信息']) assert.ok(html.includes(text), text);
  for (const text of ['第一课时专属视频', '历史共享视频']) assert.equal(html.includes(text), false, text);
  for (const restricted of [{ ...props, canEdit: false }, { ...props, lesson: { ...props.lesson, status: 'cancelled' } }]) {
    const readonly = renderToStaticMarkup(createElement(LessonReplays, restricted));
    assert.ok(readonly.includes('第二课时专属视频'));
    for (const text of ['上传本课时视频', '编辑视频信息', '删除']) assert.equal(readonly.includes(text), false, text);
  }
});

test('只读预览渲染Markdown和练习选项，即使收到答案字段也不显示或提供作答入口', () => {
  const html = renderToStaticMarkup(createElement(KnowledgePreview, { cards: [{
    id: 1, title: '升力卡片', content: '## 空气\n\n**观察**\n\n<script>alert(1)</script>',
    exercises: [{ id: 2, question_type: 'single_choice', prompt: '机翼的作用？', points: 2,
      options: [{ label: '与空气相互作用', value: 'A' }, '让重力消失'],
      answer: '秘密答案', correct_answer: '秘密标准答案', explanation: '秘密解析' }],
  }] }));
  for (const fragment of ['升力卡片', '<h2>空气</h2>', '<strong>观察</strong>', '机翼的作用？', '与空气相互作用', '让重力消失']) assert.ok(html.includes(fragment), fragment);
  for (const fragment of ['秘密答案', '秘密标准答案', '秘密解析', '<script', '<input', '<textarea', '<button']) assert.equal(html.includes(fragment), false, fragment);
  assert.ok(renderToStaticMarkup(createElement(KnowledgePreview)).includes('暂无已发布的知识卡片'));
});

test('答题反馈作答前隐藏答案，提交后和刷新后展示一致的得分与解析', () => {
  const exercise = { points: 2, correct_answer: '答案', explanation: '解析' };
  assert.equal(renderToStaticMarkup(createElement(ExerciseFeedback, { exercise })), '');
  const result = { correct: false, score: 0, correct_answer: ['重力', '引力'], explanation: '地球吸引模型' };
  const submitted = renderToStaticMarkup(createElement(ExerciseFeedback, { exercise, result }));
  const restored = renderToStaticMarkup(createElement(ExerciseFeedback, { exercise: {
    ...exercise, attempted: true, passed: false, best_score: 0, correct_answer: result.correct_answer, explanation: result.explanation,
  } }));
  assert.equal(submitted, restored);
  for (const fragment of ['0 / 2 分', '重力、引力', '地球吸引模型', '不能重试', '全部题目作答后可完成卡片']) assert.ok(submitted.includes(fragment), fragment);
  const passed = renderToStaticMarkup(createElement(ExerciseFeedback, { exercise: { ...exercise, attempted: true, passed: true, best_score: 2 } }));
  assert.ok(passed.includes('回答正确'));
  assert.ok(passed.includes('2 / 2 分'));
});

test('实际Markdown组件渲染标题、加粗、列表、引用与代码块', () => {
  const html = markdown('## 知识点\n\n**加粗**\n\n- 要点\n\n> 提示\n\n```js\nconst lift = 10;\n```');
  for (const fragment of ['<h2>知识点</h2>','<strong>加粗</strong>','<li>要点</li>','<blockquote>','<pre><code class="language-js">const lift = 10;']) assert.ok(html.includes(fragment),fragment);
});

test('简答反馈不显示错误或零分，评价要点只在提交后出现', () => {
  const exercise={question_type:'short_answer',points:2,rubric:'应说明原理'};
  assert.equal(renderToStaticMarkup(createElement(ExerciseFeedback,{exercise})), '');
  const html=renderToStaticMarkup(createElement(ExerciseFeedback,{exercise,result:{correct:null,score:0,correct_answer:'参考',explanation:'详解',rubric:'应说明原理'}}));
  for(const value of ['不自动判对错','导师可评价','应说明原理','详解','不能重试']) assert.ok(html.includes(value));
  for(const value of ['回答不正确','本题得分']) assert.equal(html.includes(value),false);
});

test('GFM表格、删除线、任务列表与普通文本均正常展示', () => {
  const html = markdown('| 参数 | 含义 |\n| --- | --- |\n| L | 升力 |\n\n~~删除~~\n\n- [x] 已完成\n\n普通文本第一行\n第二行');
  for (const fragment of ['<table>','<th>参数</th>','<td>升力</td>','<del>删除</del>','type="checkbox"','普通文本第一行\n第二行']) assert.ok(html.includes(fragment),fragment);
});

test('Markdown脚本、原始HTML和危险协议被阻断，安全链接保留', () => {
  const html = markdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[危险](javascript:alert(1))\n\n[安全](https://example.com)');
  assert.equal(html.includes('<script'),false); assert.equal(html.includes('onerror'),false); assert.equal(html.includes('javascript:'),false);
  assert.ok(html.includes('href="https://example.com"'));
});

test('课程纪要实际组件渲染Markdown排版，阻断HTML与危险链接', () => {
  const summary = '## 课程纪要\n\n**重点知识**\n\n- 课堂活动\n\n| 参数 | 含义 |\n| --- | --- |\n| L | 升力 |\n\n```js\nconst lift = 10;\n```\n\n[参考资料](https://example.com)\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[危险](javascript:alert(1))';
  const html = renderToStaticMarkup(createElement(ReplaySummary, { replay:{ summary } }));
  for (const fragment of ['回放内容摘要','<h2>课程纪要</h2>','<strong>重点知识</strong>','<li>课堂活动</li>','<table>','<td>升力</td>','<pre><code class="language-js">const lift = 10;','href="https://example.com"']) assert.ok(html.includes(fragment),fragment);
  for (const fragment of ['<script','onerror','javascript:']) assert.equal(html.includes(fragment),false);
});

test('课程纪要兼容普通文本换行、空摘要提示和没有回放的课时', () => {
  const html = renderToStaticMarkup(createElement(ReplaySummary,{replay:{summary:'普通文本第一行\n第二行'}}));
  assert.ok(html.includes('普通文本第一行\n第二行'));
  for (const summary of ['',null,undefined]) {
    const empty = renderToStaticMarkup(createElement(ReplaySummary,{replay:{summary}}));
    assert.ok(empty.includes('课程结束后由导师补充回放内容摘要')); // Display omits the terminal period; stored source remains unchanged.
  }
  assert.equal(renderToStaticMarkup(createElement(ReplaySummary,{})), '');
});

test('多版本评审历史实际组件可渲染状态与评语，当前版本按钮禁用', () => {
  const html = renderToStaticMarkup(createElement(ReportHistory, {
    history:[{id:2,version:2,status:'submitted'},{id:1,version:1,status:'rejected',review_comment:'请补充反思'}],
    reportId:2,onView:() => {},
  }));
  const text=html.replace(/<[^>]*>/g,'');
  for (const fragment of ['提交与评审历史','第 2 版','第 1 版','待评审','已退回','请补充反思']) assert.ok(text.includes(fragment),fragment);
  assert.ok(html.includes('disabled'));
  assert.equal(renderToStaticMarkup(createElement(ReportHistory,{history:[{id:1,version:1}]})),'');
});

test('管理员通知投递面板渲染积压、隔离、失败原因与重放说明', () => {
  const html=renderToStaticMarkup(createElement(OutboxPanel));
  for(const text of ['通知投递监控（仅管理员）','刷新队列','未投递','已隔离','连续失败 8 次后隔离','失败次数','最近错误','重放']) assert.ok(html.includes(text),text);
});
