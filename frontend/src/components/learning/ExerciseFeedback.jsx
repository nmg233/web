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
  return <Alert type={correct ? 'success' : 'warning'} showIcon message={correct ? '回答正确' : '已作答，本题回答不正确'}
    description={<Space direction="vertical" size={2}>
      <Typography.Text>本题得分：{score ?? 0} / {exercise.points} 分</Typography.Text>
      <Typography.Text>标准答案：{answerText(answer)}</Typography.Text>
      <Typography.Text>答案详解：{explanation || '暂无答案详解。'}</Typography.Text>
      <Typography.Text type="secondary">本题作答已结束，不能重试；全部题目作答后可完成卡片。</Typography.Text>
    </Space>} />;
}
