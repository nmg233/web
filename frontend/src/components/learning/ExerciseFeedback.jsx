import { Alert, Space, Typography } from 'antd';

function answerText(value) {
  if (Array.isArray(value)) return value.join('、');
  if (value === true) return '正确';
  if (value === false) return '错误';
  return String(value ?? '-');
}

export default function ExerciseFeedback({ exercise, result }) {
  if (!exercise.attempted && !result) return null;
  const correct = exercise.attempted ? exercise.passed : result.correct;
  const score = exercise.attempted ? exercise.best_score : result.score;
  const answer = exercise.attempted ? exercise.correct_answer : result.correct_answer;
  const explanation = exercise.attempted ? exercise.explanation : result.explanation;
  const subjective = exercise.question_type === 'short_answer';
  const rubric = exercise.attempted ? exercise.rubric : result.rubric;
  return <Alert type={subjective ? 'info' : correct ? 'success' : 'warning'} showIcon message={subjective ? '已提交，不自动判对错；导师可评价' : correct ? '回答正确' : '已作答，本题回答不正确'}
    description={<Space direction="vertical" size={2}>
      {!subjective && <Typography.Text>本题得分：{score ?? 0} / {exercise.points} 分</Typography.Text>}
      <Typography.Text>{subjective ? '参考答案' : '标准答案'}：{answerText(answer)}</Typography.Text>
      <Typography.Text>答案详解：{explanation || '暂无答案详解。'}</Typography.Text>
      {rubric && <Typography.Text>评价要点：{rubric}</Typography.Text>}
      <Typography.Text type="secondary">本题作答已结束，不能重试；全部题目作答后可完成卡片。</Typography.Text>
    </Space>} />;
}
