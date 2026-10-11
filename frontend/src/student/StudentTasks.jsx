import {copyText as siteText, copyTemplate as siteTemplate} from "../content/copy";
import Sentence from '../content/Sentence';
import {copyText} from '../content/copy';
import CopyBlock from '../content/CopyBlock';
import { useCallback, useState } from 'react';
import Link from './space/SpaceLink';
import { Select } from 'antd';
import {useCourseApis} from './useCourseApis';
import { useAuth } from '../store/AuthContext';
import { ServicePage, ReadState } from '../components/ServiceUI';
import { PixelPanel, PixelTag, PixelProgress } from './visual/PixelUI';
import { taskGroups, taskLabels, reportLabels, learningPercent } from './compatibilityModel';
import { workStatus } from './archiveModel';
import { formatBeijingTime } from '../utils/date';
import useCourseResource from './useCourseResource';
import './visual/pixel-compatibility.css';

export default function StudentTasks() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  return <ServicePage title={copyText('system.tasks.001')} eyebrow={siteText("site.41d9a6e3ced39a9d")} description={copyText('system.tasks.002')} actions={<Link to="/explore">{copyText('system.tasks.003')}</Link>}>
    <PixelPanel className="compat-task-toolbar"><div><label htmlFor="task-status">{copyText('system.tasks.004')}</label><CopyBlock id="system.tasks.005" as="p" /></div>
      <Select id="task-status" aria-label={copyText('system.tasks.006')} value={status} onChange={setStatus} options={[{ value: '', label: copyText('system.tasks.007') }, ...Object.entries(taskLabels).map(([value, label]) => ({ value, label }))]} />
    </PixelPanel>
    <TaskResults key={`${user.id}:${status}`} status={status} />
  </ServicePage>;
}
function TaskResults({ status }) {
 const {taskAPI,courseAPI}=useCourseApis();
  const read = useCallback(async () => {
    const payload = await taskAPI.list(status ? { status } : {});
    const current = await courseAPI.list();
    const allowed = new Set((current.courses || []).map(c => String(c.id)));
    return (payload.tasks || []).filter(t => allowed.has(String(t.course_id)));
  }, [status,taskAPI,courseAPI]);
  const state = useCourseResource(read);
  const groups = taskGroups(state.data || []);
  return <ReadState {...state} empty={!groups.length} object={siteText("site.59f68be3ae43a068")} emptyText={status ? copyText('system.tasks.008') : copyText('system.tasks.009')}>
    <div className="compat-task-groups">{groups.map(group => <PixelPanel key={group.id} className="compat-task-group" data-course-id={group.id}>
      <header><div><span className="compat-muted">{copyText('system.tasks.010')}{group.id} · {group.tasks.length}{copyText('system.tasks.011')}</span><h3>{group.title || copyText('system.tasks.012')}</h3></div><Link to={`/courses/${group.id}`}>{copyText('system.tasks.013')}</Link></header>
      <ul>{group.tasks.map(task => {
        const progress = learningPercent(task.learning_progress), work = workStatus({ review_status: task.review_status });
        const action = task.report_status === 'rejected' ? copyText('system.tasks.014') : task.status === 'completed' ? copyText('system.tasks.015') : task.status === 'submitted' ? copyText('system.tasks.016') : copyText('system.tasks.017');
        const target = `/courses/${task.course_id}/lessons/${task.lesson_id}/learn${task.report_status === 'rejected' ? '?stage=2' : ''}`;
        return <li className="compat-task-row" key={task.id}><div className="compat-task-heading"><h4>{task.title}</h4><PixelTag tone={task.status === 'completed' ? 'success' : 'current'}>{taskLabels[task.status] || copyText('system.tasks.018')}</PixelTag></div>
          <Sentence className="compat-muted">{copyText('system.tasks.019')}{task.lesson_title || copyText('system.tasks.020')}<span className="compat-meta-divider"> / </span>{copyText('system.tasks.021')}{task.deadline ? formatBeijingTime(task.deadline) : copyText('system.tasks.022')}</Sentence>
          <div className="compat-task-bottom"><div className="compat-task-status"><div className="compat-task-progress"><span>{copyText('system.tasks.023')}</span>{progress == null ? <span className="compat-muted">{copyText('system.tasks.024')}</span> : <PixelProgress value={progress} label={siteTemplate("site.72c2f903a4dbc4cd", {slot0: (task.title)})} />}</div>
            <div className="compat-tags"><span>{copyText('system.tasks.025')}{reportLabels[task.report_status] || copyText('system.tasks.026')}</span>{task.work_id && <PixelTag tone={work.tone}>{copyText('system.tasks.027')}{work.label}</PixelTag>}</div></div>
            <div className="compat-row-actions"><Link className="compat-primary-link" to={target}>{action}</Link>{task.work_id && <Link to={`/works/${task.work_id}`}>{task.review_status === 'rejected' ? copyText('system.tasks.028') : copyText('system.tasks.029')}</Link>}</div>
          </div>
        </li>;
      })}</ul>
      <CopyBlock id="system.tasks.030" as="p" className="compat-footnote"/>
    </PixelPanel>)}</div>
  </ReadState>;
}
