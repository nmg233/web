import Alert from '../student/visual/StudentAlert';
import {copyText} from '../content/copy';
import CopyBlock from '../content/CopyBlock';
import { useCourseApis } from './useCourseApis';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Collapse, Descriptions, Empty, Modal, Space, Typography } from 'antd';
import AsyncPageState from '../student/visual/StudentPageState';
import PageContainer from '../components/common/PageContainer';
import useRemote from './useRemote';
import { buildCourseRoute, currentLesson, scheduleTime } from './routeModel';
import { studentTestConfigEnabled } from './config';
import AssociatedExperiments from './AssociatedExperiments';
import PixelIcon from './visual/PixelIcon';
import { PixelButton, PixelPanel, PixelProgress, PixelTag } from './visual/PixelUI';
import SceneArt from './space/SceneArt';
import CourseTodos from './space/CourseTodos';
import LessonPlace from './space/LessonPlace';
import {useCoursePresentation} from './space/CoursePresentation';
import {useCourseExperience} from './space/useCourseExperience';
import Sentence from '../content/Sentence';
import {trapFocus} from './visual/trapFocus';
import './visual/pixel-map.css';
import './space/map.css';
import {LessonBadge} from './ServerRewards';
import {mapSegments} from './mapGeometry';

export { default as ExploreHome } from './ExploreHome';

const grades = { primary: copyText('system.map.001'), junior: copyText('system.map.002'), senior: copyText('system.map.003') };
const difficulties = { basic: copyText('system.map.004'), advanced: copyText('system.map.005'), challenge: copyText('system.map.006') };


function learningState(lesson) {
  if (lesson.future) return {label:copyText('next.map.future'),tone:'neutral'};
  if (lesson.content_state==='preparing') return {label:copyText('next.map.preparing'),tone:'neutral'};
  if (lesson.status === 'cancelled') return { label: copyText('system.map.007'), tone: 'neutral' };
  if (Number(lesson.progress) >= 100) return { label: copyText('system.map.008'), tone: 'success' };
  if (Number(lesson.progress) > 0) return { label: copyText('system.map.009'), tone: 'current' };
  return { label: copyText('system.map.010'), tone: 'neutral' };
}

