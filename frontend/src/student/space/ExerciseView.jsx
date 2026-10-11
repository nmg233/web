import {Space,Typography} from 'antd';
import Alert from '../visual/StudentAlert';
import Sentence from '../../content/Sentence';
import {copyText} from '../../content/copy';
import {PixelButton as Button,PixelTag} from '../visual/PixelUI';
const {Text}=Typography;
function answerText(value) {
  if (Array.isArray(value)) return value.join('、');
  if (value === true) return copyText('system.learning.001');
  if (value === false) return copyText('system.learning.002');
  return String(value ?? '-');
}

export default function ExerciseView({exercise,index,input,submitting=false,result=null,error='',hasAnswer=false,submit,readonly=false}){
  return <section className="study-exercise" aria-labelledby={`exercise-${exercise.id}`}>
      <PixelTag>{copyText('system.learning.007')}{index + 1} · {{ single_choice: copyText('system.learning.008'), multiple_choice: copyText('system.learning.009'), true_false: copyText('system.learning.010'), short_answer: copyText('system.learning.011'), fill_blank: copyText('system.learning.012') }[exercise.question_type] || copyText('system.learning.013')}</PixelTag>
      <h5 id={`exercise-${exercise.id}`}>{exercise.prompt}</h5><fieldset disabled={readonly || exercise.attempted || submitting || Boolean(result)} aria-label={exercise.prompt}>{input}</fieldset>
      {!exercise.attempted && <Alert type="info" showIcon title={copyText('system.learning.014')} />}
      <Button type="primary" onClick={submit} loading={submitting} disabled={readonly || exercise.attempted || Boolean(result) || !hasAnswer}>{copyText('system.learning.015')}</Button>
      {error && <Alert type="error" showIcon title={copyText('system.learning.016')} description={error} />}
      {exercise.attempted && <Alert type={exercise.passed ? 'success' : 'warning'} showIcon title={exercise.passed ? copyText('system.learning.017') : copyText('system.learning.018')} description={<Space orientation="vertical" size={2}><Text>{copyText('system.learning.019')}{answerText(exercise.correct_answer)}</Text><Sentence as={Text}>{copyText('system.learning.020')}{exercise.explanation || copyText('system.learning.021')}</Sentence></Space>} />}
      {result && !exercise.attempted && <Alert type={result.correct ? 'success' : 'warning'} showIcon title={result.correct ? copyText('system.learning.022') : copyText('system.learning.023')} description={<Space orientation="vertical" size={2}><Text>{copyText('system.learning.024')}{answerText(result.correct_answer)}</Text><Sentence as={Text}>{copyText('system.learning.025')}{result.explanation || copyText('system.learning.026')}</Sentence></Space>} />}
  </section>;
}
