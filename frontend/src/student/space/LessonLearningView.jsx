import {Space,Typography,Empty,Form,Input,Collapse} from 'antd';
import {CheckCircleOutlined,DownloadOutlined,PlayCircleOutlined,LeftOutlined,RightOutlined} from '@ant-design/icons';
import {copyTemplate as siteTemplate,copyText} from '../../content/copy';
import Sentence from '../../content/Sentence';
import CopyBlock from '../../content/CopyBlock';
import Alert from '../visual/StudentAlert';
import PageContainer from '../../components/common/PageContainer';
import {LEARNING_STEPS,REPORT_STATUS} from '../../constants/status';
import {PixelButton as Button,PixelProgress,PixelTag} from '../visual/PixelUI';
import {StudyHeader,StudySection} from '../visual/StudyUI';
import PixelIcon from '../visual/PixelIcon';
import OpenReflectionForm from '../OpenReflectionForm';
import {ReflectionFields} from '../ArchiveRecords';
import {formatBeijingTime} from '../../utils/date';
const {Text}=Typography;
// Shared presentation. All student mutations remain in LessonLearn; authoring supplies read-only slots.
export default function LessonLearningView({data,lesson,cards,progress,report,activeStage,courseId,lessonId,reportFields,stageDone,currentStep,stageReasons,navigate,setActiveStage,actionError,replayError,activeReplayId,playReplay,replayUrl,replayAttempt,setReplayError,resourceError,downloadResource,submitting,finishReview,cardIndex,setCardIndex,activeCard,cardExercisesDone,finishCard,reportTone,form,submitReport,validationFailed,saveDraft,draftFailed,draftState,reflectionOpen,setReflectionOpen,reportError,maintenance=false,region=(_key,children)=>children,experiment,works,renderExercise}){
  return <PageContainer><div className="study-workspace">
    <StudyHeader eyebrow={<><PixelIcon name="book" />{data.course.title}</>} title={region("schedule",lesson.title)} description={siteTemplate("site.069298f6b6e23160", {slot0: (LEARNING_STEPS[activeStage])})}>
      <Button onClick={() => navigate(`/courses/${courseId}?lesson=${lessonId}`)} icon={<PixelIcon name="back" />}>{copyText('system.learning.064')}</Button>
      <Button onClick={() => navigate('/tasks')}>{copyText('system.learning.065')}</Button>
    </StudyHeader>
    <div className="study-layout">
      <aside className="study-stages" aria-label={copyText('system.learning.066')}>
        <h3>{copyText('system.learning.067')}</h3><PixelProgress value={progress.percent || 0} label={copyText('system.learning.068')} />
        <Sentence className="study-progress-note">{copyText('system.learning.069')}<br />{copyText('system.learning.070')}</Sentence>
        <nav aria-label={copyText('system.learning.071')}><ol>{LEARNING_STEPS.map((title, index) => {
          const locked = !maintenance && index > currentStep && !(index === 3 && report);
          const status = locked ? copyText('system.learning.072') : index === 3 && report ? REPORT_STATUS[report.status]?.label : stageDone[index] ? copyText('system.learning.073') : copyText('system.learning.074');
          return <li key={title}><button type="button" className="study-stage" aria-current={activeStage === index ? 'step' : undefined} disabled={locked} onClick={() => setActiveStage(index)}>
            <span className="study-stage-number">{String(index + 1).padStart(2, '0')}</span><span><strong>{title}</strong><small>{activeStage === index ? copyText('system.learning.075') : ''}{status}</small>{locked && <small>{stageReasons[index]}</small>}</span>
          </button></li>;
        })}</ol></nav>
        <a className="study-stages-footer" href="#lesson-works">{copyText('system.learning.076')}</a>
      </aside>
      <div className="study-main">
        {region("teaching_tip",lesson.teaching_tip&&<Alert type="info" title={<Sentence>{lesson.teaching_tip}</Sentence>}/>)}
        {actionError && <Alert type="error" showIcon title={actionError} />}
        {activeStage === 0 && <StudySection number="01" title={copyText('system.learning.077')} description={copyText('system.learning.078')}>
          {region("review_content",<Sentence className="study-prose">{lesson.review_content ?? lesson.description}</Sentence>)}<section aria-label={copyText('system.learning.079')}><h4>{copyText('system.learning.080')}</h4>
            {region("replays",null)}{replayError && <Alert type="warning" showIcon title={copyText('system.learning.081')} description={replayError} action={activeReplayId && <Button onClick={() => playReplay(activeReplayId)}>{copyText('system.learning.082')}</Button>} />}
            {replayUrl ? <video key={`${replayUrl}:${replayAttempt}`} controls src={replayUrl} className="study-video" onError={() => setReplayError(copyText('system.learning.083'))} /> : !replayError && <Empty description={copyText('system.learning.084')} />}
            <Space wrap>{data.replays.map((replay) => <Button key={replay.id} type={activeReplayId === replay.id ? 'primary' : 'default'} icon={<PlayCircleOutlined />} onClick={() => playReplay(replay.id)}>{replay.title}</Button>)}</Space>
          </section>
          <section className="study-subsection" aria-label={copyText('system.learning.085')}><h4>{copyText('system.learning.086')}</h4>
            {region("resources",null)}{resourceError && <Alert type="warning" showIcon title={resourceError} />}
            {data.resources.length === 0 ? <Empty description={copyText('system.learning.087')} /> : data.resources.map((resource) => <div className="study-resource" key={resource.id}><div><Text strong>{resource.title}</Text>{resource.description && <Sentence>{resource.description}</Sentence>}</div>{resource.has_file ? <Button icon={<DownloadOutlined />} onClick={() => downloadResource(resource)}>{copyText('system.learning.088')}</Button> : <Text type="secondary">{copyText('system.learning.089')}</Text>}</div>)}
          </section>
          {experiment(0)}
          <div className="study-actions">{progress.review_completed ? <><PixelTag tone="success">{copyText('system.learning.090')}</PixelTag><Button type="primary" onClick={() => setActiveStage(1)}>{copyText('system.learning.091')}</Button></> : <Button type="primary" loading={submitting} disabled={maintenance} onClick={finishReview}>{copyText('system.learning.092')}</Button>}</div>
        </StudySection>}

        {activeStage === 1 && <StudySection number="02" title={copyText('system.learning.093')} description={copyText('system.learning.094')}>
          {region("cards",null)}{!maintenance && !progress.review_completed && <Alert type="warning" showIcon title={copyText('system.learning.095')} />}
          {cards.length === 0 ? <Alert type="warning" showIcon title={copyText('system.learning.096')} description={copyText('system.learning.097')} /> : <>
            <nav className="study-card-nav" aria-label={copyText('system.learning.098')}>{cards.map((card, index) => <Button key={card.id} type={index === cardIndex ? 'primary' : 'default'} aria-pressed={index === cardIndex} icon={card.completed ? <CheckCircleOutlined /> : null} onClick={() => setCardIndex(index)} disabled={!maintenance && index > 0 && !cards[index - 1].completed}>{index + 1}. {card.title}</Button>)}</nav>
            <div className="study-card-title"><h4>{activeCard.title}</h4><PixelTag tone="current">{cardIndex + 1}/{cards.length}</PixelTag>{activeCard.completed && <PixelTag tone="success">{copyText('system.learning.099')}</PixelTag>}</div>
            {activeCard.summary && <Sentence className="study-card-summary">{activeCard.summary}</Sentence>}
            <Sentence className="study-prose">{activeCard.content}</Sentence>
            {activeCard.key_points && <Alert type="info" title={copyText('system.learning.100')} description={activeCard.key_points} />}
            {activeCard.common_mistakes && <Alert type="warning" title={copyText('system.learning.101')} description={activeCard.common_mistakes} />}
            {experiment(1,activeCard.id)}
            {(activeCard.exercises || []).map((exercise, index) => renderExercise(exercise,index))}
            {!activeCard.exercises?.length && <CopyBlock id="system.learning.102" as="p" className="study-help"/>}
            {!cardExercisesDone && <Alert type="info" showIcon title={copyText('system.learning.103')} style={{ marginTop: 16 }} />}
            <div className="study-actions study-actions--between"><Button icon={<LeftOutlined />} disabled={cardIndex === 0} onClick={() => setCardIndex(cardIndex - 1)}>{copyText('system.learning.104')}</Button>{activeCard.completed ? <Button type="primary" icon={<RightOutlined />} disabled={cardIndex === cards.length - 1} onClick={() => setCardIndex(cardIndex + 1)}>{copyText('system.learning.105')}</Button> : <Button type="primary" loading={submitting} disabled={maintenance || !cardExercisesDone} onClick={() => finishCard(activeCard)}>{copyText('system.learning.106')}</Button>}</div>
            {progress.cards_done && <Button type="primary" block style={{ marginTop: 20 }} onClick={() => setActiveStage(2)}>{copyText('system.learning.107')}</Button>}
          </>}
        </StudySection>}

        {activeStage === 2 && <StudySection number="03" title={copyText('system.learning.108')} description={copyText('system.learning.109')}>
          {region("report_guidance",<Sentence className="study-prose">{lesson.report_guidance}</Sentence>)}{report && <Alert type={reportTone} showIcon title={siteTemplate("site.ee7472f3d349826c", {slot0: (report.version), slot1: (REPORT_STATUS[report.status]?.label || report.status), slot2: (Number.isInteger(report.score) ? ` · ${report.score} 分` : '')})} description={report.review_comment} />}
          {(!report || report.status === 'rejected') && <Form form={form} layout="vertical" onFinish={submitReport} onFinishFailed={validationFailed} disabled={maintenance || !progress.report_unlocked || submitting} onValuesChange={saveDraft}>
            <Alert type={draftFailed ? 'error' : 'info'} showIcon title={draftState} description={copyText('system.learning.111')} />
            <h4>{copyText('system.learning.112')}</h4>
            {reportFields.map(([name, label]) => <Form.Item key={name} name={name} label={label} rules={name === 'summary' ? [{ required: true, whitespace: true, message: copyText('system.learning.113') }] : []}><Input.TextArea rows={name === 'summary' ? 4 : 2} /></Form.Item>)}
            <Collapse activeKey={reflectionOpen} onChange={setReflectionOpen} items={[{ key: 'reflection', forceRender: true, label: copyText('next2.reflection.reportLabel'), children: <OpenReflectionForm prefix={["reflection"]}/> }]} />
            {!progress.report_unlocked && <Alert type="warning" title={copyText('system.learning.116')} />}
            <div className="study-submit-result" aria-live="polite">{reportError && <Alert type="error" showIcon title={copyText('system.learning.117')} description={reportError} />}</div>
            <div className="study-actions"><Button type="primary" htmlType="submit" loading={submitting}>{copyText('system.learning.118')}</Button><CopyBlock id="system.learning.119" as="p" /></div>
          </Form>}
          {report && report.status !== 'rejected' && <><dl className="study-reading-fields">{reportFields.map(([key, label]) => <div key={key}><dt>{label}</dt><Sentence as="dd">{report[key] || copyText('system.learning.120')}</Sentence></div>)}</dl><ReflectionFields reflection={data.reflection || {}} /><Button type="primary" onClick={() => setActiveStage(3)}>{copyText('system.learning.122')}</Button></>}
          {experiment(2)}
        </StudySection>}

        {activeStage === 3 && <StudySection number="04" title={copyText('system.learning.123')} description={copyText('system.learning.124')}>
          <Alert type={reportTone} showIcon title={report ? `${REPORT_STATUS[report.status]?.label}${Number.isInteger(report.score) ? ` · ${report.score} 分` : ''}` : copyText('system.learning.125')} description={report?.status === 'submitted' ? copyText('system.learning.126') : report?.status === 'rejected' ? copyText('system.learning.127') : report?.status === 'approved' ? copyText('system.learning.128') : copyText('system.learning.129')} />
          {report && <><div className="study-detail-meta"><span>{copyText('system.learning.130')}{report.version}{copyText('system.learning.131')}</span>{report.submitted_at && <span>{copyText('system.learning.132')}{formatBeijingTime(report.submitted_at)}</span>}</div><div className={`study-feedback${report.status === 'rejected' ? ' study-feedback--rejected' : ''}`}><h4>{copyText('system.learning.133')}</h4><Sentence className="study-prose">{report.review_comment || copyText('system.learning.134')}</Sentence>{Number.isInteger(report.score) && <Sentence>{copyText('system.learning.135')}<strong>{report.score}{copyText('system.learning.136')}</strong></Sentence>}</div></>}
          <div className="study-actions"><Button type="primary" onClick={() => setActiveStage(2)}>{report?.status === 'rejected' ? copyText('system.learning.137') : copyText('system.learning.138')}</Button><Button onClick={() => setActiveStage(1)}>{copyText('system.learning.139')}</Button></div>
          {experiment(3)}
        </StudySection>}
      </div>
    </div>
    {works}
  </div></PageContainer>;
}
