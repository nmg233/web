import test from 'node:test';
import assert from 'node:assert/strict';
import {displayText} from '../src/content/displayText.js';
import {visibleText} from '../src/content/visibleText.js';
import {createElement} from 'react';
import {formatChildren} from '../src/content/formatChildren.js';
test('完整显示块仅去掉最后一个句号，保留内部、引号与尾部空白',()=>{
 for(const [input,expected] of [['先检查参数。然后开始试飞。','先检查参数。然后开始试飞'],['“先检查。再试飞。” \n','“先检查。再试飞” \n'],['提问？','提问？'],['完成！','完成！'],['等待……','等待……'],['稍等...','稍等...'],['保持原样。。','保持原样。。'],['这是说明.','这是说明'],['引号。\n','引号\n']])assert.equal(displayText(input),expected);
});
test('动态片段整段格式，富文本仅末尾文字，链接代码与输入保留结构',()=>{
 assert.equal(formatChildren(['先检查。','再开始。']),'先检查。再开始');
 const link=createElement('a',{href:'https://example.com/中文.pdf'},'链接。'),bold=createElement('strong',{},'结尾。');
 const result=formatChildren(['开始。',link,bold,'\n']);assert.equal(result[0],'开始。');assert.equal(result[1].props.href,link.props.href);assert.equal(result[1].props.children,'链接。');assert.equal(result[2].props.children,'结尾');assert.equal(result[3],'\n');
 for(const type of ['code','input','pre']){const node=createElement(type,type==='input'?{value:'输入。'}:{},type==='input'?undefined:'代码。');const output=formatChildren([node]);assert.deepEqual(output[0].props,node.props);}
});
test('数字、网址、版本、文件及非句子类型保持原值，原数据未修改',()=>{
 for(const text of ['3.14','v2.700','https://example.com/中文.pdf','https://example.com/中文。\n','报告.pdf','报告.docx.','C:/报告/文件.jsx','F = ma.','2026.10.07','12:30'])assert.equal(displayText(text),text);
 for(const kind of ['input','filename','formula','code','url'])assert.equal(displayText('重力=mg。',{kind}),'重力=mg。');
 const item={text:'第一句。第二句。',enabled:true};assert.equal(visibleText(item),'第一句。第二句');assert.equal(item.text,'第一句。第二句。');assert.equal(visibleText(item,{fragment:true}),item.text);
 for(const entry of [{text:'内容。',enabled:false},{text:'',enabled:true}])assert.equal(visibleText(entry),'');
});
