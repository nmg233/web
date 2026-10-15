import {runtimeText as runtimeCopyText} from '../../content/runtimeCopy';
import StudentCopyText from '../../content/ManagedText';
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
    {exercise.question_type === 'true_false' && <Radio.Group disabled={submitted} options={[{label:runtimeCopyText("student26.943191f6b60b00bc"),value:true},{label:runtimeCopyText("student26.8dd2a7067dec119d"),value:false}]} value={answer} onChange={(e) => setAnswer(e.target.value)}  data-copy-bindings={JSON.stringify(["student26.943191f6b60b00bc","student26.8dd2a7067dec119d"])}/>}
    {exercise.question_type === 'fill_blank' && (exercise.answer?.blanks || [null]).map((_,i) => <Input key={i} disabled={submitted} placeholder={`第 ${i + 1} 空`} value={answer?.[i] || ''} onChange={(e) => { const next=[...(answer || [])]; next[i]=e.target.value; setAnswer(next); }} style={{marginBottom:8}} />)}
    {exercise.question_type === 'short_answer' && <Input.TextArea disabled={submitted} value={answer} onChange={(e) => setAnswer(e.target.value)} />}
    <div style={{marginTop:12}}>{submitted ? <Space direction="vertical"><Typography.Text><StudentCopyText id="student26.0682173a8312dc36"/>{exerciseAnswer(answer,exercise.options)}</Typography.Text><Typography.Text><StudentCopyText id="student26.54084c01fb9285b3"/>{exerciseAnswer(exercise.answer,exercise.options)}</Typography.Text><MarkdownContent>{exercise.explanation}</MarkdownContent><Button onClick={() => {setSubmitted(false);setAnswer(undefined);}}><StudentCopyText id="student26.65364d9c35fdbdc5"/></Button></Space> : <Button onClick={() => setSubmitted(true)}><StudentCopyText id="student26.3876fd54e61c6cf0"/></Button>}</div>
  </Card>;
}

export default function StudentCardPreview({ card }) {
  return <><Alert showIcon type="info" message="导师本地预览：不绑定学生版本，不保存作答，不消耗答题机会。" style={{marginBottom:16}} /><MarkdownContent>{card.content}</MarkdownContent>{(card.exercises || []).map((e) => <PreviewExercise key={e.id} exercise={e} />)}</>;
}
