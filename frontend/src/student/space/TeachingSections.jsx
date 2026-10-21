import ConfigCopyText from '../../content/ConfigText';
import StudentCopyText from '../../content/ManagedText';
import ArticleContent from './ArticleContent';
import {StudySection} from '../visual/StudyUI';
import Sentence from '../../content/Sentence';
import {copyText} from '../../content/copy';
import {hasTeachingValue,validArticleBlocks} from '../../utils/teachingContent';
// Presentational only: both maintenance previews and students use these regions.
export function VisitSections({lesson,photos,renderPhoto,resources=photos,download,region=(_key,children)=>children,maintenance=false}){
 const blocks=validArticleBlocks(lesson.article_blocks,resources),used=new Set(blocks.flatMap(b=>b.type==='rich'?b.resourceIds||[]:b.type==='image'?[b.resourceId]:[]));photos=photos.filter(r=>!used.has(r.id)&&r.has_file!==false).sort((a,b)=>(a.display_order||0)-(b.display_order||0));
 return <>{(maintenance||hasTeachingValue(lesson.moments_note)||photos.length>0)&&<StudySection title={copyText('next.visit.moments')}>{region('moments_note',hasTeachingValue(lesson.moments_note)?<Sentence>{lesson.moments_note}</Sentence>:null)}{photos.length>0&&<div className="visit-photos">{photos.map(renderPhoto)}</div>}</StudySection>}{(maintenance||blocks.length>0||lesson.article_url?.startsWith('https://'))&&<StudySection title={hasTeachingValue(lesson.article_title)?lesson.article_title:copyText('next.visit.article')}>{region('article',blocks.length?<ArticleContent blocks={blocks} resources={resources} download={download}/>:lesson.article_url?.startsWith('https://')?<a href={lesson.article_url} target="_blank" rel="noopener noreferrer"><StudentCopyText id="next.visit.original"/></a>:null)}</StudySection>}</>;
}
export function LessonDescription({lesson}){return hasTeachingValue(lesson.description)?<StudySection title={copyText('next.template.description')}><Sentence><ConfigCopyText sentence object={lesson} field="description" value={lesson.description}/></Sentence></StudySection>:null;}
