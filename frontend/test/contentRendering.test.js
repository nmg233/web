import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server, MarkdownContent, ReportHistory, ReplaySummary, KnowledgePreview, ExerciseFeedback;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  MarkdownContent = (await server.ssrLoadModule('/src/components/common/MarkdownContent.jsx')).default;
  ReportHistory = (await server.ssrLoadModule('/src/components/common/ReportHistory.jsx')).default;
  ReplaySummary = (await server.ssrLoadModule('/src/components/common/ReplaySummary.jsx')).default;
  KnowledgePreview = (await server.ssrLoadModule('/src/components/learning/KnowledgePreview.jsx')).default;
  ExerciseFeedback = (await server.ssrLoadModule('/src/components/learning/ExerciseFeedback.jsx')).default;
});
after(async () => { await server?.close(); });
const markdown = (source) => renderToStaticMarkup(createElement(MarkdownContent, null, source));

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
    assert.ok(empty.includes('课程结束后由导师补充回放内容摘要。'));
  }
  assert.equal(renderToStaticMarkup(createElement(ReplaySummary,{})), '');
});

test('多版本评审历史实际组件可渲染状态与评语，当前版本按钮禁用', () => {
  const html = renderToStaticMarkup(createElement(ReportHistory, {
    history:[{id:2,version:2,status:'submitted'},{id:1,version:1,status:'rejected',review_comment:'请补充反思'}],
    reportId:2,onView:() => {},
  }));
  for (const fragment of ['提交与评审历史','第 2 版','第 1 版','待评审','已退回','请补充反思','disabled']) assert.ok(html.includes(fragment),fragment);
  assert.equal(renderToStaticMarkup(createElement(ReportHistory,{history:[{id:1,version:1}]})),'');
});
