import {hasTeachingValue,validArticleBlocks} from '../../utils/teachingContent';
import ConfigCopyText from '../../content/ConfigText';
import StudentCopyText from '../../content/ManagedText';
import Alert from '../visual/StudentAlert';
import PreparedLessonContent from './PreparedLessonContent';
import {ProtectedPhoto} from './ArticleContent';
import {Link} from 'react-router-dom';
import {StudyHeader,StudySection} from '../visual/StudyUI';
import {copyText} from '../../content/copy';
import Sentence from '../../content/Sentence';
import PageContainer from '../../components/common/PageContainer';
import {useCoursePresentation} from './CoursePresentation';
import AssociatedExperiments from '../AssociatedExperiments';
import CourseResourceDownload from '../CourseResourceDownload';
import TemplateReplays from '../TemplateReplays';
import {VisitSections,LessonDescription} from './TeachingSections';
export function LessonTemplateView({data,region=(_key,children)=>children,download,replays,experiments,renderResource,maintenance=false}){
 const {lesson,course,resources}=data,visit=lesson.presentation_type==='visit',files=resources.filter(r=>r.has_file!==false&&!validArticleBlocks(lesson.article_blocks,resources).some(b=>b.resourceId===r.id));
 const photos=resources.filter(r=>r.lesson_id===lesson.id&&['png','jpg','jpeg','webp'].includes(r.file_type));
 return <PageContainer><div className="study-workspace lesson-template" data-testid="lesson-template"><StudyHeader title={region("schedule",lesson.title)} description={copyText(visit?'next.visit.info':'next.template.preparing')} data-copy-bindings={JSON.stringify([visit?'next.visit.info':'next.template.preparing'])}/>
 {data.read_only_reason&&<Alert type="info" title={data.read_only_reason}/>}<Link to={'/courses/'+course.id+'?lesson='+lesson.id}>{<StudentCopyText id={'course.nav.return'}/>}</Link>
 {visit?<><VisitSections maintenance={maintenance} lesson={lesson} photos={photos} resources={resources} download={download} region={region} renderPhoto={r=><ProtectedPhoto key={r.id} resource={r} download={download}/>}/><PreparedLessonContent hideReview maintenance={maintenance} data={data} region={region} download={download}/><p>{<StudentCopyText id={'next.visit.noCompletion'}/>}</p></>:<><PreparedLessonContent maintenance={maintenance} data={data} region={region} download={download}/>{(maintenance||hasTeachingValue(lesson.experiment_guidance)||data.experiments?.length>0)&&<StudySection title={copyText('next.template.experiment')} data-copy-bindings={JSON.stringify(['next.template.experiment'])}>{region("experiment_guidance",<Sentence>{lesson.experiment_guidance}</Sentence>)}{experiments}</StudySection>}</>}
 {region("description",<LessonDescription lesson={lesson}/>)}{region("replays",replays)}
 {(maintenance||files.length>0)&&<StudySection title={copyText('system.map.014')} data-copy-bindings={JSON.stringify(['system.map.014'])}>{region("resources",files.map(r=><div key={r.id} data-teaching-field="resources" data-object-id={r.id}><strong><ConfigCopyText object={r} field="title" value={r.title}/></strong>{renderResource?.(r)}</div>))}{maintenance&&region("report_guidance",<Sentence>{lesson.report_guidance}</Sentence>)}</StudySection>}</div></PageContainer>;
}

export default function LessonTemplate({data}){const {course,lesson}=data,look=useCoursePresentation();return <LessonTemplateView data={{...data,experiments:look.experiments.filter(e=>!e.lessonId||e.lessonId===lesson.id)}} region={data.preview?(field,children)=><span data-teaching-field={field} data-lesson-id={lesson.id} data-course-id={course.id}>{children}{field==='article'&&<button type="button">编辑课堂文章</button>}</span>:undefined} replays={<TemplateReplays rows={data.replays}/>} experiments={<AssociatedExperiments courseId={course.id} lessonId={lesson.id} stage={0}/>} renderResource={r=><CourseResourceDownload resource={r} courseId={course.id}/>}/>;}
