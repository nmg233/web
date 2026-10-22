import {Descriptions,Empty,Tag} from 'antd';
import Sentence from '../../content/Sentence';

export default function PublicationSnapshot({snapshot,lesson}){
 if(!snapshot)return <Empty description="提交内容不可用，请勿批准"/>;
 const record=lesson?snapshot.lesson:snapshot;
 return <section aria-label="不可变审批内容">
  <Descriptions column={1} size="small" bordered>
   <Descriptions.Item label="标题">{record.title}</Descriptions.Item>
   <Descriptions.Item label="简介"><Sentence>{record.description||'未填写'}</Sentence></Descriptions.Item>
   <Descriptions.Item label={lesson?'课堂回顾':'学习目标'}><Sentence>{lesson?record.review_content||record.article_title||'见视频及资料':record.learning_objectives||'未填写'}</Sentence></Descriptions.Item>
  </Descriptions>
  {lesson&&<><h4>提交的视频与资料</h4>{snapshot.replays?.map(r=><p key={'v'+r.id}><Tag>视频 #{r.id}</Tag>{r.title} · {r.description}</p>)}{snapshot.resources?.map(r=><p key={'r'+r.id}><Tag>资料 #{r.id}</Tag>{r.title}</p>)}
   <h4>知识卡片与配套习题</h4>{snapshot.cards?.map(c=><article key={c.id}><strong>{c.title}</strong><Sentence>{c.content}</Sentence>{c.exercises?.map((e,i)=><div key={e.id}><p>{i+1}. {e.prompt}（{e.question_type}）</p><p>选项：{e.options_json}</p><p>参考答案：{e.answer_json}</p><Sentence>{e.explanation}</Sentence></div>)}</article>)}<h4>独立成果任务</h4>{snapshot.tasks?.map(t=><article key={t.id}><strong>{t.title}</strong><Sentence>{t.description}</Sentence><p>截止时间：{t.deadline||'未设置'} · {t.require_upload?'要求上传附件':'允许文字提交'}</p></article>)}</>}
  <details><summary>核对完整提交字段</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:360,overflow:'auto'}}>{JSON.stringify(snapshot,null,2)}</pre></details>
 </section>;
}
