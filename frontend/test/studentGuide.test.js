import test from 'node:test';
import assert from 'node:assert/strict';
import {guideSections,homeworkRequirementSections,studentGuideDocument} from '../src/student/guide/guideContent.js';

const everyList=(section,key,callback)=>{const list=section[key];if(list===undefined)return;assert.ok(Array.isArray(list),`${section.id}.${key} 必须是数组`);for(const item of list)callback(item);};

test('指南区块的 id 唯一、标题与列表项均非空',()=>{
  assert.ok(guideSections.length>=8);
  const ids=new Set();
  for(const section of guideSections){
    assert.match(section.id,/^[a-z0-9-]+$/);
    assert.ok(!ids.has(section.id),'区块 id 重复：'+section.id);
    ids.add(section.id);
    assert.ok(typeof section.title==='string'&&section.title.trim(),'缺少标题：'+section.id);
    if(section.summary!==undefined)assert.ok(typeof section.summary==='string'&&section.summary.trim());
    if(section.notice!==undefined)assert.ok(typeof section.notice==='string'&&section.notice.trim());
    for(const key of ['steps','points'])everyList(section,key,item=>assert.ok(typeof item==='string'&&item.trim(),`${section.id}.${key} 存在空文本`));
    assert.ok(section.summary||section.steps?.length||section.points?.length||section.notice,'区块没有任何可显示内容：'+section.id);
  }
});

test('指南页与登录弹窗共用同一份文档，作业完成要求按约定排在其后',()=>{
  assert.deepEqual(studentGuideDocument.sections.slice(0,guideSections.length),guideSections);
  assert.deepEqual(studentGuideDocument.sections.slice(guideSections.length),homeworkRequirementSections);
  assert.ok(studentGuideDocument.updatedAt.trim());
  assert.ok(studentGuideDocument.footnote.trim());
});
