import {test} from 'node:test';
import assert from 'node:assert/strict';
import {returnContext} from '../src/utils/returnContext.js';
test('返回只接受同站指定业务页，保留筛选分页，不接受外站或无关管理入口', () => {
  for(const target of ['/observer/students?course_id=2&page=3','/observer/students/3','/mentor/reviews?status=rejected&page=2','/courses/1']) assert.equal(returnContext(target,'/courses'),target);
  for(const target of [null,{},'https://example.com','//example.com','/dashboard/ai/settings','/courses/../../dashboard']) assert.equal(returnContext(target,'/courses'),'/courses');
});
