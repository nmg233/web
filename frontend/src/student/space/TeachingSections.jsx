import ArticleContent,{articleBlocks} from './ArticleContent';
import {StudySection} from '../visual/StudyUI';
import Sentence from '../../content/Sentence';
import {copyText} from '../../content/copy';
// Presentational only: both maintenance previews and students use these regions.
export function VisitSections({lesson,photos,renderPhoto,resources=photos,download,region=(_key,children)=>children}){
 const blocks=articleBlocks(lesson.article_blocks),used=new Set(blocks.filter(b=>b.type==='image').map(b=>b.resourceId));photos=photos.filter(r=>!used.has(r.id)).sort((a,b)=>(a.display_order||0)-(b.display_order||0));
 return <><StudySection title={copyText('next.visit.moments')}>{region("moments_note",<Sentence>{lesson.moments_note}</Sentence>)}{photos.length?<div className="visit-photos">{photos.map(renderPhoto)}</div>:!blocks.length&&<p>{copyText('next.visit.empty')}</p>}</StudySection><StudySection title={lesson.article_title||copyText('next.visit.article')}>{region("article",blocks.length?<ArticleContent blocks={blocks} resources={resources} download={download}/>:lesson.article_url?<a href={lesson.article_url} target="_blank" rel="noopener noreferrer">{copyText('next.visit.original')}</a>:<p>{copyText('next.visit.noArticle')}</p>)}</StudySection></>;
}
export function LessonDescription({lesson}){return lesson.description?<StudySection title={copyText('next.template.description')}><Sentence>{lesson.description}</Sentence></StudySection>:null;}
