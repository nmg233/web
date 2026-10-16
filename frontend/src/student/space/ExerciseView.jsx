import {runtimeText as runtimeCopyText} from '../../content/runtimeCopy';
import StudentCopyText from '../../content/ManagedText';
import {exerciseAnswer} from '../../utils/exerciseAnswer';
import {Space,Typography} from 'antd';
import Alert from '../visual/StudentAlert';
import Sentence from '../../content/Sentence';
import {copyText} from '../../content/copy';
import {PixelButton as Button,PixelTag} from '../visual/PixelUI';
const {Text}=Typography;

export default function ExerciseView({exercise,index,input,submitting=false,result=null,error='',hasAnswer=false,submit,readonly=false}){
  return <section className="study-exercise" aria-labelledby={`exercise-${exercise.id}`}>
      <PixelTag data-copy-bindings={JSON.stringify(['system.learning.008','system.learning.009','system.learning.010','system.learning.011','system.learning.012'])}>{<StudentCopyText id={'system.learning.007'}/>}{index + 1} · {{ single_choice: copyText('system.learning.008'), multiple_choice: copyText('system.learning.009'), true_false: copyText('system.learning.010'), short_answer: copyText('system.learning.011'), fill_blank: copyText('system.learning.012') }[exercise.question_type] || <StudentCopyText id={'system.learning.013'}/>}</PixelTag>
      <h5 id={`exercise-${exercise.id}`}>{exercise.prompt}</h5><fieldset disabled={readonly || exercise.attempted || submitting || Boolean(result)} aria-label={exercise.prompt}>{input}</fieldset>
      {!exercise.attempted && <Alert type="info" showIcon title={copyText('system.learning.014')}  data-copy-bindings={JSON.stringify(['system.learning.014'])}/>}
      <Button type="primary" onClick={submit} loading={submitting} disabled={readonly || exercise.attempted || Boolean(result) || !hasAnswer}>{<StudentCopyText id={'system.learning.015'}/>}</Button>
      {error && <Alert type="error" showIcon title={copyText('system.learning.016')} description={error}  data-copy-bindings={JSON.stringify(['system.learning.016'])}/>}
      {exercise.attempted && <Alert type={exercise.auto_graded===false?'info':exercise.passed ? 'success' : 'warning'} showIcon title={exercise.auto_graded===false?runtimeCopyText("student26.c19f3b6c4d2e1b12"):exercise.passed ? copyText('system.learning.017') : copyText('system.learning.018')} description={<Space orientation="vertical" size={2}><Text>{<StudentCopyText id={'system.learning.019'}/>}{exerciseAnswer(exercise.correct_answer,exercise.options)}</Text><Sentence as={Text}>{<StudentCopyText id={'system.learning.020'}/>}{exercise.explanation || <StudentCopyText id={'system.learning.021'}/>}</Sentence></Space>}  data-copy-bindings={JSON.stringify(['system.learning.017','system.learning.018'])}/>}
      {result && !exercise.attempted && <Alert type={result.correct===null?'info':result.correct ? 'success' : 'warning'} showIcon title={result.correct===null?runtimeCopyText("student26.c19f3b6c4d2e1b12"):result.correct ? copyText('system.learning.022') : copyText('system.learning.023')} description={<Space orientation="vertical" size={2}><Text>{<StudentCopyText id={'system.learning.024'}/>}{exerciseAnswer(result.correct_answer,exercise.options)}</Text><Sentence as={Text}>{<StudentCopyText id={'system.learning.025'}/>}{result.explanation || <StudentCopyText id={'system.learning.026'}/>}</Sentence></Space>}  data-copy-bindings={JSON.stringify(['system.learning.022','system.learning.023'])}/>}
      {(exercise.attempted || result) && (exercise.rubric || result?.rubric) && <Alert type="info" title={runtimeCopyText("student26.e77691fe0fd2aadf")} description={<Sentence>{exercise.rubric || result.rubric}</Sentence>} data-copy-bindings={JSON.stringify(["student26.e77691fe0fd2aadf"])}/>}
      {exercise.feedback?.content&&<Alert type="info" title={runtimeCopyText("student26.5c6de8ddeec52b35")} description={<Sentence>{exercise.feedback.content}</Sentence>} data-copy-bindings={JSON.stringify(["student26.5c6de8ddeec52b35"])}/>}
  </section>;
}
