import test from 'node:test';import assert from 'node:assert/strict';
import {registry,setCopyScope,receiveCopy,runtimeText} from '../src/content/runtimeCopy.js';
import {REPORT_STATUS,LEARNING_STEPS} from '../src/constants/status.js';
import {feedbackTypeOptions} from '../src/constants/feedback.js';
import {notificationCategoryOptions} from '../src/constants/notification.js';
import {studentFeedbackModules} from '../src/utils/feedbackFiles.js';
import {workDimensions} from '../src/student/archiveModel.js';
import {rewardSyncWarning} from '../src/student/rewardEvents.js';
test('模块预生成下拉标签、反馈模块和能力维度随发布变化，枚举值与奖励广播规则保持',()=>{
 const value=feedbackTypeOptions[0].value,dimension=workDimensions[0][0];setCopyScope('loaded-options',true);receiveCopy('loaded-options',{'site.980bd5f3761ee613':{text:'新的建议标签',enabled:true},'site.e4e1bb5509e5b19e':{text:'新的反馈类别',enabled:true},'site.ad70adac5e57f6d0':{text:'新的账号模块',enabled:true},'student26.d91bb052cbcb63f5':{text:'新的发现维度',enabled:true},'site.a0efa7edcb9caf63':{text:'新的广播提示',enabled:true}});
 assert.equal(feedbackTypeOptions[0].label,'新的建议标签');assert.equal(notificationCategoryOptions[0].label,'新的反馈类别');assert.equal(studentFeedbackModules.auth,'新的账号模块');assert.equal(workDimensions[0][1],'新的发现维度');assert.equal(rewardSyncWarning(),'新的广播提示');assert.equal(feedbackTypeOptions[0].value,value);assert.equal(workDimensions[0][0],dimension);setCopyScope('staff',false);
});
test('发布覆盖响应已加载的状态/阶段常量；切换账号或课时立即隔离旧文案',()=>{const id='site.ca36c6b73ce889a0',status='site.d6f3aee5e8160484',base=LEARNING_STEPS[0];setCopyScope('account1:course1:lesson1',true);receiveCopy('account1:course1:lesson1',{[id]:{text:'新的回顾标签。',enabled:true},[status]:{text:'评审已通过。',enabled:true}});assert.equal(LEARNING_STEPS[0],'新的回顾标签');assert.equal(REPORT_STATUS.approved.label,'评审已通过');receiveCopy('wrong-account',{[id]:{text:'不能串号',enabled:true}});assert.equal(LEARNING_STEPS[0],'新的回顾标签');setCopyScope('account2:course1:lesson1',true);assert.equal(LEARNING_STEPS[0],base);setCopyScope('staff',false);});
test('可选空串/隐藏不fallback，模板/HTML按字符串保留；仅显示层去末尾句号',()=>{const id=Object.keys(registry).find(k=>registry[k].optional);setCopyScope('optional',true);receiveCopy('optional',{[id]:{text:'',enabled:true}});assert.equal(runtimeText(id),'');receiveCopy('optional',{[id]:{text:'不能补回',enabled:false}});assert.equal(runtimeText(id),'');const raw='<script>unsafe()</script> 地址 https://example.com/a. 内部句号。末句。';receiveCopy('optional',{[id]:{text:raw,enabled:true}});assert.equal(runtimeText(id),raw.slice(0,-1));assert.equal(runtimeText(id,undefined,{fragment:true}),raw);setCopyScope('staff',false);});
