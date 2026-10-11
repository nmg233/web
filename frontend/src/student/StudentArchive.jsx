import {copyTemplate as siteTemplate} from "../content/copy";
import Alert from '../student/visual/StudentAlert';
import Sentence from '../content/Sentence';
import {copyText} from '../content/copy';
import CopyBlock from '../content/CopyBlock';
import { useCourseApis, useCourseId } from './useCourseApis';
import { useCallback, useState } from 'react';
import Link from './space/SpaceLink';
import {useCourseNavigate as useNavigate} from './useCourseApis';

import { Collapse, Empty, Select, Tabs } from 'antd';
import { useAuth } from '../store/AuthContext';
import { formatBeijingTime } from '../utils/date';
import PageContainer from '../components/common/PageContainer';
import AsyncPageState from '../student/visual/StudentPageState';
import useRemote from './useRemote';
import { loadStudentArchive, scoreText, workDimensions } from './archiveModel';
import { PixelButton, PixelPanel, PixelTag } from './visual/PixelUI';
import { StudyHeader, StudySection } from './visual/StudyUI';
import PixelIcon from './visual/PixelIcon';
import { ReflectionFields, WorkRecords } from './ArchiveRecords';
import ArchiveReports from './ArchiveReports';
import './visual/pixel-archive.css';

