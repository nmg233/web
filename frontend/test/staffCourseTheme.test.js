import {test} from 'node:test';
import assert from 'node:assert/strict';
import {staffThemeCourseId} from '../src/utils/staffCourseTheme.js';
test('教师合法课时预览不附带越权的课程详情请求，主题装饰不扩大权限',()=>{
 const path='/courses/12/lessons/34/preview';
 for(const role of ['teacher','media','student',undefined])assert.equal(staffThemeCourseId(path,role),undefined);
 for(const role of ['admin','academic_mentor'])assert.equal(staffThemeCourseId(path,role),'12');
 assert.equal(staffThemeCourseId('/observer/students/12','admin'),undefined);
 assert.equal(staffThemeCourseId('/courses/12x','academic_mentor'),undefined);
});
