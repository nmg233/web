import test from 'node:test';
import assert from 'node:assert/strict';
import {courseIdFromPath,coursePath} from '../src/student/spaceRoutes.js';
import {coursePresentation,safeCoverSource} from '../src/student/space/identity.js';
test('课程上下文只来自 URL，平台入口保持平台范围',()=>{
 assert.equal(courseIdFromPath('/courses/9001/works/10'),'9001');
 assert.equal(courseIdFromPath('/glider?course_id=9001'),null);
 assert.equal(coursePath('9001','/works/upload?task_id=1'),'/courses/9001/works/upload?task_id=1');
 assert.equal(coursePath('9001','/archives/reflection'),'/courses/9001/reflection');
 assert.equal(coursePath('9001','/explore'),'/explore');
 assert.equal(coursePath('9001','/archives/rewards'),'/me');
});
test('主题只来自持久化枚举，不根据测试 ID 或标题推断',()=>{
 assert.equal(coursePresentation({id:9001,presentation_theme:'voyage'}).theme,'voyage');
 assert.equal(coursePresentation(9001).theme,'campus');
 assert.equal(coursePresentation(9002).theme,'campus');
 assert.equal(coursePresentation('星海远航').theme,'campus');
});
test('封面不接受外站、协议相对地址、路径逃逸或控制字符',()=>{
 for(const v of ['https://outside.invalid/a.png','//outside.invalid/a.png','/assets/../../api/works/1','/assets/a'+String.fromCharCode(92)+'b','/assets/a'+String.fromCharCode(0),null])assert.equal(safeCoverSource(v),null,String(v));
 assert.equal(safeCoverSource('/assets/course.png'),'/assets/course.png');
 assert.equal(safeCoverSource('/uploads/cover.png'),'/uploads/cover.png');
});
