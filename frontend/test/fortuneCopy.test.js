import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFortuneEdits,format} from '../../scripts/fortune-copy.mjs';
const current={'fortune.good.ask':{text:'主动提问。',enabled:true,optional:true},'fortune.title':{text:'今日运势',enabled:true,optional:false},'next.map.count':{text:'10 个关卡',enabled:true}};
const edit={id:'fortune.good.ask',text:'友好打招呼。',enabled:false,baseText:'主动提问。',baseEnabled:true};
test('运势改稿只更新对应 ID，原句号与其他新文案保留，原对象不写入',()=>{
 const next=applyFortuneEdits(current,{format,edits:[edit]});assert.equal(next[edit.id].text,edit.text);assert.equal(next[edit.id].enabled,false);assert.deepEqual(next['next.map.count'],current['next.map.count']);assert.equal(current[edit.id].text,'主动提问。');
});
test('拒绝跨模块、重复 ID、过时原稿、未知字段和关闭必要状态',()=>{
 for(const edits of [[{...edit,id:'next.map.count'}],[edit,edit],[{...edit,baseText:'过期'}],[{...edit,sourceFile:'foo'}],[{...edit,id:'fortune.title',baseText:'今日运势',enabled:false}]])assert.throws(()=>applyFortuneEdits(current,{format,edits}));
 assert.throws(()=>applyFortuneEdits(current,{edits:[edit]}));assert.deepEqual(applyFortuneEdits(current,{format,edits:[]}),current);
});
