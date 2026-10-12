import SignedReplayPlayer from '../components/common/SignedReplayPlayer';
import ReplaySummary from '../components/common/ReplaySummary';
import {copyText as siteText} from "../content/copy";
import Alert from '../student/visual/StudentAlert';
import Sentence from '../content/Sentence';
import {copyText} from '../content/copy';
import CopyBlock from '../content/CopyBlock';
import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import Link from './space/SpaceLink';


import {useCourseApis} from './useCourseApis';
import { useAuth } from '../store/AuthContext';
import useRemoteResource from '../hooks/useRemoteResource';
import { ServicePage, ReadState } from '../components/ServiceUI';
import { requestError } from '../utils/requestError';
import { formatBeijingTime } from '../utils/date';
import { STUDENT_ACCESS_CHECK } from './accessPolicy';
import { StudySection } from './visual/StudyUI';
import { PixelButton, PixelPanel, PixelTag } from './visual/PixelUI';
import { courseReadError, replayDuration } from './compatibilityModel';
import { workStatus } from './archiveModel';
import CourseResourceDownload from './CourseResourceDownload';
import useCourseResource from './useCourseResource';
import './visual/pixel-compatibility.css';

export default function CourseReview() {
  const { id } = useParams(), { user } = useAuth();
  return <Review key={`${user.id}:${id}`} id={id} studentId={user.id} />;
}
function Review({ id, studentId }) {
 const {courseAPI}=useCourseApis();
  const read = useCallback(() => courseAPI.detail(id), [id,courseAPI]);
  const { data, loading, error, reload } = useCourseResource(read, id);
  return <ServicePage title={copyText('system.review.001')} eyebrow={siteText("site.ba42351482812fef")} description={data?.course.title || copyText('system.review.002')} actions={<Link to={`/courses/${id}`}>{copyText('system.review.003')}</Link>}>
    {error ? <PixelPanel className="compat-main-error"><Alert role="alert" type="warning" title={courseReadError(error)} description={requestError(error)} /><div className="compat-row-actions"><PixelButton onClick={reload}>{copyText('system.review.004')}</PixelButton><Link to="/explore">{copyText('system.review.005')}</Link></div></PixelPanel>
      : <ReadState loading={loading} object={siteText("site.2769f239632b60b1")}>{data && <>
        <PixelPanel className="review-summary"><div><span className="compat-kicker">{copyText('system.review.006')}</span><h3>{data.course.driving_question || data.course.title}</h3></div>{data.course.description&&<Sentence>{data.course.description}</Sentence>}</PixelPanel>
        <div className="review-media-layout"><ReplayRegion courseId={id} /><StudySection number="03" title={copyText('system.review.008')} description={copyText('system.review.009')} className="review-resources">
          {data.resources?.length ? <ul className="compat-records">{data.resources.map(resource => <li key={resource.id}><PixelTag>{({ courseware: copyText('system.review.010'), video: copyText('system.review.011'), lesson_plan: copyText('system.review.012'), guide_card: copyText('system.review.013'), template: copyText('system.review.014'), other: copyText('system.review.015') })[resource.resource_type] || copyText('system.review.016')}</PixelTag><h4>{resource.title || copyText('system.review.017')}</h4>
            {resource.has_file ? <CourseResourceDownload resource={resource} courseId={id} /> : <CopyBlock id="system.review.018" as="p" className="compat-muted"/>}</li>)}</ul> : <CopyBlock id="system.review.019" as="p" className="compat-empty"/>}
        </StudySection></div>
        <div className="review-record-layout"><StudySection number="04" title={copyText('system.review.020')} description={copyText('system.review.021')}>
          {data.tasks?.length ? <ul className="compat-records">{data.tasks.map(task => <li key={task.id}><h4>{task.title}</h4><Sentence className="compat-muted">{task.lesson_title || copyText('system.review.022')}{copyText('system.review.023')}{task.deadline ? formatBeijingTime(task.deadline) : copyText('system.review.024')}</Sentence><Link to={`/courses/${id}/lessons/${task.lesson_id}/learn`}>{copyText('system.review.025')}</Link></li>)}</ul> : <CopyBlock id="system.review.026" as="p" className="compat-empty"/>}
        </StudySection><WorksRegion courseId={id} studentId={studentId} onCourseInvalid={reload} /></div>
      </>}</ReadState>}
  </ServicePage>;
}
function WorksRegion({ courseId, studentId, onCourseInvalid }) {
 const {courseAPI,workAPI}=useCourseApis();
  const read = useCallback(async () => {
    const payload = await workAPI.list({ course_id: courseId });
    // 课程空间接口按真实对象归属过滤；课程回读成功后再展示本人版本。
    try { await courseAPI.detail(courseId); }
    catch (error) {
      if ([403, 404].includes(error.response?.status) || (error.response?.status === 400 && error.response?.data?.error === '课程不存在')) void onCourseInvalid();
      throw error;
    }
    return (payload.works || []).filter(work => String(work.student_id) === String(studentId));
  }, [courseId, studentId, onCourseInvalid,courseAPI,workAPI]);
  const state = useRemoteResource(read);
  return <StudySection number="05" title={copyText('system.review.028')} description={copyText('system.review.029')} className="review-works">
    <ReadState {...state} object={siteText("site.63594e340fce617c")} empty={!state.data?.length} emptyText={siteText("site.661d71434bdc4f8a")}>
      <ul className="compat-records">{state.data?.map(work => { const status = workStatus(work); return <li key={work.id}><div className="compat-tags"><PixelTag tone={status.tone}>{status.label}</PixelTag><span>{copyText('system.review.030')}{work.version || 1}{copyText('system.review.031')}</span></div><h4>{work.title}</h4><Link to={`/works/${work.id}`}>{status.revisable ? copyText('system.review.032') : copyText('system.review.033')} →</Link></li>; })}</ul>
    </ReadState>
  </StudySection>;
}
function ReplayRegion({ courseId }) {
 const {courseAPI}=useCourseApis();
  const read = useCallback(() => courseAPI.listReplays(courseId), [courseId,courseAPI]);
  const state = useRemoteResource(read);
  const [selection, setSelection] = useState(null);
  const choose = replay => setSelection(replay);
  const reload = () => { setSelection(null); void state.reload(); };
  const mediaFailed = () => window.dispatchEvent(new CustomEvent(STUDENT_ACCESS_CHECK));
  return <StudySection number="02" title={copyText('system.review.036')} description={copyText('system.review.037')} className="review-replays">
    <ReadState {...state} reload={reload} object={siteText("site.3b9eadaf99378378")} empty={!state.data?.replays?.length} emptyText={siteText("site.2cd6d88509f7f9de")}>
      <div className="review-player-area">
        {selection ? <SignedReplayPlayer key={selection.id} replayId={selection.id} streamUrl={courseAPI.streamUrl} onAccessError={mediaFailed} />
          : <div className="review-player-placeholder" role="status"><span aria-hidden="true">▷</span><Sentence>{copyText('system.review.041')}</Sentence></div>}
      </div>
      {selection && <div className="review-playing"><strong>{selection.title}</strong></div>}
      <ul className="review-replay-list">{state.data?.replays.map(replay => <li key={replay.id}><button type="button" aria-pressed={selection?.id === replay.id} onClick={() => choose(replay)}><span aria-hidden="true">▷</span><div><strong>{replay.title}</strong><Sentence>{replay.recording_date || copyText('system.review.043')}{replayDuration(replay.duration_seconds) && ` · ${replayDuration(replay.duration_seconds)}`}</Sentence></div><span>{selection?.id === replay.id ? copyText('system.review.044') : copyText('system.review.045')}</span></button><ReplaySummary replay={replay}/></li>)}</ul>
    </ReadState>
  </StudySection>;
}
