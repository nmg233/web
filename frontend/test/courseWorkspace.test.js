import test from 'node:test';import assert from 'node:assert/strict';
import {hasTeachingValue,validArticleBlocks} from '../src/utils/teachingContent.js';
import {adminModules,adminModuleFor} from '../src/pages/admin/navigation.js';
import {lessonTemplates} from '../src/pages/courses/workspaceFields.js';
test('管理员图标标识为纯数据，五项顺序与名称保持，Node可直接导入',()=>{
 assert.deepEqual(adminModules.map(({label,iconKey})=>[label,iconKey]),[
  ['工作台','dashboard'],['课程管理','book'],['教学与成长','learning'],['账号与组织','team'],['平台设置','settings'],
 ]);
 assert.deepEqual(JSON.parse(JSON.stringify(adminModules)),adminModules);
});
test('管理员只有五个一级入口，旧对象深链接映射所属模块',()=>{assert.equal(adminModules.length,5);for(const p of['/students/21','/dashboard/schools/3'])assert.equal(adminModuleFor(p),'/admin/organization');assert.equal(adminModuleFor('/mentor/reviews/11'),'/admin/teaching');assert.equal(adminModuleFor('/courses/12/lessons/31/content'),'/courses');assert.equal(adminModuleFor('/dashboard/ai/settings'),'/admin/settings');assert.equal(adminModuleFor('/reward-management'),'/courses');assert.equal(adminModuleFor('/notifications/3'),null);});
test('空格、富文本空段、零宽与空附件隐藏，0仍是有效值',()=>{for(const value of[null,undefined,'','  ','<p><br></p>','<p>&nbsp;</p>','<!--comment-->','\u200b'])assert.equal(hasTeachingValue(value),false);assert.equal(hasTeachingValue(0),true);assert.equal(hasTeachingValue('0'),true);assert.equal(hasTeachingValue('人工稿。https://example.org/a。'),true);assert.deepEqual(validArticleBlocks([{type:'paragraph',text:'<p><br></p>'},{type:'file',resourceId:1},{type:'image',resourceId:2},{type:'paragraph',text:'保留原句号。'}],[{id:1,has_file:false}]),[{type:'paragraph',text:'保留原句号。'}]);});
test('四种模板只提供管理员引导，没有预填教材、任务、奖励或实验绑定',()=>{assert.deepEqual(lessonTemplates.map(t=>t.value),['learning','visit','theory','experiment']);assert.ok(lessonTemplates.every(t=>Object.keys(t).sort().join(',')==='help,label,value'));});
