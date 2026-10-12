import Alert from '../student/visual/StudentAlert';
import Sentence from '../content/Sentence';
import {copyText,copyFragment} from '../content/copy';
import CopyBlock from '../content/CopyBlock';
import { useCourseApis } from './useCourseApis';
import { useCallback, useState, useId } from 'react';
import Link from './space/SpaceLink';

import { Empty, Select } from 'antd';
import { formatBeijingTime } from '../utils/date';
import useRemote from './useRemote';
import AsyncPageState from '../student/visual/StudentPageState';
import { reportSummary, scoreText } from './archiveModel';
import { PixelTag } from './visual/PixelUI';

import {ReflectionFields} from './ArchiveRecords';
function LessonReport({ courseId, lessonId }) {
  const { courseAPI, learningAPI } = useCourseApis();
  const fetcher = useCallback(async () => {
    const result = await learningAPI.lesson(lessonId);
    if (String(result.course?.id) !== String(courseId)) throw new Error(copyText('system.reports.001'));
    await courseAPI.detail(courseId);
    return result;
  }, [courseId, lessonId,courseAPI,learningAPI]);
  const { data, loading, error, retry } = useRemote(fetcher, { courseSensitive: true });
  const summary = data ? reportSummary(data) : null;
  const report = summary?.report;
  return <div className="archive-report-result" aria-live="polite"><AsyncPageState loading={loading} error={error} onRetry={retry}>{data && <>
    <div className="archive-record-heading"><h4>{data.lesson.title}</h4><PixelTag tone={summary.tone}>{summary.label}</PixelTag></div>
    <Sentence>{copyFragment('system.reports.002')}{data.progress?.percent == null ? copyFragment('system.reports.003') : `${data.progress.percent}%`}</Sentence>
    {report ? <><Sentence>{copyFragment('system.reports.004')}{report.version}{copyFragment('system.reports.005')}{formatBeijingTime(report.submitted_at)}</Sentence>
      <div className="study-feedback"><h4>{copyText('system.reports.006')}</h4><Sentence>{report.review_comment || copyText('system.reports.007')}</Sentence><Sentence>{copyFragment('system.reports.008')}{scoreText(report.score)}{report.score != null && copyFragment('system.reports.009')}</Sentence>{report.reviewed_at && <><Sentence>{copyFragment('system.reports.010')}{formatBeijingTime(report.reviewed_at)}</Sentence><CopyBlock id="system.reports.011" as="p" className="study-help"/></>}</div>
      <div className="study-reading-fields"><Sentence>{report.summary}</Sentence>{['key_points','application','difficulties','next_plan'].map(k=>report[k]&&<Sentence key={k}>{report[k]}</Sentence>)}</div><ReflectionFields reflection={data.reflection||{}}/><div className="archive-inline-actions"><Link to={`/courses/${courseId}/lessons/${lessonId}/learn?stage=2`}>{report.status === 'rejected' ? copyText('system.reports.012') : copyText('system.reports.013')}</Link><Link to={`/courses/${courseId}/lessons/${lessonId}/learn?stage=3`}>{copyText('system.reports.014')}</Link></div>
      <CopyBlock id="system.reports.015" as="p" className="study-help"/>
    </> : <><Alert type="info" showIcon title={summary.label} description={data.progress?.report_unlocked ? copyText('system.reports.016') : copyText('system.reports.017')} /><Link to={`/courses/${courseId}/lessons/${lessonId}/learn`}>{copyText('system.reports.018')}</Link></>}
  </>}</AsyncPageState></div>;
}

export default function ArchiveReports({ courseId }) {
  const selectId=useId();
  const { courseAPI } = useCourseApis();
  const [lessonId, setLessonId] = useState();
  const fetcher = useCallback(() => courseAPI.detail(courseId), [courseId,courseAPI]);
  const { data, loading, error, retry } = useRemote(fetcher, { courseSensitive: true });
  return <AsyncPageState loading={loading} error={error} onRetry={retry}>{data && <>
    <label className="archive-select-label" htmlFor={selectId}>{copyText('system.reports.019')}</label>
    <Select id={selectId} placeholder={copyText('system.reports.020')} value={lessonId} onChange={setLessonId} className="archive-select" allowClear options={(data.lessons || []).map((lesson) => ({ value: lesson.id, label: `${lesson.title}${lesson.status === 'cancelled' ? copyText('system.reports.021') : ''}`, disabled: lesson.status === 'cancelled' }))} />
    {!data.lessons?.length ? <Empty description={copyText('system.reports.022')} /> : lessonId ? <LessonReport key={lessonId} courseId={courseId} lessonId={lessonId} /> : <CopyBlock id="system.reports.023" as="p" className="archive-choice-note"/>}
  </>}</AsyncPageState>;
}
