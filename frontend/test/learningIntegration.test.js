import test from 'node:test';
import assert from 'node:assert/strict';
import {initialExerciseAnswer,hasExerciseAnswer,resourceDownloadName,versionedReportDraftKey,lessonAccessReason} from '../src/student/learningIntegration.js';
import {buildHomeTodos} from '../src/student/homeModel.js';

test('关闭优先于已开始、进度、参观和准备中；草稿不能通过旧入口学习',()=>{
 for(const lesson of [{started:true,progress:60},{presentation_type:'visit'},{content_state:'preparing'},{readiness:{ready:true}}])assert.match(lessonAccessReason({...lesson,publication_state:'closed'}),/暂时关闭/);
 assert.match(lessonAccessReason({publication_state:'draft'}),/尚未审批/);
 const todos=buildHomeTodos({courses:[{id:1}],courseDetails:[{course:{id:1},lessons:[{id:2,publication_state:'closed',progress:60,report_status:'rejected'}]}]});assert.deepEqual(todos,[]);
});
test('upstream structured answer preserves false and multiple blank identity',()=>{assert.equal(initialExerciseAnswer({student_answer:false}),false);assert.deepEqual(initialExerciseAnswer({question_type:'fill_blank',blank_count:2}),['','']);assert.equal(hasExerciseAnswer(['a',' ']),false);assert.equal(hasExerciseAnswer(['a','b']),true);assert.equal(hasExerciseAnswer(false),true);});
test('report drafts stay account/lesson scoped and each submitted version is independent',()=>{assert.equal(versionedReportDraftKey('account:1:lesson:2',null),'account:1:lesson:2');assert.notEqual(versionedReportDraftKey('account:1:lesson:2',3),versionedReportDraftKey('account:1:lesson:2',4));assert.notEqual(versionedReportDraftKey('account:1:lesson:2',3),versionedReportDraftKey('account:9:lesson:2',3));});
test('private resource filename respects normalized upstream download name',()=>assert.equal(resourceDownloadName({download_name:'讲义.pdf',title:'讲义'},'附件'),'讲义.pdf'));
test('readiness never invents sequential gates and keeps read-only visits/preparing content',()=>{assert.equal(lessonAccessReason({id:2,readiness:{ready:true}}),'');assert.match(lessonAccessReason({learning_in_scope:false}),/已结课/);assert.match(lessonAccessReason({readiness:{ready:false,issues:['缺少教材']}}),/缺少教材/);assert.equal(lessonAccessReason({started:true,readiness:{ready:false}}),'');assert.equal(lessonAccessReason({presentation_type:'visit',readiness:{ready:false}}),'');assert.equal(lessonAccessReason({content_state:'preparing',readiness:{ready:false}}),'');});
test('home keeps independent returned work when new lesson content is not ready',()=>{const lesson={id:2,progress:0,readiness:{ready:false,issues:['待补齐']}};const data={courses:[{id:1,title:'真实课程'}],courseDetails:[{course:{id:1},lessons:[lesson]}],tasks:[{id:9,course_id:1,lesson_id:2,work_id:11,review_status:'rejected',report_status:'approved'}]};const actions=buildHomeTodos(data);assert.deepEqual(actions.map(a=>a.kind),['revise-work']);assert.equal(actions[0].href,'/works/11');});
