import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionForm, questionPayload } from '../src/utils/questionForm.js';
import { exerciseAnswer } from '../src/utils/exerciseAnswer.js';

test('五种题型的手工编辑值往返保留参考答案且清理非适用字段', () => {
  for (const [question_type,answer,options] of [['single_choice','B',['A','B']],['multiple_choice',['A','B'],['A','B']],['true_false',false,[]],['fill_blank',{blanks:[['ABC','Abc'],['句号。']]},[]],['short_answer','参考表达',[]]]) {
    const payload=questionPayload(questionForm({question_type,answer,options}));
    assert.deepEqual(payload.answer,answer); assert.equal('blanks' in payload,false);
    if (!question_type.endsWith('choice')) assert.deepEqual(payload.options,[]);
  }
});

test('旧选项、旧填空多答案兼容；填空只忽略首尾空格不改变大小写标点', () => {
  const form=questionForm({question_type:'fill_blank',answer:['ABC','abc.'],options:[]});
  assert.deepEqual(questionPayload({...form,blanks:[' ABC \nabc. ']}).answer,{blanks:[['ABC','abc.']]});
  assert.deepEqual(questionForm({answer:'A',options:['A','B']}).options,[{label:'A',value:'A'},{label:'B',value:'B'}]);
});

test('答案展示将选项编号、多空多答案及判断题转换为可读文本', () => {
  assert.equal(exerciseAnswer('B',[{value:'B',label:'第二选项'}]),'第二选项');
  assert.equal(exerciseAnswer({blanks:[['ABC','Abc'],['句号。']]}),'第 1 空：ABC / Abc；第 2 空：句号。');
  assert.equal(exerciseAnswer(false),'错误'); assert.equal(exerciseAnswer(null),'未作答');
});
