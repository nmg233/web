import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleText} from '../src/content/visibleText.js';
test('删除可选说明后为空，disabled 和空串均不回补默认',()=>{
 assert.equal(visibleText({text:'原说明',enabled:false}),'');
 assert.equal(visibleText({text:'',enabled:true}),'');
 assert.equal(visibleText(undefined),'');
});
test('受控文案保持引号、尖括号、换行等原文，不解析表达式',()=>{
 const text='他说："自己的判断"\n<img src=x onerror=alert(1)> ${answer}';
 assert.equal(visibleText({text,enabled:true}),text);
 assert.equal(visibleText({text:{value:'非文本'},enabled:true}),'');
});
