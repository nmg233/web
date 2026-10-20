import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lessonReplayFields, replayFileError } from '../src/utils/replayUpload.js';

const lessons = [{ id: 1, course_id: 10, status: 'completed' }, { id: 2, course_id: 10, status: 'completed' }, { id: 3, course_id: 20, status: 'completed' }, { id: 4, course_id: 10, status: 'cancelled' }];
test('新视频始终绑定入口课时，忽略表单伪造的课时且不生成共享回放', () => {
  const fields = lessonReplayFields('10', lessons, lessons[1], { title: '视频', description: '简介', lesson_id: 1 });
  assert.equal(fields.lesson_id, '2');
  assert.equal(fields.description, '简介');
  assert.equal(fields.sort_order, '0');
  assert.equal(lessonReplayFields(10, lessons, lessons[0], { title: '视频' }).lesson_id, '1');
  for (const lesson of [null, { id: 999 }, lessons[2], lessons[3]]) assert.throws(() => lessonReplayFields(10, lessons, lesson, {}), /该课时已不可上传/);
});
test('上传前校验视频扩展名、空文件及1.5GB边界', () => {
  assert.match(replayFileError(null), /请选择/);
  assert.match(replayFileError({ name: 'video.txt', size: 20 }), /仅支持/);
  assert.match(replayFileError({ name: 'video.mp4', size: 0 }), /空视频/);
  assert.match(replayFileError({ name: 'video.webm', size: 1_500_000_000 + 1 }), /1\.5GB/);
  assert.equal(replayFileError({ name: 'video.MP4', size: 1_500_000_000 }), '');
  assert.equal(replayFileError({ name: 'video.webm', size: 20 }), '');
});
