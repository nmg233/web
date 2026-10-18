import test from 'node:test';import assert from 'node:assert/strict';
import {mentorModules,mentorModuleFor} from '../src/pages/mentor/navigation.js';
import {canRoleAccessPath} from '../src/utils/roleNavigation.js';
test('导师五项纯数据导航、兼容深链接与按角色申请直达',()=>{
 assert.deepEqual(mentorModules.map(m=>m.label),['工作台','课程管理','教学与成长','学校与账号','使用指引']);
 assert.equal(new Set(mentorModules.map(m=>m.key)).size,5);assert.ok(mentorModules.every(m=>typeof m.iconKey==='string'));
 assert.equal(mentorModuleFor('/mentor/reviews/12'),'/mentor/teaching');assert.equal(mentorModuleFor('/mentor/organization'),'/mentor/organization');assert.equal(mentorModuleFor('/courses/12/edit'),'/courses');
 assert.equal(canRoleAccessPath('admin','/admin/organization?section=applications&application=12'),true);assert.equal(canRoleAccessPath('academic_mentor','/mentor/organization?application=12'),true);assert.equal(canRoleAccessPath('teacher','/mentor/organization?application=12'),false);
});