function CourseResources({ resources, courseId }) {
  const { courseAPI } = useCourseApis();
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState({});
  const download = async (resource) => {
    setErrors((previous) => ({ ...previous, [resource.id]: '' }));
    setPending((previous) => ({ ...previous, [resource.id]: true }));
    try {
      const blob = await courseAPI.downloadResource(resource.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = resource.file_name || resource.title || copyText('system.map.011'); anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setErrors((previous) => ({ ...previous, [resource.id]: error.response?.status === 404 ? copyText('system.map.012') : copyText('system.map.013') }));
    } finally { setPending((previous) => ({ ...previous, [resource.id]: false })); }
  };
  return <div className="pixel-map-resources">
    <Typography.Title level={3}>{copyText('system.map.014')}</Typography.Title>
    <Link to={'/courses/' + courseId + '/learn'} className="pixel-map-text-link"><PixelIcon name="book" />{copyText('system.map.015')}</Link>
    {!resources.length ? <Empty description={copyText('system.map.016')} /> : resources.map((resource) => <div key={resource.id} className="pixel-map-resource">
      <Space wrap><Typography.Text strong>{resource.title}</Typography.Text>{resource.has_file
        ? <PixelButton loading={pending[resource.id]} onClick={() => download(resource)}>{copyText('system.map.017')}{resource.title}</PixelButton>
        : <Typography.Text type="secondary">{copyText('system.map.018')}</Typography.Text>}</Space>
      {resource.description && <Sentence as={Typography.Paragraph}>{resource.description}</Sentence>}
      <Typography.Text type="secondary">{resource.lesson_id?copyText('maintenance.field.lesson_id')+' #'+resource.lesson_id:copyText('maintenance.public')} · {copyText('maintenance.type.'+resource.resource_type)}</Typography.Text>
      {errors[resource.id] && <Alert type="warning" showIcon title={errors[resource.id]} />}
    </div>)}
  </div>;
}

function LessonDetails({ lesson, tasks, courseId, isCurrent }) {
  const navigate = useNavigate();
  if(lesson.future)return <PixelPanel className="pixel-map-details" id="selected-lesson-details"><h3>{copyText('next.map.node')} {lesson.routeNumber}</h3><p>{copyText('next.map.notOpen')}</p><div className="next-unknown-badge" aria-hidden="true">?</div><p>{copyText('next3.badges.unknown')}</p></PixelPanel>;
  const state = learningState(lesson);
  const href = '/courses/' + courseId + '/lessons/' + lesson.id + '/learn';
  return <PixelPanel className="pixel-map-details" id="selected-lesson-details" data-testid="lesson-details" aria-labelledby="selected-lesson-title">
    <div className="pixel-map-details-kicker"><span>{copyText('system.map.019')}{lesson.routeNumber}{copyText('system.map.020')}</span>{isCurrent && <PixelTag tone="current">{copyText('system.map.021')}</PixelTag>}</div>
    <Typography.Title level={3} id="selected-lesson-title">{lesson.title}</Typography.Title>
    <div className="pixel-map-details-state"><PixelTag tone={state.tone}>{state.label}</PixelTag><span>{copyText('system.map.022')}</span></div>
    <PixelProgress value={lesson.progress ?? 0} label={lesson.title + copyText('system.map.023')} />
    <LessonBadge key={lesson.id} lessonId={lesson.id}/>
    {lesson.status === 'cancelled'
      ? <Alert type="warning" showIcon title={copyText('system.map.025')} description={lesson.cancel_reason || copyText('system.map.026')} />
      : <div className="pixel-map-enter"><PixelButton type="primary" onClick={() => navigate(href)} icon={<PixelIcon name="continue" />}>{copyText(lesson.presentation_type==='visit'?'next.visit.enter':'system.map.027')}</PixelButton></div>}
    {lesson.description&&<Sentence as={Typography.Paragraph} className="pixel-map-lesson-description">{lesson.description}</Sentence>}
    {lesson.teaching_tip&&<Sentence className="pixel-map-lesson-description">{lesson.teaching_tip}</Sentence>}
    <div className="pixel-map-schedule">
      <Typography.Title level={4}><PixelIcon name="clock" />{copyText('system.map.028')}</Typography.Title>
      <Descriptions size="small" column={1} colon={false} items={[
        { key: 'start', label: copyText('system.map.029'), children: scheduleTime(lesson.start_at) },
        { key: 'end', label: copyText('system.map.030'), children: scheduleTime(lesson.end_at) },
        { key: 'location', label: copyText('system.map.031'), children: lesson.location || copyText('system.map.032') },
        { key: 'teacher', label: copyText('system.map.033'), children: lesson.instructor_name || copyText('system.map.034') },
        { key: 'duration', label: copyText('system.map.035'), children: lesson.duration ? lesson.duration + copyText('system.map.036') : copyText('system.map.037') },
      ]} />
    </div>
    {lesson.status !== 'cancelled' && <div className="pixel-map-lesson-tasks">
      <Typography.Title level={4}>{copyText('system.map.038')}</Typography.Title>
      {tasks.length ? <ul>{tasks.map((task) => <li key={task.id}><Link to={href + '?task_id=' + task.id + '#task-' + task.id}>{task.title}</Link>{task.deadline && <span>{copyText('system.map.039')}{scheduleTime(task.deadline)}</span>}</li>)}</ul>
        : <Sentence as={Typography.Paragraph} type="secondary">{copyText('system.map.040')}</Sentence>}
      <AssociatedExperiments courseId={courseId} lessonId={lesson.id} />
    </div>}
    <CopyBlock id="system.map.041" as="p" className="pixel-map-detail-note"/>
  </PixelPanel>;
}

// Connections follow landing pads in actual DOM positions, including long titles.
// They are decoration only: buttons retain all selection and keyboard behavior.
function CourseRouteRegion({ group, groupIndex, current, selected, selectionKey, onSelect, hasNext, theme }) {
  const routeRef = useRef(null);
  const [segments, setSegments] = useState([]);
  const routePath=segments.map(segment=>segment.d).join(' ');
  useLayoutEffect(() => {
    const route = routeRef.current;
    let frame;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = route.getBoundingClientRect();
        const nodes=[...route.querySelectorAll('.route-node')].map(button=>{const rect=button.getBoundingClientRect(),pad=button.querySelector('.space-landing-anchor').getBoundingClientRect(),stop=button.closest('.pixel-map-route-stop');return {id:stop.dataset.planPosition||stop.dataset.lessonId,row:Number(stop.dataset.routeRow),left:rect.left-bounds.left,right:rect.right-bounds.left,top:rect.top-bounds.top,bottom:rect.bottom-bounds.top,width:rect.width,padY:pad.top-bounds.top};});
        setSegments(mapSegments(nodes,{width:bounds.width,narrow:window.matchMedia('(max-width:767px)').matches}));
      });
    };
    const observer = new ResizeObserver(draw);
    observer.observe(route);
    route.querySelectorAll('.pixel-map-route-stop').forEach((stop) => observer.observe(stop));
    let active=true;const fontReady=()=>{if(active)draw();};document.fonts.ready.then(fontReady);document.fonts.addEventListener('loadingdone',fontReady);route.addEventListener('load',fontReady,true);route.addEventListener('error',fontReady,true);
    draw();
    return () => { active=false;observer.disconnect(); cancelAnimationFrame(frame);document.fonts.removeEventListener('loadingdone',fontReady);route.removeEventListener('load',fontReady,true);route.removeEventListener('error',fontReady,true); };
  }, [group.key, group.lessons.length]);

  return <section className="route-group pixel-map-region" aria-label={group.title}>
    {!group.planned&&<h4 className="pixel-map-region-title"><span className="pixel-map-region-index" aria-hidden="true">{String(groupIndex + 1).padStart(2, '0')}</span>{group.title}</h4>}
    <div className="pixel-map-platform">
      <div ref={routeRef} className="pixel-map-route-canvas">
        <svg className="pixel-map-route-track" aria-hidden="true"><metadata data-testid="route-segments">{JSON.stringify(segments)}</metadata><path className="pixel-map-track-outline" d={routePath} /><path className="pixel-map-track-dashes" d={routePath} /></svg>
      <ol className="pixel-map-route">
        {group.lessons.map((lesson, index) => {
          const state = learningState(lesson);
          const isCurrent = current?.id === lesson.id;
          const isSelected = selected?.id === lesson.id;
          const row = Math.floor(index / 3);
          const column = row % 2 ? 3-index%3 : index%3+1;
          return <li key={lesson.id} className="pixel-map-route-stop" data-lesson-id={lesson.future?undefined:lesson.id} data-plan-position={group.planned?lesson.routeNumber:undefined} data-route-row={row} data-selected={isSelected || undefined} style={{ '--stop-lift': index % 3 === 1 ? '16px' : '0px', '--stop-row': row + 1, '--stop-column': column }}>
            <button type="button" className="route-node" aria-current={isCurrent ? 'step' : undefined} aria-pressed={isSelected} aria-controls="selected-lesson-details"
              aria-label={copyText('system.map.042') + lesson.routeNumber + copyText('system.map.043') + lesson.title + '，' + state.label + (isCurrent ? copyText('system.map.044') : '')}
              onClick={(event) => onSelect({ key: selectionKey, lessonId: lesson.id },event.currentTarget)}>
              <LessonPlace type={lesson.presentation_type} number={lesson.routeNumber} current={isCurrent} selected={isSelected} completed={state.tone==='success'} priority={groupIndex===0&&index<3} theme={theme} unknown={lesson.future}/>
              <span className="pixel-map-node-label"><strong>{lesson.title}</strong><PixelTag tone={state.tone}>{state.label}</PixelTag></span>
            </button>
          </li>;
        })}
      </ol>
      </div>
    </div>
    {hasNext && <span className="pixel-map-region-bridge" aria-hidden="true"><PixelIcon name="continue" size={24} /></span>}
  </section>;
}

