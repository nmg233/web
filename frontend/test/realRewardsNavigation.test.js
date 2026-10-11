import test from 'node:test';import assert from 'node:assert/strict';import {canRoleAccessPath} from '../src/utils/roleNavigation.js';
test('真实兑换通知只允许管理员跳到奖励管理；学生发放通知仍回到本人记录',()=>{
 assert.equal(canRoleAccessPath('admin','/reward-management'),true);
 for(const role of ['student','academic_mentor','teacher','media'])assert.equal(canRoleAccessPath(role,'/reward-management'),false);
 assert.equal(canRoleAccessPath('student','/me?rewards=records'),true);
 for(const path of ['//bad/reward-management','/reward-management/../../students','https://bad/reward-management'])assert.equal(canRoleAccessPath('admin',path),false);
});
