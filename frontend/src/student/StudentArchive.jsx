import StudentCopyText from '../content/ManagedText';
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
  const coursesContent = <StudySection number="01" title={copyText('system.archive.001')} description={copyText('system.archive.002')} data-copy-bindings={JSON.stringify(['system.archive.001','system.archive.002'])}>
    {archive ? archive.courses.length ? <ul className="archive-course-list">{archive.courses.map((course) => <li key={course.enrollment_id}><div><Link className="archive-record-title" to={`/courses/${course.course_id}`}>{course.course_title}</Link><Sentence>{<StudentCopyText id={'system.archive.003'}/>}{formatBeijingTime(course.enrolled_at)}</Sentence><Sentence>{course.completed_at ? <StudentCopyText id={"site.e6c4d17372472901"} values={{slot0: (formatBeijingTime(course.completed_at))}}/> : <StudentCopyText id={'system.archive.004'}/>}</Sentence></div><PixelTag tone="current">{<StudentCopyText id={'system.archive.005'}/>}</PixelTag></li>)}</ul> : <Empty description={copyText('system.archive.006')}  data-copy-bindings={JSON.stringify(['system.archive.006'])}/> : <CopyBlock id="system.archive.007" as="p" />}
    <section className="archive-report-browser" aria-label={copyText('system.archive.008')} data-copy-bindings={JSON.stringify(['system.archive.008'])}><h4>{<StudentCopyText id={'system.archive.009'}/>}</h4><CopyBlock id="system.archive.010" as="p" className="study-help"/>
      {courseId && !selection && <Alert type="warning" title={copyText('system.archive.011')}  data-copy-bindings={JSON.stringify(['system.archive.011'])}/>}
      <label className="archive-select-label" htmlFor="archive-course">{<StudentCopyText id={'system.archive.012'}/>}</label><Select id="archive-course" disabled={!!spaceId} className="archive-select" placeholder={copyText('system.archive.013')} allowClear value={selection} onChange={setCourseId} options={(data?.courses || []).map((course) => ({ value: course.id, label: `${course.title} · #${course.id}` }))}  data-copy-bindings={JSON.stringify(['system.archive.013'])}/>
      {selection ? <ArchiveReports key={selection} courseId={selection} /> : <Sentence className="archive-choice-note">{data?.courses.length ? <StudentCopyText id={'system.archive.014'}/> : <StudentCopyText id={'system.archive.015'}/>}</Sentence>}
    </section>
  </StudySection>;
  const feedback = archive && <>
    <StudySection number="03" title={copyText('system.archive.016')} description={copyText('system.archive.017')} data-copy-bindings={JSON.stringify(['system.archive.016','system.archive.017'])}>
      <h4>{<StudentCopyText id={'system.archive.018'}/>}</h4>
      {archive.evaluations.length ? <ul className="archive-evaluations">{archive.evaluations.map((row) => <li key={row.id}><div className="archive-record-heading"><strong>{row.evaluator_name || <StudentCopyText id={'system.archive.019'}/>} · {({ process: copyText('system.archive.020'), outcome: copyText('system.archive.021'), peer: copyText('system.archive.022'), self: copyText('system.archive.023') })[row.eval_type] || <StudentCopyText id={'system.archive.024'}/>}</strong><PixelTag>{scoreText(row.score)}{row.score != null && <StudentCopyText id={'system.archive.025'}/>}</PixelTag></div><Sentence className="study-help">{row.course_title} · {formatBeijingTime(row.created_at)}</Sentence><Sentence className="study-prose">{row.comment || <StudentCopyText id={'system.archive.026'}/>}</Sentence></li>)}</ul> : <Empty description={copyText('system.archive.027')}  data-copy-bindings={JSON.stringify(['system.archive.027'])}/>}
      <div className="archive-feedback-links"><div><h4>{<StudentCopyText id={'system.archive.028'}/>}</h4><CopyBlock id="system.archive.029" as="p" /><label htmlFor="feedback-course">{<StudentCopyText id={'system.archive.012'}/>}</label><Select id="feedback-course" disabled={!!spaceId} className="archive-select" value={selection} allowClear onChange={setCourseId} options={(data?.courses||[]).map(course=>({value:course.id,label:course.title}))}/>{selection ? <ArchiveReports key={selection} courseId={selection}/> : <p>{<StudentCopyText id={'system.archive.014'}/>}</p>}</div><div><h4>{<StudentCopyText id={'system.archive.031'}/>}</h4><CopyBlock id="system.archive.032" as="p" /><PixelButton onClick={() => setTab('works')}>{<StudentCopyText id={'system.archive.033'}/>}</PixelButton></div></div>
    </StudySection>
    <StudySection number="05" title={copyText('system.archive.034')} description={copyText('system.archive.035')} data-copy-bindings={JSON.stringify(['system.archive.034','system.archive.035'])}>
      {archive.abilityAvailable ? <ul className="archive-dimensions">{workDimensions.map(([field, label]) => <li key={field}><span>{label}</span><strong>{scoreText(archive.ability?.[field])}{archive.ability?.[field] != null && <small> / 5</small>}</strong></li>)}</ul> : <Alert type="info" showIcon title={copyText('system.archive.036')} description={copyText('system.archive.037')}  data-copy-bindings={JSON.stringify(['system.archive.036','system.archive.037'])}/>}
      <Link to="/works">{<StudentCopyText id={'system.archive.038'}/>}</Link>
    </StudySection>
  </>;
  const trail = archive && <StudySection number="04" title={copyText('system.archive.039')} description={copyText('system.archive.040')} data-copy-bindings={JSON.stringify(['system.archive.039','system.archive.040'])}>
    {archive.hiddenEvents > 0 && <Alert type="info" showIcon title={copyText('system.archive.041')} description={copyText('system.archive.042')}  data-copy-bindings={JSON.stringify(['system.archive.041','system.archive.042'])}/>}
    {archive.timeline.length ? <ol className="archive-timeline">{archive.timeline.map((event) => <li key={event.id}><div className="archive-record-heading"><PixelTag>{event.kind}</PixelTag><time>{formatBeijingTime(event.at)}</time></div><Sentence className="archive-record-title">{event.text}</Sentence>{event.recorder && <Sentence className="study-help">{<StudentCopyText id={'system.archive.043'}/>}{event.recorder}</Sentence>}{event.workId && <Link to={`/works/${event.workId}`}>{<StudentCopyText id={'system.archive.044'}/>}</Link>}{event.reflection && <Collapse items={[{ key: 'reflection', label: copyText('system.archive.045'), children: <ReflectionFields reflection={event.reflection} /> ,__copyIds:{"label":"system.archive.045"}}]} />}</li>)}</ol> : <Empty description={copyText('system.archive.046')}  data-copy-bindings={JSON.stringify(['system.archive.046'])}/>}
  </StudySection>;
  return <PageContainer><div className="study-workspace archive-workspace">
    <StudyHeader eyebrow={<><PixelIcon name="archive" />{<StudentCopyText id={'system.archive.047'}/>}</>} title={copyText('system.archive.048')} description={copyText('system.archive.049')} data-copy-bindings={JSON.stringify(['system.archive.048','system.archive.049'])}>
      <PixelButton aria-label={copyText('system.archive.050')} loading={loading} onClick={reload} data-copy-bindings={JSON.stringify(['system.archive.050'])}>{<StudentCopyText id={'system.archive.051'}/>}</PixelButton><PixelButton type="primary" onClick={() => navigate('/archives/reflection')}>{<StudentCopyText id={'system.archive.052'}/>}</PixelButton>
    </StudyHeader>
    <div className="archive-quick-links"><Link to="/works">{<StudentCopyText id={'system.archive.053'}/>}</Link><Link to="/archives/rewards">{<StudentCopyText id={'system.archive.054'}/>}</Link></div>
    {error && <Alert type="error" showIcon title={refreshing ? copyText('system.archive.055') : copyText('system.archive.056')} description={siteTemplate("site.7b57a098dd31f284", {slot0: (error)})} action={<PixelButton onClick={reload}>{<StudentCopyText id={'system.archive.057'}/>}</PixelButton>}  data-copy-bindings={JSON.stringify(['system.archive.055','system.archive.056',"site.7b57a098dd31f284"])}/>}
    <AsyncPageState loading={loading}>
      {data && <>
        {data.archiveError && <Alert type="warning" showIcon title={copyText('system.archive.058')} description={data.archiveError} action={<PixelButton onClick={reload}>{<StudentCopyText id={'system.archive.059'}/>}</PixelButton>}  data-copy-bindings={JSON.stringify(['system.archive.058'])}/>}
        <PixelPanel className="archive-overview" aria-label={copyText('system.archive.060')} data-copy-bindings={JSON.stringify(['system.archive.060'])}><div className="archive-identity"><PixelIcon name="user" size={32} /><div><strong>{archive?.student.real_name || user.real_name || <StudentCopyText id={'system.archive.061'}/>}</strong><Sentence>{archive?.student.school_name || <StudentCopyText id={'system.archive.062'}/>} · {archive?.student.class_name || <StudentCopyText id={'system.archive.063'}/>}</Sentence></div></div>
          <dl className="archive-counts" data-copy-bindings={JSON.stringify(['system.archive.064','system.archive.065','system.archive.066','system.archive.067','system.archive.068'])}>{[['courses', copyText('system.archive.064')], ['projects', copyText('system.archive.065')], ['iterations', copyText('system.archive.066')], ['reflections', copyText('system.archive.067')], ['evaluations', copyText('system.archive.068')]].map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{archive ? archive.counts[field] : '—'}</dd></div>)}</dl>
          <Sentence className="archive-scope-note">{<StudentCopyText id={'system.archive.069'}/>}{archive && <StudentCopyText id={"site.4c9179995dfe0c3c"} values={{slot0: (archive.generatedAt)}}/>}</Sentence>
        </PixelPanel>
        <Tabs className="archive-tabs" activeKey={tab} onChange={setTab} items={[
          { key: 'courses', label: copyText('system.archive.070'), children: coursesContent ,__copyIds:{"label":"system.archive.070"}},
          { key: 'works', label: copyText('system.archive.071'), children: archive && <StudySection number="02" title={copyText('system.archive.072')} description={siteTemplate("site.45c5e89e44a823ad", {slot0: (archive.counts.projects), slot1: (archive.counts.iterations)})} data-copy-bindings={JSON.stringify(['system.archive.072',"site.45c5e89e44a823ad"])}><WorkRecords works={archive.works} compact /><div className="study-actions"><PixelButton onClick={() => navigate('/works')}>{<StudentCopyText id={'system.archive.073'}/>}</PixelButton></div></StudySection> ,__copyIds:{"label":"system.archive.071"}},
          { key: 'feedback', label: copyText('system.archive.074'), children: feedback ,__copyIds:{"label":"system.archive.074"}}, { key: 'trail', label: copyText('system.archive.075'), children: trail ,__copyIds:{"label":"system.archive.075"}},
        ].map((item) => ({ ...item, children: item.children || <Alert type="warning" title={copyText('system.archive.076')} /> }))}  data-copy-bindings={JSON.stringify(['system.archive.070','system.archive.071','system.archive.074','system.archive.075'])}/>
      </>}
    </AsyncPageState>
  </div></PageContainer>;
}
