export function replayFileError(file) {
  if (!file) return '请选择回放视频文件';
  if (!/\.(mp4|webm)$/i.test(file.name)) return '仅支持 MP4 或 WebM 视频';
  if (!file.size) return '不能上传空视频文件';
  if (file.size > 500 * 1024 * 1024) return '视频不能超过 500MB';
  return '';
}

// 新上传只能使用入口携带的课时，不能从可编辑表单中取课时 ID。
export function lessonReplayFields(courseId, lessons, targetLesson, values) {
  const lesson = lessons.find((item) => item.id === targetLesson?.id);
  if (!lesson || Number(lesson.course_id) !== Number(courseId) || lesson.status === 'cancelled') {
    throw new Error('该课时已不可上传，请刷新课程后重试');
  }
  return {
    lesson_id: String(lesson.id), title: values.title,
    description: values.description || '', summary: values.summary || '',
    duration_seconds: values.duration_seconds || '', recording_date: values.recording_date || '',
    sort_order: values.sort_order || '0',
  };
}
