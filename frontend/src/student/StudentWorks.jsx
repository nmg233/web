import {copyTemplate as siteTemplate} from "../content/copy";
import Alert from '../student/visual/StudentAlert';
import Sentence from '../content/Sentence';
import {copyText} from '../content/copy';
import { useCourseApis, useCourseId } from './useCourseApis';
import { useCallback, useState } from 'react';
import Link from './space/SpaceLink';

import { Collapse, Empty, Input, Select } from 'antd';
import PageContainer from '../components/common/PageContainer';
import AsyncPageState from '../student/visual/StudentPageState';
import useRemote from './useRemote';
import { loadStudentWorks } from './workListModel';
import { workCounts } from './archiveModel';
import { WorkRecords } from './ArchiveRecords';
import { StudyHeader, StudySection } from './visual/StudyUI';
import { PixelButton } from './visual/PixelUI';
import PixelIcon from './visual/PixelIcon';
import './visual/pixel-archive.css';

export default function StudentWorks() {
  const { courseAPI, workAPI } = useCourseApis();
  const [query, setQuery] = useState('');
  const spaceId=useCourseId();
  const [courseId, setCourseId] = useState(spaceId?Number(spaceId):undefined);
  const fetcher = useCallback(() => loadStudentWorks({ courses: courseAPI.list, works: (params) => workAPI.list(params, { silent: true }), tasks: workAPI.pendingTasks }, { search: query, courseId }), [query, courseId,courseAPI,workAPI]);
  const { data, loading, error, retry } = useRemote(fetcher, { courseSensitive: true });
  const { works = [], courses = [], tasks = [] } = data || {};
  const counts = workCounts(works);
  return <PageContainer><div className="study-workspace archive-workspace">
    <StudyHeader eyebrow={<><PixelIcon name="book" />{copyText('system.works.001')}</>} title={copyText('system.works.002')} description={copyText('system.works.003')}><Link to="/archives" className="pixel-link-button"><PixelIcon name="back" />{copyText('system.works.004')}</Link></StudyHeader>
    {data?.filterInvalid && <Alert type="warning" showIcon title={copyText('system.works.005')} action={<PixelButton onClick={() => setCourseId(undefined)}>{copyText('system.works.006')}</PixelButton>} />}
    <StudySection number="W" title={copyText('system.works.007')} description={data ? siteTemplate("site.f4da9736f09e49fc", {slot0: (counts.projects), slot1: (counts.iterations)}) : copyText('system.works.008')}>
      <div className="archive-filters"><div><label className="archive-select-label" htmlFor="work-search">{copyText('system.works.009')}</label><Input.Search id="work-search" placeholder={copyText('system.works.010')} value={query} onChange={(event) => setQuery(event.target.value)} onSearch={setQuery} allowClear /></div><div><label className="archive-select-label" htmlFor="work-course">{copyText('system.works.011')}</label><Select id="work-course" disabled={!!spaceId} allowClear placeholder={copyText('system.works.012')} value={data?.filterInvalid ? undefined : courseId} onChange={setCourseId} options={courses.map((course) => ({ value: course.id, label: `${course.title} · #${course.id}` }))} /></div><PixelButton loading={loading} onClick={retry}>{copyText('system.works.013')}</PixelButton></div>
      <AsyncPageState loading={loading} error={error} onRetry={retry}>{data && <WorkRecords works={works} />}</AsyncPageState>
    </StudySection>
    {data && <Collapse className="archive-pending" defaultActiveKey={['tasks']} items={[{ key: 'tasks', label: siteTemplate("site.8ca5847db129fe07", {slot0: (tasks.length)}), children: tasks.length ? <ul className="archive-task-list">{tasks.map((task) => <li key={task.id}><div><strong>{task.title}</strong><Sentence>{task.course_title}{task.description?' · '+task.description:''}</Sentence></div><Link to={`/works/upload?task_id=${task.id}&enrollment_id=${task.enrollment_id}`}>{copyText('system.works.015')}</Link></li>)}</ul> : <Empty description={copyText('system.works.016')} /> }]} />}
  </div></PageContainer>;
}
