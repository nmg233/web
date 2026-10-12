import {copyText as siteText} from "../content/copy";
import Alert from '../student/visual/StudentAlert';
import Sentence from '../content/Sentence';
import {useCourseApis} from './useCourseApis';
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import Link from './space/SpaceLink';

import { Empty } from 'antd';
import AsyncPageState from '../student/visual/StudentPageState';
import useRemote from './useRemote';
import { PixelTag } from './visual/PixelUI';
import { StudySection } from './visual/StudyUI';
import { formatBeijingTime } from '../utils/date';

function WorkTask({ task, enrollmentId }) {
 const { taskAPI }=useCourseApis();
  const [paramsFromLocation] = useSearchParams();
  const targetRef = useRef(null);
  const fetcher = useCallback(() => taskAPI.detail(task.id), [task.id,taskAPI]);
  const { data, loading, error, retry } = useRemote(fetcher);
  useEffect(() => {
    if (!loading && !error && data && paramsFromLocation.get('task_id') === String(task.id)) targetRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [data, loading, error, paramsFromLocation, task.id]);
  const latest = data?.works?.[0];
  const params = new URLSearchParams({ task_id: task.id, enrollment_id: enrollmentId });
  if (latest) params.set('parent_work_id', latest.id);
  return <article ref={targetRef} id={`task-${task.id}`} className="study-task" aria-labelledby={`task-title-${task.id}`}><h4 id={`task-title-${task.id}`}>{task.title}</h4>{task.description&&<Sentence className="study-prose">{task.description}</Sentence>}<Sentence className="study-help">{siteText("site.3d6c1f9e2b4df99f")}{task.deadline ? formatBeijingTime(task.deadline) : siteText("site.2ea50caa0c351eb4")}</Sentence>
    <AsyncPageState loading={loading} error={error} onRetry={retry}>
      <ul className="study-work-versions">{data?.works.map((work) => <li key={work.id}><Link to={`/works/${work.id}`}><span>{siteText("site.732faa1b624adfa1")}{work.version}{siteText("site.c2e886a8b47f1396")}{work.title}</span><PixelTag tone={work.review_status === 'approved' ? 'success' : work.review_status === 'rejected' && work.id === latest.id ? 'warning' : 'neutral'}>{work.review_status === 'rejected' ? work.id === latest.id ? siteText("site.6ed0cd1cdd89df67") : siteText("site.a9367e7f44abf059") : work.review_status === 'approved' ? siteText("site.ef08c63283bf35ed") : siteText("site.332086cefacb4063")}</PixelTag></Link></li>)}</ul>
      {latest?.reject_reason && <Alert type="warning" title={siteText("site.b25384afea7692bc")} description={latest.reject_reason} />}
      <div style={{ marginTop: 12 }}>{!latest || latest.review_status === 'rejected'
        ? <Link to={`/works/upload?${params}`} className="pixel-link-button">{latest ? siteText("site.a96a5faa9138b8bb") : siteText("site.88feed23b7449441")}</Link>
        : <Sentence>{latest.review_status === 'approved' ? siteText("site.729af75c9ba6ac79") : siteText("site.b7e709c4397eafd1")}</Sentence>}</div>
    </AsyncPageState>
  </article>;
}

export default function LessonWorks({ courseId, lessonId }) {
 const { courseAPI }=useCourseApis();
  const location = useLocation();
  const sectionRef = useRef(null);
  const fetcher = useCallback(() => courseAPI.detail(courseId), [courseId,courseAPI]);
  const { data, loading, error, retry } = useRemote(fetcher);
  useEffect(() => {
    if (!loading && !error && data && location.hash === '#lesson-works') sectionRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [data, loading, error, location.hash]);
  const tasks = data?.tasks.filter((task) => String(task.lesson_id) === String(lessonId)) || [];
  return <StudySection ref={sectionRef} id="lesson-works" className="lesson-works" number="W" title={siteText("site.422217ee612b1ccc")} description={siteText("site.3de0e858a9327c2c")}>
    <Alert type="info" title={siteText("site.e8f9371af35069d9")} />
    <AsyncPageState loading={loading} error={error} onRetry={retry}>{!tasks.length ? <Empty description={siteText("site.b72d32730ce31ed8")} /> : tasks.map((task) => <WorkTask key={task.id} task={task} enrollmentId={data.enrollments[0]?.id} />)}</AsyncPageState>
  </StudySection>;
}
