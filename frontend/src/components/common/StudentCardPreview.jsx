import { useState } from 'react';
import { Alert, Button, Card, Checkbox, Input, Radio, Space, Typography } from 'antd';
import MarkdownContent from './MarkdownContent';
import { exerciseAnswer } from '../../utils/exerciseAnswer';

function PreviewExercise({ exercise }) {
  const [answer, setAnswer] = useState(); const [submitted, setSubmitted] = useState(false);
  const options = (exercise.options || []).map((o) => typeof o === 'object' ? { label:o.label ?? o.text, value:o.value ?? o.key } : {label:o,value:o});
  return <Card size="small" style={{ marginTop: 12 }}>
    <Typography.Paragraph strong>{exercise.prompt}</Typography.Paragraph>
    {exercise.question_type === 'single_choice' && <Radio.Group disabled={submitted} options={options} value={answer} onChange={(e) => setAnswer(e.target.value)} />}
    {exercise.question_type === 'multiple_choice' && <Checkbox.Group disabled={submitted} options={options} value={answer} onChange={setAnswer} />}
    {exercise.question_type === 'true_false' && <Radio.Group disabled={submitted} options={[{label:'正确',value:true},{label:'错误',value:false}]} value={answer} onChange={(e) => setAnswer(e.target.value)} />}
    {exercise.question_type === 'fill_blank' && (exercise.answer?.blanks || [null]).map((_,i) => <Input key={i} disabled={submitted} placeholder={`第 ${i + 1} 空`} value={answer?.[i] || ''} onChange={(e) => { const next=[...(answer || [])]; next[i]=e.target.value; setAnswer(next); }} style={{marginBottom:8}} />)}
    {exercise.question_type === 'short_answer' && <Input.TextArea disabled={submitted} value={answer} onChange={(e) => setAnswer(e.target.value)} />}
    <div style={{marginTop:12}}>{submitted ? <Space direction="vertical"><Typography.Text>模拟作答：{exerciseAnswer(answer,exercise.options)}</Typography.Text><Typography.Text>参考答案：{exerciseAnswer(exercise.answer,exercise.options)}</Typography.Text><MarkdownContent>{exercise.explanation}</MarkdownContent><Button onClick={() => {setSubmitted(false);setAnswer(undefined);}}>重置预览</Button></Space> : <Button onClick={() => setSubmitted(true)}>预览提交与详解（不保存）</Button>}</div>
  </Card>;
}

export default function StudentCardPreview({ card }) {
  return <><Alert showIcon type="info" message="导师本地预览：不绑定学生版本，不保存作答，不消耗答题机会。" style={{marginBottom:16}} /><MarkdownContent>{card.content}</MarkdownContent>{(card.exercises || []).map((e) => <PreviewExercise key={e.id} exercise={e} />)}</>;
}
