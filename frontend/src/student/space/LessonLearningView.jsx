import ConfigCopyText from '../../content/ConfigText';
import {runtimeText as runtimeCopyText} from '../../content/runtimeCopy';
import StudentCopyText from '../../content/ManagedText';
import ArticleContent,{articleBlocks} from './ArticleContent';
import MarkdownContent from '../../components/common/MarkdownContent';
import ReplaySummary from '../../components/common/ReplaySummary';
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
export default function LessonLearningView({data,lesson,cards,progress,report,activeStage,courseId,lessonId,reportFields,stageDone,currentStep,stageReasons,navigate,setActiveStage,actionError,replayError,activeReplayId,playReplay,replayUrl,replayAttempt,video,onReplayLoaded,setReplayError,resourceError,downloadResource,submitting,finishReview,cardIndex,setCardIndex,activeCard,cardExercisesDone,finishCard,reportTone,form,submitReport,validationFailed,saveDraft,draftFailed,draftState,reflectionOpen,setReflectionOpen,reportError,maintenance=false,region=(_key,children)=>children,experiment,works,renderExercise,replayPlayer}){
  return <PageContainer><div className="study-workspace">
    <StudyHeader eyebrow={<><PixelIcon name="book" /><ConfigCopyText object={data.course} field="title" value={data.course.title}/></>} title={region("schedule",lesson.title)} description={siteTemplate("site.069298f6b6e23160", {slot0: (LEARNING_STEPS[activeStage])})} data-copy-bindings={JSON.stringify(["site.069298f6b6e23160"])}>
      <Button onClick={() => navigate(`/courses/${courseId}?lesson=${lessonId}`)} icon={<PixelIcon name="back" />}>{<StudentCopyText id={'system.learning.064'}/>}</Button>
      <Button onClick={() => navigate('/tasks')}>{<StudentCopyText id={'system.learning.065'}/>}</Button>
    </StudyHeader>
    <div className="study-layout">
      <aside className="study-stages" aria-label={copyText('system.learning.066')} data-copy-bindings={JSON.stringify(['system.learning.066'])}>
        <h3>{<StudentCopyText id={'system.learning.067'}/>}</h3><PixelProgress value={progress.percent || 0} label={copyText('system.learning.068')}  data-copy-bindings={JSON.stringify(['system.learning.068'])}/>
        <Sentence className="study-progress-note">{<StudentCopyText id={'system.learning.069'}/>}<br />{<StudentCopyText id={'system.learning.070'}/>}</Sentence>
        <nav aria-label={copyText('system.learning.071')} data-copy-bindings={JSON.stringify(['system.learning.071'])}><ol>{LEARNING_STEPS.map((title, index) => {
          const locked = !maintenance && index > currentStep && !(index === 3 && report);
          const status = locked ? copyText('system.learning.072') : index === 3 && report ? REPORT_STATUS[report.status]?.label : stageDone[index] ? copyText('system.learning.073') : copyText('system.learning.074');
          return <li key={title}><button type="button" className="study-stage" aria-current={activeStage === index ? 'step' : undefined} disabled={locked} onClick={() => setActiveStage(index)}>
            <span className="study-stage-number">{String(index + 1).padStart(2, '0')}</span><span><strong>{title}</strong><small>{activeStage === index ? <StudentCopyText id={'system.learning.075'}/> : ''}{status}</small>{locked && <small>{stageReasons[index]}</small>}</span>
          </button></li>;
        })}</ol></nav>
        <a className="study-stages-footer" href="#lesson-works">{<StudentCopyText id={'system.learning.076'}/>}</a>
      </aside>
      <div className="study-main">{data.read_only&&<Alert type="info" title={data.read_only_reason||runtimeCopyText("student26.21f9680e76ee274b")}/>}{data.report?.resubmission_required&&<Alert type="warning" title={runtimeCopyText("student26.3b4a61c7cff95f54")} description={runtimeCopyText("student26.0ffe7978c3bcd1a6")} data-copy-bindings={JSON.stringify(["student26.3b4a61c7cff95f54","student26.0ffe7978c3bcd1a6"])}/>}{data.content_version?.legacy_compat&&<Alert type="warning" title={runtimeCopyText("student26.ec158ace7c5fcca2")} description={data.content_version.repair?'管理员已补齐缺失内容：'+data.content_version.repair.reason:undefined} data-copy-bindings={JSON.stringify(["student26.ec158ace7c5fcca2"])}/>}
        {region("teaching_tip",lesson.teaching_tip&&<Alert type="info" title={<Sentence>{lesson.teaching_tip}</Sentence>}/>)}
        {actionError && <Alert type="error" showIcon title={actionError} />}
        {activeStage === 0 && <StudySection number="01" title={copyText('system.learning.077')} description={copyText('system.learning.078')} data-copy-bindings={JSON.stringify(['system.learning.077','system.learning.078'])}>
          {region("review_content",<Sentence className="study-prose">{lesson.review_content ?? lesson.description}</Sentence>)}{(maintenance||articleBlocks(lesson.article_blocks).length>0||lesson.article_url?.startsWith('https://'))&&region('article',<><h4>{lesson.article_title}</h4>{articleBlocks(lesson.article_blocks).length?<ArticleContent blocks={lesson.article_blocks} resources={data.resources}/>:lesson.article_url?.startsWith('https://')?<a href={lesson.article_url} target="_blank" rel="noopener noreferrer"><StudentCopyText id="lesson.article.open"/></a>:null}</>)}<section aria-label={copyText('system.learning.079')} data-copy-bindings={JSON.stringify(['system.learning.079'])}><h4>{<StudentCopyText id={'system.learning.080'}/>}</h4>
            {region("replays",null)}{replayError && <Alert type="warning" showIcon title={copyText('system.learning.081')} description={replayError} action={activeReplayId && <Button onClick={() => playReplay(activeReplayId)}>{<StudentCopyText id={'system.learning.082'}/>}</Button>}  data-copy-bindings={JSON.stringify(['system.learning.081'])}/>}
            {replayPlayer || (replayUrl ? <video ref={video} onLoadedMetadata={onReplayLoaded} key={`${replayUrl}:${replayAttempt}`} controls src={replayUrl} className="study-video" onError={() => setReplayError(copyText('system.learning.083'))} /> : !replayError && <Empty description={copyText('system.learning.084')}  data-copy-bindings={JSON.stringify(['system.learning.084'])}/>)}
            <ReplaySummary replay={data.replays.find(r=>r.id===activeReplayId)}/>{data.replays.find(r=>r.id===activeReplayId)?.description&&<Sentence><ConfigCopyText sentence object={data.replays.find(r=>r.id===activeReplayId)} field="description" value={data.replays.find(r=>r.id===activeReplayId).description}/></Sentence>}<Space wrap>{data.replays.map((replay) => <Button key={replay.id} type={activeReplayId === replay.id ? 'primary' : 'default'} icon={<PlayCircleOutlined />} onClick={() => playReplay(replay.id)}><ConfigCopyText object={replay} field="title" value={replay.title}/></Button>)}</Space>
          </section>
          <section className="study-subsection" aria-label={copyText('system.learning.085')} data-copy-bindings={JSON.stringify(['system.learning.085'])}><h4>{<StudentCopyText id={'system.learning.086'}/>}</h4>
            {region("resources",null)}{resourceError && <Alert type="warning" showIcon title={resourceError} />}
            {data.resources.length === 0 ? <Empty description={copyText('system.learning.087')}  data-copy-bindings={JSON.stringify(['system.learning.087'])}/> : data.resources.map((resource) => <div className="study-resource" key={resource.id} data-teaching-field="resources" data-object-id={resource.id} data-course-id={courseId} data-lesson-id={lessonId}><div><Text strong><ConfigCopyText object={resource} field="title" value={resource.title}/></Text>{resource.description && <Sentence><ConfigCopyText sentence object={resource} field="description" value={resource.description}/></Sentence>}</div>{resource.has_file ? <Button icon={<DownloadOutlined />} onClick={() => downloadResource(resource)}>{<StudentCopyText id={'system.learning.088'}/>}</Button> : <Text type="secondary">{<StudentCopyText id={'system.learning.089'}/>}</Text>}</div>)}
          </section>
          {experiment(0)}
          <div className="study-actions">{progress.review_completed ? <><PixelTag tone="success">{<StudentCopyText id={'system.learning.090'}/>}</PixelTag><Button type="primary" onClick={() => setActiveStage(1)}>{<StudentCopyText id={'system.learning.091'}/>}</Button></> : <Button type="primary" loading={submitting} disabled={maintenance} onClick={finishReview}>{<StudentCopyText id={'system.learning.092'}/>}</Button>}</div>
        </StudySection>}

        {activeStage === 1 && <StudySection number="02" title={copyText('system.learning.093')} description={copyText('system.learning.094')} data-copy-bindings={JSON.stringify(['system.learning.093','system.learning.094'])}>
          {region("cards",null)}{!maintenance && !progress.review_completed && <Alert type="warning" showIcon title={copyText('system.learning.095')}  data-copy-bindings={JSON.stringify(['system.learning.095'])}/>}
          {cards.length === 0 ? <Alert type="warning" showIcon title={copyText('system.learning.096')} description={copyText('system.learning.097')}  data-copy-bindings={JSON.stringify(['system.learning.096','system.learning.097'])}/> : <>
            <nav className="study-card-nav" aria-label={copyText('system.learning.098')} data-copy-bindings={JSON.stringify(['system.learning.098'])}>{cards.map((card, index) => <Button key={card.id} type={index === cardIndex ? 'primary' : 'default'} aria-pressed={index === cardIndex} icon={card.completed ? <CheckCircleOutlined /> : null} onClick={() => setCardIndex(index)} disabled={!maintenance && index > 0 && !cards[index - 1].completed}>{index + 1}. <ConfigCopyText object={card} field="title" value={card.title}/></Button>)}</nav>
            <div className="study-card-title"><h4 data-teaching-field="cards" data-object-id={activeCard.id} data-course-id={courseId} data-lesson-id={lessonId}><ConfigCopyText object={activeCard} field="title" value={activeCard.title}/></h4><PixelTag tone="current">{cardIndex + 1}/{cards.length}</PixelTag>{activeCard.completed && <PixelTag tone="success">{<StudentCopyText id={'system.learning.099'}/>}</PixelTag>}</div>
            {activeCard.summary && <Sentence className="study-card-summary"><ConfigCopyText sentence object={activeCard} field="summary" value={activeCard.summary}/></Sentence>}
            <div data-teaching-field="cards" data-course-id={courseId} data-lesson-id={lessonId}><MarkdownContent>{activeCard.content}</MarkdownContent></div>
            {activeCard.key_points && <Alert type="info" title={copyText('system.learning.100')} description={activeCard.key_points}  data-copy-bindings={JSON.stringify(['system.learning.100'])}/>}
            {activeCard.common_mistakes && <Alert type="warning" title={copyText('system.learning.101')} description={activeCard.common_mistakes}  data-copy-bindings={JSON.stringify(['system.learning.101'])}/>}
            {experiment(1,activeCard.id)}
            {(activeCard.exercises || []).map((exercise, index) => renderExercise(exercise,index))}
            {!activeCard.exercises?.length && <CopyBlock id="system.learning.102" as="p" className="study-help"/>}
            {!cardExercisesDone && <Alert type="info" showIcon title={copyText('system.learning.103')} style={{ marginTop: 16 }}  data-copy-bindings={JSON.stringify(['system.learning.103'])}/>}
            <div className="study-actions study-actions--between"><Button icon={<LeftOutlined />} disabled={cardIndex === 0} onClick={() => setCardIndex(cardIndex - 1)}>{<StudentCopyText id={'system.learning.104'}/>}</Button>{activeCard.completed ? <Button type="primary" icon={<RightOutlined />} disabled={cardIndex === cards.length - 1} onClick={() => setCardIndex(cardIndex + 1)}>{<StudentCopyText id={'system.learning.105'}/>}</Button> : <Button type="primary" loading={submitting} disabled={maintenance || !cardExercisesDone} onClick={() => finishCard(activeCard)}>{<StudentCopyText id={'system.learning.106'}/>}</Button>}</div>
            {progress.cards_done && <Button type="primary" block style={{ marginTop: 20 }} onClick={() => setActiveStage(2)}>{<StudentCopyText id={'system.learning.107'}/>}</Button>}
          </>}
        </StudySection>}

        {activeStage === 2 && <StudySection number="03" title={copyText('system.learning.108')} description={copyText('system.learning.109')} data-copy-bindings={JSON.stringify(['system.learning.108','system.learning.109'])}>
          {region("report_guidance",<Sentence className="study-prose">{lesson.report_guidance}</Sentence>)}{report && <Alert type={reportTone} showIcon title={siteTemplate("site.ee7472f3d349826c", {slot0: (report.version), slot1: (REPORT_STATUS[report.status]?.label || report.status), slot2: (Number.isInteger(report.score) ? ` · ${report.score} 分` : '')})} description={report.review_comment}  data-copy-bindings={JSON.stringify(["site.ee7472f3d349826c"])}/>}
          {(!report || report.status === 'rejected') && <Form form={form} layout="vertical" onFinish={submitReport} onFinishFailed={validationFailed} disabled={maintenance || !progress.report_unlocked || submitting} onValuesChange={saveDraft}>
            <Alert type={draftFailed ? 'error' : 'info'} showIcon title={draftState} description={copyText('system.learning.111')}  data-copy-bindings={JSON.stringify(['system.learning.111'])}/>
            <h4>{<StudentCopyText id={'system.learning.112'}/>}</h4>
            {reportFields.map(([name, label]) => <Form.Item key={name} name={name} label={label} rules={name === 'summary' ? [{ required: true, whitespace: true, message: copyText('system.learning.113') }] : []}><Input.TextArea rows={name === 'summary' ? 4 : 2} /></Form.Item>)}
            <Collapse activeKey={reflectionOpen} onChange={setReflectionOpen} items={[{ key: 'reflection', forceRender: true, label: copyText('next2.reflection.reportLabel'), children: <OpenReflectionForm prefix={["reflection"]}/> ,__copyIds:{"label":"next2.reflection.reportLabel"}}]}  data-copy-bindings={JSON.stringify(['next2.reflection.reportLabel'])}/>
            {!progress.report_unlocked && <Alert type="warning" title={copyText('system.learning.116')}  data-copy-bindings={JSON.stringify(['system.learning.116'])}/>}
            <div className="study-submit-result" aria-live="polite">{reportError && <Alert type="error" showIcon title={copyText('system.learning.117')} description={reportError}  data-copy-bindings={JSON.stringify(['system.learning.117'])}/>}</div>
            <div className="study-actions"><Button type="primary" htmlType="submit" loading={submitting}>{<StudentCopyText id={'system.learning.118'}/>}</Button><CopyBlock id="system.learning.119" as="p" /></div>
          </Form>}
          {report && report.status !== 'rejected' && <><dl className="study-reading-fields">{reportFields.map(([key, label]) => <div key={key}><dt>{label}</dt><Sentence as="dd">{report[key] || <StudentCopyText id={'system.learning.120'}/>}</Sentence></div>)}</dl><ReflectionFields reflection={data.reflection || {}} /><Button type="primary" onClick={() => setActiveStage(3)}>{<StudentCopyText id={'system.learning.122'}/>}</Button></>}
          {experiment(2)}
        </StudySection>}

        {activeStage === 3 && <StudySection number="04" title={copyText('system.learning.123')} description={copyText('system.learning.124')} data-copy-bindings={JSON.stringify(['system.learning.123','system.learning.124'])}>
          <Alert type={reportTone} showIcon title={report ? `${REPORT_STATUS[report.status]?.label}${Number.isInteger(report.score) ? ` · ${report.score} 分` : ''}` : copyText('system.learning.125')} description={report?.status === 'submitted' ? copyText('system.learning.126') : report?.status === 'rejected' ? copyText('system.learning.127') : report?.status === 'approved' ? copyText('system.learning.128') : copyText('system.learning.129')}  data-copy-bindings={JSON.stringify(['system.learning.125','system.learning.126','system.learning.127','system.learning.128','system.learning.129'])}/>
          {report && <><div className="study-detail-meta"><span>{<StudentCopyText id={'system.learning.130'}/>}{report.version}{<StudentCopyText id={'system.learning.131'}/>}</span>{report.submitted_at && <span>{<StudentCopyText id={'system.learning.132'}/>}{formatBeijingTime(report.submitted_at)}</span>}</div><div className={`study-feedback${report.status === 'rejected' ? ' study-feedback--rejected' : ''}`}><h4>{<StudentCopyText id={'system.learning.133'}/>}</h4><Sentence className="study-prose">{report.review_comment || <StudentCopyText id={'system.learning.134'}/>}</Sentence>{Number.isInteger(report.score) && <Sentence>{<StudentCopyText id={'system.learning.135'}/>}<strong>{report.score}{<StudentCopyText id={'system.learning.136'}/>}</strong></Sentence>}</div></>}
          <div className="study-actions"><Button type="primary" onClick={() => setActiveStage(2)}>{report?.status === 'rejected' ? <StudentCopyText id={'system.learning.137'}/> : <StudentCopyText id={'system.learning.138'}/>}</Button><Button onClick={() => setActiveStage(1)}>{<StudentCopyText id={'system.learning.139'}/>}</Button></div>
          {experiment(3)}
        </StudySection>}
      </div>
    </div>
    {works}
  </div></PageContainer>;
}