export default function StudentArchive() {
  const { archiveAPI, courseAPI } = useCourseApis();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('courses');
  const spaceId=useCourseId();
  const [courseId, setCourseId] = useState(spaceId?Number(spaceId):undefined);
  const [refreshing, setRefreshing] = useState(false);
  const fetcher = useCallback(() => loadStudentArchive({ courses: courseAPI.list, enrollments: archiveAPI.getReflections, archive: archiveAPI.generate }, user.id), [user.id,courseAPI,archiveAPI]);
  const { data, loading, error, retry } = useRemote(fetcher, { courseSensitive: true });
  const archive = data?.archive;
  const selection = data?.courses.some((course) => String(course.id) === String(courseId)) ? courseId : undefined;
  const reload = () => { setRefreshing(true); retry(); };
  const coursesContent = <StudySection number="01" title={copyText('system.archive.001')} description={copyText('system.archive.002')}>
    {archive ? archive.courses.length ? <ul className="archive-course-list">{archive.courses.map((course) => <li key={course.enrollment_id}><div><Link className="archive-record-title" to={`/courses/${course.course_id}`}>{course.course_title}</Link><Sentence>{copyText('system.archive.003')}{formatBeijingTime(course.enrolled_at)}</Sentence><Sentence>{course.completed_at ? siteTemplate("site.e6c4d17372472901", {slot0: (formatBeijingTime(course.completed_at))}) : copyText('system.archive.004')}</Sentence></div><PixelTag tone="current">{copyText('system.archive.005')}</PixelTag></li>)}</ul> : <Empty description={copyText('system.archive.006')} /> : <CopyBlock id="system.archive.007" as="p" />}
    <section className="archive-report-browser" aria-label={copyText('system.archive.008')}><h4>{copyText('system.archive.009')}</h4><CopyBlock id="system.archive.010" as="p" className="study-help"/>
      {courseId && !selection && <Alert type="warning" title={copyText('system.archive.011')} />}
      <label className="archive-select-label" htmlFor="archive-course">{copyText('system.archive.012')}</label><Select id="archive-course" disabled={!!spaceId} className="archive-select" placeholder={copyText('system.archive.013')} allowClear value={selection} onChange={setCourseId} options={(data?.courses || []).map((course) => ({ value: course.id, label: `${course.title} · #${course.id}` }))} />
      {selection ? <ArchiveReports key={selection} courseId={selection} /> : <Sentence className="archive-choice-note">{data?.courses.length ? copyText('system.archive.014') : copyText('system.archive.015')}</Sentence>}
    </section>
  </StudySection>;
  const feedback = archive && <>
    <StudySection number="03" title={copyText('system.archive.016')} description={copyText('system.archive.017')}>
      <h4>{copyText('system.archive.018')}</h4>
      {archive.evaluations.length ? <ul className="archive-evaluations">{archive.evaluations.map((row) => <li key={row.id}><div className="archive-record-heading"><strong>{row.evaluator_name || copyText('system.archive.019')} · {({ process: copyText('system.archive.020'), outcome: copyText('system.archive.021'), peer: copyText('system.archive.022'), self: copyText('system.archive.023') })[row.eval_type] || copyText('system.archive.024')}</strong><PixelTag>{scoreText(row.score)}{row.score != null && copyText('system.archive.025')}</PixelTag></div><Sentence className="study-help">{row.course_title} · {formatBeijingTime(row.created_at)}</Sentence><Sentence className="study-prose">{row.comment || copyText('system.archive.026')}</Sentence></li>)}</ul> : <Empty description={copyText('system.archive.027')} />}
      <div className="archive-feedback-links"><div><h4>{copyText('system.archive.028')}</h4><CopyBlock id="system.archive.029" as="p" /><label htmlFor="feedback-course">{copyText('system.archive.012')}</label><Select id="feedback-course" disabled={!!spaceId} className="archive-select" value={selection} allowClear onChange={setCourseId} options={(data?.courses||[]).map(course=>({value:course.id,label:course.title}))}/>{selection ? <ArchiveReports key={selection} courseId={selection}/> : <p>{copyText('system.archive.014')}</p>}</div><div><h4>{copyText('system.archive.031')}</h4><CopyBlock id="system.archive.032" as="p" /><PixelButton onClick={() => setTab('works')}>{copyText('system.archive.033')}</PixelButton></div></div>
    </StudySection>
    <StudySection number="05" title={copyText('system.archive.034')} description={copyText('system.archive.035')}>
      {archive.abilityAvailable ? <ul className="archive-dimensions">{workDimensions.map(([field, label]) => <li key={field}><span>{label}</span><strong>{scoreText(archive.ability?.[field])}{archive.ability?.[field] != null && <small> / 5</small>}</strong></li>)}</ul> : <Alert type="info" showIcon title={copyText('system.archive.036')} description={copyText('system.archive.037')} />}
      <Link to="/works">{copyText('system.archive.038')}</Link>
    </StudySection>
  </>;
  const trail = archive && <StudySection number="04" title={copyText('system.archive.039')} description={copyText('system.archive.040')}>
    {archive.hiddenEvents > 0 && <Alert type="info" showIcon title={copyText('system.archive.041')} description={copyText('system.archive.042')} />}
    {archive.timeline.length ? <ol className="archive-timeline">{archive.timeline.map((event) => <li key={event.id}><div className="archive-record-heading"><PixelTag>{event.kind}</PixelTag><time>{formatBeijingTime(event.at)}</time></div><Sentence className="archive-record-title">{event.text}</Sentence>{event.recorder && <Sentence className="study-help">{copyText('system.archive.043')}{event.recorder}</Sentence>}{event.workId && <Link to={`/works/${event.workId}`}>{copyText('system.archive.044')}</Link>}{event.reflection && <Collapse items={[{ key: 'reflection', label: copyText('system.archive.045'), children: <ReflectionFields reflection={event.reflection} /> }]} />}</li>)}</ol> : <Empty description={copyText('system.archive.046')} />}
  </StudySection>;
  return <PageContainer><div className="study-workspace archive-workspace">
    <StudyHeader eyebrow={<><PixelIcon name="archive" />{copyText('system.archive.047')}</>} title={copyText('system.archive.048')} description={copyText('system.archive.049')}>
      <PixelButton aria-label={copyText('system.archive.050')} loading={loading} onClick={reload}>{copyText('system.archive.051')}</PixelButton><PixelButton type="primary" onClick={() => navigate('/archives/reflection')}>{copyText('system.archive.052')}</PixelButton>
    </StudyHeader>
    <div className="archive-quick-links"><Link to="/works">{copyText('system.archive.053')}</Link><Link to="/archives/rewards">{copyText('system.archive.054')}</Link></div>
    {error && <Alert type="error" showIcon title={refreshing ? copyText('system.archive.055') : copyText('system.archive.056')} description={siteTemplate("site.7b57a098dd31f284", {slot0: (error)})} action={<PixelButton onClick={reload}>{copyText('system.archive.057')}</PixelButton>} />}
    <AsyncPageState loading={loading}>
      {data && <>
        {data.archiveError && <Alert type="warning" showIcon title={copyText('system.archive.058')} description={data.archiveError} action={<PixelButton onClick={reload}>{copyText('system.archive.059')}</PixelButton>} />}
        <PixelPanel className="archive-overview" aria-label={copyText('system.archive.060')}><div className="archive-identity"><PixelIcon name="user" size={32} /><div><strong>{archive?.student.real_name || user.real_name || copyText('system.archive.061')}</strong><Sentence>{archive?.student.school_name || copyText('system.archive.062')} · {archive?.student.class_name || copyText('system.archive.063')}</Sentence></div></div>
          <dl className="archive-counts">{[['courses', copyText('system.archive.064')], ['projects', copyText('system.archive.065')], ['iterations', copyText('system.archive.066')], ['reflections', copyText('system.archive.067')], ['evaluations', copyText('system.archive.068')]].map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{archive ? archive.counts[field] : '—'}</dd></div>)}</dl>
          <Sentence className="archive-scope-note">{copyText('system.archive.069')}{archive && siteTemplate("site.4c9179995dfe0c3c", {slot0: (archive.generatedAt)})}</Sentence>
        </PixelPanel>
        <Tabs className="archive-tabs" activeKey={tab} onChange={setTab} items={[
          { key: 'courses', label: copyText('system.archive.070'), children: coursesContent },
          { key: 'works', label: copyText('system.archive.071'), children: archive && <StudySection number="02" title={copyText('system.archive.072')} description={siteTemplate("site.45c5e89e44a823ad", {slot0: (archive.counts.projects), slot1: (archive.counts.iterations)})}><WorkRecords works={archive.works} compact /><div className="study-actions"><PixelButton onClick={() => navigate('/works')}>{copyText('system.archive.073')}</PixelButton></div></StudySection> },
          { key: 'feedback', label: copyText('system.archive.074'), children: feedback }, { key: 'trail', label: copyText('system.archive.075'), children: trail },
        ].map((item) => ({ ...item, children: item.children || <Alert type="warning" title={copyText('system.archive.076')} /> }))} />
      </>}
    </AsyncPageState>
  </div></PageContainer>;
}
