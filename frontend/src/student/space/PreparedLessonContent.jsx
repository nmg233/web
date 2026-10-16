import ConfigCopyText from '../../content/ConfigText';
import {runtimeText as runtimeCopyText} from '../../content/runtimeCopy';
import StudentCopyText from '../../content/ManagedText';
import ArticleContent,{articleBlocks} from './ArticleContent';
import {copyText} from '../../content/copy';
import {Collapse,Input,Radio,Checkbox} from 'antd';
import {StudySection} from '../visual/StudyUI';
import MarkdownContent from '../../components/common/MarkdownContent';
import Sentence from '../../content/Sentence';
import ExerciseView from './ExerciseView';
export function PreparedCards({cards=[]}){
 return <><p><StudentCopyText id="student26.a0a523aa7ffdc691"/>{cards.length}<StudentCopyText id="student26.856bb24d4c1bd46e"/></p><Collapse items={cards.map((card,index)=>({key:card.id,label:<span data-teaching-field="cards" data-object-id={card.id}>{index+1}. {card.title}</span>,children:<article data-card-id={card.id} data-teaching-field="cards" data-object-id={card.id}><Sentence><ConfigCopyText sentence object={card} field="summary" value={card.summary}/></Sentence><MarkdownContent>{card.content}</MarkdownContent>{card.key_points&&<Sentence>{card.key_points}</Sentence>}{(card.exercises||[]).map((e,i)=>{const options=(e.options||[]).map((o,n)=>typeof o==='object'?{label:o.label??o.text,value:o.value??o.key??String(n)}:{label:o,value:o});const input=e.question_type==='single_choice'?<Radio.Group disabled options={options}/>:e.question_type==='multiple_choice'?<Checkbox.Group disabled options={options}/>:<Input.TextArea disabled placeholder={runtimeCopyText("student26.1f30cf0cda25039f")}/>;return <ExerciseView key={e.id} exercise={e} index={i} readonly input={input}/>;})}</article>}))}/></>;
}
export default function PreparedLessonContent({data,region,download}){
 return <>{['review','cards','tasks'].map(key=><StudySection key={key} title={copyText({review:'system.learning.077',cards:'system.learning.093',tasks:'site.422217ee612b1ccc'}[key])} data-copy-bindings={JSON.stringify([{review:'system.learning.077',cards:'system.learning.093',tasks:'site.422217ee612b1ccc'}[key]])}>{region(key==='review'?'review_content':key,key==='review'?<><Sentence>{data.lesson.review_content??data.lesson.description}</Sentence>{region('article',<><h4>{data.lesson.article_title}</h4>{articleBlocks(data.lesson.article_blocks).length?<ArticleContent blocks={data.lesson.article_blocks} resources={data.resources} download={download}/>:data.lesson.article_url?.startsWith('https://')?<a href={data.lesson.article_url} target="_blank" rel="noopener noreferrer"><StudentCopyText id="lesson.article.open"/></a>:null}</>)}</>:key==='cards'?<PreparedCards cards={data.cards}/>:data.consolidation_tasks?.length?data.consolidation_tasks.map(t=><article key={t.id} data-teaching-field="tasks" data-object-id={t.id}><h4><ConfigCopyText object={t} field="title" value={t.title}/></h4><Sentence><ConfigCopyText sentence object={t} field="description" value={t.description}/></Sentence><p><StudentCopyText id="student26.d65632c737cc6ff2"/></p></article>):<p><StudentCopyText id="student26.d00ba6a278b59d16"/></p>)}</StudySection>)}</>;
}
