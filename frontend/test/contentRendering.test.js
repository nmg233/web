import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server, MarkdownContent, ReportHistory, ReplaySummary;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  MarkdownContent = (await server.ssrLoadModule('/src/components/common/MarkdownContent.jsx')).default;
  ReportHistory = (await server.ssrLoadModule('/src/components/common/ReportHistory.jsx')).default;
  ReplaySummary = (await server.ssrLoadModule('/src/components/common/ReplaySummary.jsx')).default;
});
after(async () => { await server?.close(); });
const markdown = (source) => renderToStaticMarkup(createElement(MarkdownContent, null, source));

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
