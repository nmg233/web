import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('助手加载状态使用块级容器，避免 Spin 的 div 嵌入段落',()=>{
 const source=fs.readFileSync(new URL('../src/student/StudentAssistant.jsx',import.meta.url),'utf8');
 assert.match(source,/<Sentence as="div" role="status"><Spin/);
 assert.doesNotMatch(source,/<Sentence role="status"><Spin/);
});
