import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearReportDraft, reportDraftKey, restoreReportDraft, saveReportDraft } from '../src/utils/reportDraft.js';

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: (key) => values.delete(key) };
}

test('草稿按学生、课时和被打回版本隔离', () => {
  const store = storage();
  const key = reportDraftKey(3,1,10);
  assert.equal(saveReportDraft(store,key,{summary:'学生三的修改',reflection:{difficulty:'修改反思'}}),true);
  assert.equal(restoreReportDraft(store,key).summary,'学生三的修改');
  for (const other of [reportDraftKey(4,1,10),reportDraftKey(3,2,10),reportDraftKey(3,1,11),reportDraftKey(3,1,null)]) {
    assert.equal(restoreReportDraft(store,other,{summary:'对应版本的原文'}).summary,'对应版本的原文');
  }
});

test('首次进入退回页还原报告与全部反思，部分草稿不会擦掉未修改的字段', () => {
  const store = storage();
  const report = { summary:'原总结',application:'原应用',version:2,status:'rejected' };
  const reflection = { difficulty:'原困难',solution:'原解决',improvement:'原改进',new_question:'原问题' };
  const original = restoreReportDraft(store,'key',report,reflection);
  assert.equal(original.summary,'原总结'); assert.deepEqual(original.reflection,reflection);
  assert.equal(Object.hasOwn(original,'status'),false);
  store.setItem('key',JSON.stringify({summary:'修改总结',reflection:{difficulty:'修改困难'}}));
  const restored = restoreReportDraft(store,'key',report,reflection);
  assert.equal(restored.application,'原应用'); assert.equal(restored.reflection.solution,'原解决'); assert.equal(restored.reflection.difficulty,'修改困难');
});

test('刷新保留报告和四项反思，成功提交只清理对应版本草稿', () => {
  const store = storage();
  const values = {summary:'修改后的总结',reflection:{difficulty:'困难',solution:'解决',improvement:'改进',new_question:'问题'}};
  saveReportDraft(store,'current',values); saveReportDraft(store,'other',{summary:'另一课时'});
  const restored = restoreReportDraft(store,'current');
  assert.equal(restored.summary,values.summary); assert.deepEqual(restored.reflection,values.reflection);
  clearReportDraft(store,'current'); assert.equal(store.getItem('current'),null); assert.ok(store.getItem('other'));
});

test('损坏或错误类型的草稿回退到服务器原文', () => {
  const store = storage();
  for (const value of ['bad json','null','[]','123','"text"']) {
    store.setItem('key',value); assert.equal(restoreReportDraft(store,'key',{summary:'原总结'}).summary,'原总结');
  }
});

test('存储不可用不影响提交完成，读取回退原文并向界面报告保存失败', () => {
  const unavailable = {getItem(){throw new Error('blocked');},setItem(){throw new Error('quota');},removeItem(){throw new Error('blocked');}};
  assert.equal(restoreReportDraft(unavailable,'key',{summary:'原文'}).summary,'原文');
  assert.equal(saveReportDraft(unavailable,'key',{summary:'草稿'}),false);
  assert.doesNotThrow(() => clearReportDraft(unavailable,'key'));
});