export function CourseMap() {
  const { courseAPI } = useCourseApis();
  const { id } = useParams();
  const look=useCoursePresentation();
  const session=useCourseExperience();
  const [params] = useSearchParams();
  const location = useLocation();
  const trigger=useRef(null);
  const [selection, setSelection] = useState(null);
  const [openSection, setOpenSection] = useState(null);
  const fetcher = useCallback(() => courseAPI.detail(id), [id,courseAPI]);
  const { data, loading, error, retry } = useRemote(fetcher, { courseSensitive: true, courseId: id });
  const current = currentLesson(data?.lessons || [], params.get('lesson'));
  const legacyGroups = buildCourseRoute(data?.lessons || [], (data?.chapters||[]).map(c=>({title:c.title,lessonIds:(data?.lessons||[]).filter(l=>l.chapter_id===c.id).map(l=>l.id)})),true);
  const planned=data?.course?.map_mode==='plan'&&data?.planNodes?.length;
  const groups=planned?[{key:'plan',planned:true,title:copyText('next.map.route'),lessons:data.planNodes.map(n=>{const l=data.lessons.find(l=>l.id===n.lesson_id);return l?{...l,routeNumber:n.position}:{id:'plan-'+n.id,future:true,title:copyText('next.map.unknown'),routeNumber:n.position};})}]:legacyGroups;
  const lessons = groups.flatMap((group) => group.lessons);
  const selectionKey = id + ':' + (params.get('lesson') || '');
  const selectedId = selection?.key === selectionKey ? selection.lessonId : (params.get('lesson') || current?.id);
  const match=lessons.find((lesson) => String(lesson.id) === String(selectedId));
  const selected = selection?.key===selectionKey?match:(match || lessons.find((lesson) => lesson.id === current?.id) || lessons[0]);
  const course = data?.course;
  const selectedTasks = (data?.tasks || []).filter((task) => String(task.lesson_id) === String(selected?.id));
  const details = selected && <LessonDetails lesson={selected} tasks={selectedTasks} courseId={id} isCurrent={current?.id === selected.id} />;
  const openDetails=session?.overlay==='details'&&!!data&&!!selected&&!error;
  useEffect(()=>{
    if(!openDetails)return;
    const previous=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{document.body.style.overflow=previous;};
  },[openDetails]);
  useEffect(()=>{
    if(session?.overlay==='details'&&(!data||error||!selected))session.openOverlay(null);
  },[session,data,error,selected]);
  const toggleSection = (section) => setOpenSection((previous) => previous === section ? null : section);

  return <PageContainer>
    <div className={'pixel-map space-map'+(planned?' space-map--planned':'')} data-map-theme={look.theme}>
      <header className="pixel-map-header">
        <div>
          <Link to="/explore" className="pixel-map-back"><PixelIcon name="back" />{copyText('system.map.045')}</Link>
          <Typography.Title level={2}>{course?.title || copyText('system.map.046')}</Typography.Title>
        </div>
        {data && <div className="pixel-map-header-actions">
          <PixelButton onClick={() => toggleSection('info')} aria-expanded={openSection === 'info'} aria-controls="course-information" icon={<PixelIcon name="book" />}>{copyText('system.map.047')}</PixelButton>
          <PixelButton onClick={() => toggleSection('resources')} aria-expanded={openSection === 'resources'} aria-controls="course-resources" icon={<PixelIcon name="archive" />}>{copyText('system.map.048')}</PixelButton>
        </div>}
      </header>
      {location.state?.experimentNotice && <Alert type="warning" showIcon title={location.state.experimentNotice} className="pixel-map-notice" />}
      <AsyncPageState loading={loading} error={error} onRetry={retry}>
        {data && <>
          {(studentTestConfigEnabled || look.sample) && <CopyBlock id="system.map.049" as="p" className="space-map-test-note"/>}
          <PixelPanel className="pixel-map-course-info" id="course-information" hidden={openSection !== 'info'}>
            <Typography.Title level={3}>{copyText('system.map.050')}</Typography.Title>
            {course.description&&<Sentence as={Typography.Paragraph}>{course.description}</Sentence>}
            <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }} items={[
              ...(course.theme?[{ key: 'theme', label: copyText('system.map.052'), children: course.theme }]:[]),
              { key: 'grade', label: copyText('system.map.054'), children: grades[course.grade_level] || course.grade_level || copyText('system.map.055') },
              { key: 'difficulty', label: copyText('system.map.056'), children: difficulties[course.difficulty] || course.difficulty || copyText('system.map.057') },
              { key: 'lessons', label: copyText('system.map.058'), children: data.lessons.length + copyText('system.map.059') },
              { key: 'tasks', label: copyText('system.map.060'), children: data.tasks.length + copyText('system.map.061') },
            ]} />
            {(course.driving_question||course.story_line||course.materials_needed)&&<Collapse size="small" items={[{ key: 'intro', label: copyText('system.map.062'), children: <Descriptions column={1} items={[
              { key: 'question', label: copyText('system.map.063'), children: course.driving_question },
              { key: 'story', label: copyText('system.map.065'), children: course.story_line },
              { key: 'materials', label: copyText('system.map.067'), children: course.materials_needed },
            ].filter(item=>item.children)} /> }]} />}
            <div className="pixel-map-info-links"><Link to={'/courses/' + id + '/learn'}>{copyText('system.map.069')}</Link>
              {current && <Link to={'/courses/' + id + '/lessons/' + current.id + '/learn'}>{copyText('system.map.070')}{current.title}</Link>}
            </div>
            <AssociatedExperiments courseId={id} />
          </PixelPanel>
          <PixelPanel className="pixel-map-course-info" id="course-resources" hidden={openSection !== 'resources'}>
            <CourseResources resources={data.resources || []} courseId={id} />
          </PixelPanel>
          <CourseTodos detail={data}/>
          <div className="pixel-map-overview">
            <div className="space-route-summary"><Typography.Title level={3}>{copyText('system.map.071')}</Typography.Title><span>{planned?lessons.length:data.lessons.length}{copyText(planned?'next.map.count':'system.map.072')}</span></div>
            <div className="pixel-map-course-progress"><span>{copyText('system.map.073')}</span><PixelProgress value={data.progress} label={copyText('system.map.074')} /></div>
          </div>
          {!lessons.length ? <PixelPanel className="pixel-map-empty"><Empty description={copyText('system.map.075')} /></PixelPanel> : <div className="pixel-map-layout">
            <div className="pixel-map-stage" aria-label={copyText('system.map.076')}>
              <SceneArt name={look.theme==='voyage'?'cosmos':'campus'} vertical={look.theme==='voyage'} className="space-map-art" priority/>
              <div className="pixel-map-route-content">
                {groups.map((group, groupIndex) => <CourseRouteRegion key={group.key} group={group} groupIndex={groupIndex} current={current} selected={selected} selectionKey={selectionKey} onSelect={(next,button)=>{trigger.current=button;button.focus();setSelection(next);session?.openOverlay('details');}} hasNext={groupIndex < groups.length - 1} theme={look.theme} />)}
              </div>
              <CopyBlock id="system.map.077" as="p" className="pixel-map-route-note"/>
            </div>
            <Modal open={openDetails} centered destroyOnHidden width={640} zIndex={1250} title={copyText('patch.map.title')} footer={null} rootClassName="student-pixel student-interactions space-lesson-modal" onCancel={()=>session.openOverlay(null)} focusable={{trap:true,focusTriggerAfterClose:false}} modalRender={node=><div onKeyDownCapture={trapFocus}>{node}</div>} afterClose={()=>{if(!session?.overlay&&trigger.current?.isConnected)trigger.current.focus({preventScroll:true});}}>{openDetails&&details}</Modal>
          </div>}
          <nav className="space-map-extra" aria-label={copyText('system.map.080')}><Link to={'/courses/'+id+'/tasks'}>{copyText('system.map.081')}</Link><Link to={'/courses/'+id+'/works'}>{copyText('system.map.082')}</Link><Link to={'/courses/'+id+'/reflection'}>{copyText('system.map.083')}</Link></nav>
        </>}
      </AsyncPageState>
    </div>
  </PageContainer>;
}
