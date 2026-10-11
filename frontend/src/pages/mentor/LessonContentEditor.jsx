import {copyText as siteText, copyTemplate as siteTemplate} from "../../content/copy";
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Button, Card, Form, Input, InputNumber, Modal, Popconfirm,
  Select, Space, Switch, Tag, Typography, message,
} from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { learningManageAPI } from '../../api';
import {copyText} from '../../content/copy';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';

const blankCard = { status: 'draft', is_required: true, estimated_minutes: 10 };
const statusLabel = { draft: siteText("site.e018a8985a3bf3e9"), published: siteText("site.b7e0e04e6c7f8a9b"), archived: siteText("site.b8f1d565c600b2b5") };
const typeLabel = { single_choice: siteText("site.ca96d9b36ed9cccc"), multiple_choice: siteText("site.e2f832a2961679bf"), true_false: siteText("site.8f0243233f3cdecc"), fill_blank: siteText("site.c716c74faa512c61"), short_answer: siteText("site.b9834e4dc44d2da0") };

export default function LessonContentEditor({embeddedCourseId,embeddedLessonId,onBusyChange,onDirtyChange}) {
  const params=useParams();const courseId=embeddedCourseId||params.courseId,lessonId=embeddedLessonId||params.lessonId;
  const navigate = useNavigate();
  const [cards, setCards] = useState([]);
  const [editing, setEditing] = useState(null);
  const [exerciseCard, setExerciseCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving,setSaving]=useState(false),[saveError,setSaveError]=useState(''),[saved,setSaved]=useState(false),[savedExerciseId,setSavedExerciseId]=useState(null);
  const live=useRef(true),seq=useRef(0),busy=useRef(false),exerciseIdentity=useRef(null),exerciseRevision=useRef(null);
  // seq is a request counter; cleanup deliberately invalidates outstanding reads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{live.current=true;return()=>{live.current=false;seq.current++;};},[]);
  useEffect(()=>{onBusyChange?.(saving);return()=>onBusyChange?.(false);},[saving,onBusyChange]);
  const [cardForm] = Form.useForm();
  const [exerciseForm] = Form.useForm();

  const load = async () => {
    setLoading(true); setError('');
    const ticket=++seq.current;try { const result=await learningManageAPI.cards(lessonId);if(live.current&&ticket===seq.current)setCards(result.cards||[]);return true; }
    catch (err) { if(live.current&&ticket===seq.current){setCards([]);setError(err?.response?.data?.error || siteText("site.0ec5c3b9c236f61c"));}return false; }
    finally { if(live.current&&ticket===seq.current)setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [lessonId]);

  const openCard = (card = blankCard) => {
    setSaveError('');setSaved(false);cardForm.resetFields();setEditing(card);
    cardForm.setFieldsValue({ ...card, is_required: Boolean(card.is_required) });
  };
  const saveCard = async (status) => {
    const values=await cardForm.validateFields();if(busy.current)return;busy.current=true;setSaving(true);setSaveError('');
    try {
      const payload={...values,status,...(editing?.content_revision?{expected_revision:editing.content_revision}:{})};
      const result=editing?.id?await learningManageAPI.updateCard(editing.id,payload):await learningManageAPI.createCard(lessonId,payload);
      if(!live.current)return;
      setEditing(current=>({...current,...payload,id:result.id,content_revision:result.content_revision}));setSaved(true);onDirtyChange?.(false);
      if(!await load())setSaveError(copyText('next2.save.readFailed'));
    } catch(err){if(live.current)setSaveError(err?.response?.data?.error||copyText('next2.save.failed'));}
    finally{busy.current=false;if(live.current)setSaving(false);}
  };
  const publishCard = async (cardId) => {
    await learningManageAPI.updateCard(cardId, { status: 'published',expected_revision:cards.find(c=>c.id===cardId)?.content_revision });
    message.success(siteText("site.093f23f1d6f89e09"));
    await load();
  };
  const saveExercise = async (values) => {
    const options = values.options_text ? values.options_text.split('\n').map((value) => value.trim()).filter(Boolean) : [];
    let answer = values.answer;
    if (values.question_type === 'multiple_choice') answer = String(answer).split(',').map((value) => value.trim()).filter(Boolean);
    if (values.question_type === 'true_false') answer = String(answer) === 'true';
    if(busy.current)return;busy.current=true;setSaving(true);setSaveError('');
    try{const payload={...values,options,answer,max_attempts:1,...(exerciseRevision.current?{expected_revision:exerciseRevision.current}:{})};const result=exerciseIdentity.current?await learningManageAPI.updateExercise(exerciseIdentity.current,payload):await learningManageAPI.createExercise(exerciseCard.id,payload);if(!live.current)return;exerciseIdentity.current=result.id;exerciseRevision.current=result.content_revision;setSavedExerciseId(result.id);setSaved(true);if(!await load())setSaveError(copyText('next2.save.exerciseReadFailed'));}
    catch(err){if(live.current)setSaveError(err?.response?.data?.error||copyText('next2.save.failed'));}
    finally{busy.current=false;if(live.current)setSaving(false);}
  };

  return <PageContainer
    title={siteText("site.58a75b4ad9f3609c")}
    description={siteText("site.851a9d1035acf2bf")}
    extra={!embeddedCourseId&&<Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/courses/${courseId}`)}>{siteText("site.30a332e6ab645388")}</Button>}
  >
    <p>{copyText('next2.guide.card')}</p><Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 16 }} onClick={() => openCard()}>{siteText("site.dac98a402a2de702")}</Button>
    <AsyncPageState loading={loading} error={error} onRetry={load} empty={!cards.length} emptyText={siteText("site.8a613b8889143bbb")}>
      {cards.map((card, index) => <Card
        className="content-card"
        key={card.id}
        style={{ marginBottom: 16 }}
        title={<Space wrap><span>{index + 1}. {card.title}</span><Tag color={card.status === 'published' ? 'green' : 'default'}>{statusLabel[card.status] || card.status}</Tag>{card.is_required ? <Tag color="blue">{siteText("site.8d568c2f4d7cf9aa")}</Tag> : <Tag>{siteText("site.54c1d1853c43fb9f")}</Tag>}</Space>}
        extra={<Space wrap>
          {card.status === 'draft' && <Button type="primary" onClick={() => publishCard(card.id)}>{siteText("site.57beb4e2273bfc49")}</Button>}
          <Button onClick={() => openCard(card)}>{siteText("site.1b13df6543989759")}</Button>
          <Button onClick={() => { exerciseIdentity.current=null;exerciseRevision.current=null;setSaved(false);setSaveError('');setExerciseCard(card); exerciseForm.resetFields(); }}>{siteText("site.1a1135cf0558c2d0")}</Button>
          <Popconfirm title={siteText("site.e8d8aa7a78c49d42")} onConfirm={async () => { await learningManageAPI.deleteCard(card.id); load(); }}><Button danger>{siteText("site.e42db20e64609768")}</Button></Popconfirm>
        </Space>}
      >
        <Typography.Paragraph type="secondary">{card.summary || siteText("site.263500e91e36e108")}</Typography.Paragraph>
        <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{card.content}</Typography.Paragraph>
        {(card.exercises || []).length === 0
          ? <Alert type="warning" showIcon message={siteText("site.03234d068ef54c58")} />
          : (card.exercises || []).map((exercise) => <Card size="small" key={exercise.id} style={{ marginTop: 8 }}><Space wrap><Tag>{typeLabel[exercise.question_type]}</Tag><span>{exercise.prompt}</span><Button onClick={()=>{exerciseIdentity.current=exercise.id;exerciseRevision.current=exercise.content_revision;setSaved(false);setSaveError('');setExerciseCard(card);exerciseForm.resetFields();exerciseForm.setFieldsValue({...exercise,options_text:(exercise.options||[]).map(o=>typeof o==='string'?o:o.label).join('\n'),answer:exercise.question_type==='multiple_choice'?(exercise.answer||[]).join(','):String(exercise.answer??'')});}}>{copyText('authoring.exercise.edit')}</Button><Tag>{siteText("site.d9e3cbbcf034a67a")}</Tag><Popconfirm title={siteText("site.5f30f93c34256e7b")} onConfirm={async () => { await learningManageAPI.deleteExercise(exercise.id); load(); }}><Button type="link" danger>{siteText("site.e42db20e64609768")}</Button></Popconfirm></Space></Card>)}
      </Card>)}
    </AsyncPageState>

    <Modal open={Boolean(editing)} title={editing?.id ? siteText("site.35d2733c5e38c7a1") : siteText("site.c2873e042212bb41")} onCancel={() => {if(!busy.current)setEditing(null);}} closable={!saving} maskClosable={!saving} footer={null} width={720} destroyOnHidden>
      <Form form={cardForm} layout="vertical" disabled={saving} onValuesChange={()=>{setSaved(false);onDirtyChange?.(true);}}>{saveError&&<Alert type="warning" title={saveError}/>}{saved&&<Alert type="success" title={copyText('next2.save.saved')+' #'+editing?.id}/>}
        <Form.Item name="title" label={siteText("site.5929135088a8a879")} rules={[{ required: true, message: siteText("site.2c46de594ed09a2b") }]}><Input /></Form.Item>
        <Form.Item name="summary" label={siteText("site.33522fe8025f7ec7")}><Input.TextArea /></Form.Item>
        <Form.Item name="content" label={siteText("site.c8623bbefa078e88")} rules={[{ required: true, message: siteText("site.e21c8903ca2a927e") }]}><Input.TextArea rows={7} /></Form.Item>
        <Form.Item name="key_points" label={siteText("site.7b693b962943f083")}><Input.TextArea /></Form.Item>
        <Form.Item name="common_mistakes" label={siteText("site.19656aa9732438ee")}><Input.TextArea /></Form.Item>
        <Space wrap><Form.Item name="estimated_minutes" label={siteText("site.aed49c6a8abff7ea")}><InputNumber min={1} max={600} /></Form.Item><Form.Item name="is_required" label={siteText("site.12960e8e957ceb41")} valuePropName="checked"><Switch /></Form.Item></Space>
        <Space style={{ display: 'flex', justifyContent: 'flex-end' }}><Button disabled={saving} onClick={() => setEditing(null)}>{siteText("site.cfbcee75c2739e0c")}</Button><Button loading={saving} disabled={saved} onClick={() => saveCard('draft')}>{siteText("site.799958967644e36c")}</Button><Button type="primary" loading={saving} disabled={saved} onClick={() => saveCard('published')}>{siteText("site.02af00cb0c0cf3b9")}</Button></Space>
      </Form>
    </Modal>

    <Modal open={Boolean(exerciseCard)} title={siteTemplate("site.173f6c597f35f3a3", {slot0: (exerciseCard?.title || '')})} closable={!saving} maskClosable={!saving} onCancel={() => {if(!busy.current)setExerciseCard(null);}} onOk={() => exerciseForm.submit()} confirmLoading={saving} okButtonProps={{disabled:saved}} destroyOnHidden>
      <Form form={exerciseForm} layout="vertical" initialValues={{ question_type: 'single_choice', points: 1, is_required: true }} onValuesChange={()=>setSaved(false)} disabled={saving} onFinish={saveExercise}>{saveError&&<Alert type="warning" title={saveError}/>}{saved&&<Alert type="success" title={siteText("site.3faf9c0286d43c22")+savedExerciseId}/>}
        <Alert type="info" showIcon message={siteText("site.931c67ecf87566d3")} style={{ marginBottom: 16 }} />
        <Form.Item name="question_type" label={siteText("site.b45d6927e175fd4c")} rules={[{ required: true }]}><Select options={Object.entries(typeLabel).map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item name="prompt" label={siteText("site.6449436dfcb1050d")} rules={[{ required: true, message: siteText("site.3214a29d07e72079") }]}><Input.TextArea /></Form.Item>
        <Form.Item name="options_text" label={siteText("site.caa580f09181c0a2")}><Input.TextArea /></Form.Item>
        <Form.Item name="answer" label={siteText("site.05a317e07ab3800b")} rules={[{ required: true, message: siteText("site.128683e023e0527b") }]}><Input /></Form.Item>
        <Form.Item name="explanation" label={siteText("site.96fdffb36dc07b8f")} rules={[{ required: true, message: siteText("site.8204a179f331ac4c") }]}><Input.TextArea rows={4} showCount maxLength={5000} /></Form.Item>
      </Form>
    </Modal>
  </PageContainer>;
}
