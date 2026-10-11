import {ProtectedPhoto,articleBlocks} from './ArticleContent';
import {Link} from 'react-router-dom';
import {StudyHeader,StudySection} from '../visual/StudyUI';
import {copyText} from '../../content/copy';
import Sentence from '../../content/Sentence';
import PageContainer from '../../components/common/PageContainer';
import AssociatedExperiments from '../AssociatedExperiments';
import CourseResourceDownload from '../CourseResourceDownload';
import TemplateReplays from '../TemplateReplays';
import {VisitSections,LessonDescription} from './TeachingSections';
export function LessonTemplateView({data,region=(_key,children)=>children,download,replays,experiments,renderResource,maintenance=false}){
 const {lesson,course,resources}=data,visit=lesson.presentation_type==='visit';
 const photos=resources.filter(r=>r.lesson_id===lesson.id&&['png','jpg','jpeg','webp'].includes(r.file_type));
 return <PageContainer><div className="study-workspace lesson-template" data-testid="lesson-template"><StudyHeader title={region("schedule",lesson.title)} description={copyText(visit?'next.visit.info':'next.template.preparing')}/>
 <Link to={'/courses/'+course.id+'?lesson='+lesson.id}>{copyText('course.nav.return')}</Link>
 {visit?<><VisitSections lesson={lesson} photos={photos} resources={resources} download={download} region={region} renderPhoto={r=><ProtectedPhoto key={r.id} resource={r} download={download}/>}/><p>{copyText('next.visit.noCompletion')}</p></>:<>{['review','cards','tasks'].map(key=><StudySection key={key} title={copyText('next.template.'+key)}>{region(key==='review'?'review_content':key,<p>{copyText('next.template.empty')}</p>)}</StudySection>)}<StudySection title={copyText('next.template.experiment')}>{region("experiment_guidance",<Sentence>{lesson.experiment_guidance??lesson.teaching_tip}</Sentence>)}{experiments}</StudySection></>}
 {region("description",<LessonDescription lesson={lesson}/>)}{region("replays",replays)}
 <StudySection title={copyText('system.map.014')}>{region("resources",resources.filter(r=>!articleBlocks(lesson.article_blocks).some(b=>b.resourceId===r.id)).map(r=><div key={r.id}><strong>{r.title}</strong>{renderResource?.(r)}</div>))}{!resources.length&&<p>{copyText('next.template.noResources')}</p>}{maintenance&&region("report_guidance",<Sentence>{lesson.report_guidance}</Sentence>)}</StudySection></div></PageContainer>;
}

export default function LessonTemplate({data}){const {course,lesson}=data;return <LessonTemplateView data={data} replays={<TemplateReplays rows={data.replays}/>} experiments={<AssociatedExperiments courseId={course.id} lessonId={lesson.id} stage={0}/>} renderResource={r=><CourseResourceDownload resource={r} courseId={course.id}/>}/>;}
