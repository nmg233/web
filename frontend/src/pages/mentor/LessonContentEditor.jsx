import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Button, Card, Form, Input, InputNumber, Modal, Popconfirm,
  Select, Space, Tag, Typography, Tabs, message,
} from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { learningManageAPI } from '../../api';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';
import QuestionFields from '../../components/common/QuestionFields';
import { questionForm, questionPayload } from '../../utils/questionForm';
import { exerciseAnswer } from '../../utils/exerciseAnswer';
import MarkdownContent from '../../components/common/MarkdownContent';
import StudentCardPreview from '../../components/common/StudentCardPreview';
import { useAuth } from '../../store/AuthContext';

const blankCard = { status: 'draft', is_required: true, estimated_minutes: 10 };
const statusLabel = { draft: '草稿·学生不可见', published: '已发布', archived: '已归档' };
const typeLabel = { single_choice: '单选题', multiple_choice: '多选题', true_false: '判断题', fill_blank: '填空题', short_answer: '简答题' };

export default function LessonContentEditor() {
  const { courseId, lessonId } = useParams();
  return <LessonContentEditorPage key={`${courseId}:${lessonId}`} />;
}

function LessonContentEditorPage() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cards, setCards] = useState([]);
  const [context, setContext] = useState(null);
  const [preview, setPreview] = useState(null);
  const sequence = useRef(0);
  const generation = useRef(0);
  const [editing, setEditing] = useState(null);
  const [exerciseCard, setExerciseCard] = useState(null);
  const [editingExercise, setEditingExercise] = useState(null);
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairForm] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [cardForm] = Form.useForm();
  const [exerciseForm] = Form.useForm();
  const cardContent = Form.useWatch('content', cardForm);

  const load = async () => {
    const request = ++sequence.current;
    setLoading(true); setError('');
    try {
      const payload = await learningManageAPI.cards(lessonId);
      if (request === sequence.current) { setCards(payload.cards || []); setContext(payload.context); }
    }
    catch (err) { if (request === sequence.current) setError(err?.response?.data?.error || '无法加载课时内容'); }
    finally { if (request === sequence.current) setLoading(false); }
  };
  useEffect(() => {
    const requests = sequence; const route = generation;
    // 路由变化时清空旧课时表单，阻止在新页面提交旧对象。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditing(null); setExerciseCard(null); setRepairOpen(false); setPreview(null); setContext(null); setCards([]); setSaving(false);
    load();
    return () => { requests.current++; route.current++; };
  }, [lessonId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCard = (card = blankCard) => {
    setEditing(card);
    cardForm.resetFields();
    cardForm.setFieldsValue({ ...card, is_required: Boolean(card.is_required) });
  };
  const saveCard = async (status) => {
    const route = generation.current;
    const values = await cardForm.validateFields();
    if (route !== generation.current || context?.read_only) return;
    setSaving(true);
    try {
      const payload = { ...values, status, is_required:true };
      if (editing?.id) await learningManageAPI.updateCard(editing.id, payload);
      else await learningManageAPI.createCard(lessonId, payload);
      if (route !== generation.current) return;
      message.success(status === 'published' ? '知识卡片已发布，学生现在可以学习' : '知识卡片草稿已保存');
      setEditing(null); await load();
    } finally { if (route === generation.current) setSaving(false); }
  };
  const publishCard = async (cardId) => {
    const route = generation.current;
    await learningManageAPI.updateCard(cardId, { status: 'published' });
    if (route !== generation.current) return;
    message.success('知识卡片已发布，学生现在可以学习');
    await load();
  };
  const openExercise = (card, exercise = null) => {
    setExerciseCard(card); setEditingExercise(exercise); exerciseForm.resetFields();
    exerciseForm.setFieldsValue(exercise ? questionForm(exercise) : {
      question_type: 'single_choice', points: 1, is_required: true,
      options: [{ label: '', value: 'A' }, { label: '', value: 'B' }], blanks: [''],
    });
  };
  const saveExercise = async (values) => {
    const route = generation.current;
    if (context?.read_only) return;
    setSaving(true);
    try {
      const payload = questionPayload(values);
      if (editingExercise?.id) await learningManageAPI.updateExercise(editingExercise.id, payload);
      else await learningManageAPI.createExercise(exerciseCard.id, payload);
      if (route !== generation.current) return;
      message.success('练习已保存；已开始学习的学生继续使用固定版本');
      setExerciseCard(null); await load();
    } finally { if (route === generation.current) setSaving(false); }
  };
  const moveCard = async (index, delta) => {
    const route = generation.current;
    const ids = cards.map((c) => c.id); [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    await learningManageAPI.reorderCards(lessonId, ids);
    if (route === generation.current) await load();
  };
  const removeContent = async (operation) => {
    const route = generation.current;
    if (context?.read_only) return;
    await operation();
    if (route === generation.current) await load();
  };

  return <PageContainer
    title="课时内容编辑"
    description="知识卡片默认保存为学生不可见的草稿；内容与答案详解确认后再发布。"
    extra={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/courses/${courseId}`)}>返回课程</Button>}
  >
    {context?.read_only && <Alert type="info" message="归档或取消的课时只允许查看历史内容和预览。" style={{marginBottom:16}} />}
    <Button disabled={loading || Boolean(error) || context?.read_only} type="primary" icon={<PlusOutlined />} style={{ marginBottom: 16 }} onClick={() => openCard()}>新增知识卡片</Button>
    {user?.role === 'admin' && <Button disabled={loading || Boolean(error) || context?.read_only} style={{ marginLeft: 12 }} onClick={() => setRepairOpen(true)}>修复指定学生的历史缺失内容</Button>}
    <AsyncPageState loading={loading} error={error} onRetry={load} empty={!cards.length} emptyText="尚未创建知识卡片">
      {cards.map((card, index) => <Card
        className="content-card"
        key={card.id}
        style={{ marginBottom: 16 }}
        title={<Space wrap><span>{index + 1}. {card.title}</span><Tag color={card.status === 'published' ? 'green' : 'default'}>{statusLabel[card.status] || card.status}</Tag><Tag color="blue">流程内全部完成</Tag></Space>}
        extra={<Space wrap><Button onClick={() => setPreview(card)}>学生视角预览</Button>{!context?.read_only && <>
          {card.status === 'draft' && <Button type="primary" onClick={() => publishCard(card.id)}>发布给学生</Button>}
          <Button onClick={() => openCard(card)}>编辑</Button>
          <Button disabled={index === 0} onClick={() => moveCard(index, -1)}>上移</Button><Button disabled={index === cards.length - 1} onClick={() => moveCard(index, 1)}>下移</Button>
          <Button onClick={() => openExercise(card)}>添加练习</Button>
          <Popconfirm title="确认删除或归档该卡片？" onConfirm={() => removeContent(() => learningManageAPI.deleteCard(card.id))}><Button danger>删除</Button></Popconfirm>
        </>}</Space>}
      >
        <Typography.Paragraph type="secondary">{card.summary || '暂无摘要'}</Typography.Paragraph>
        <MarkdownContent>{card.content}</MarkdownContent>
        {(card.exercises || []).length === 0
          ? <Alert type="warning" showIcon message="尚未配置配套练习" />
          : (card.exercises || []).map((exercise) => <Card size="small" key={exercise.id} style={{ marginTop: 8 }}><Space wrap><Tag>{typeLabel[exercise.question_type]}</Tag><span>{exercise.prompt}</span><Tag>一次作答</Tag><Button disabled={context?.read_only} type="link" onClick={() => openExercise(card, exercise)}>编辑题目</Button><Button disabled={context?.read_only} type="link" onClick={() => openExercise(card, { ...exercise, id: undefined })}>复制</Button><Typography.Text>参考答案：{exerciseAnswer(exercise.answer,exercise.options)}</Typography.Text><Typography.Paragraph>详解：{exercise.explanation}</Typography.Paragraph><Popconfirm title="确认删除该练习？" disabled={context?.read_only} onConfirm={() => removeContent(() => learningManageAPI.deleteExercise(exercise.id))}><Button disabled={context?.read_only} type="link" danger>删除</Button></Popconfirm></Space></Card>)}
      </Card>)}
    </AsyncPageState>
    <Modal title={`学生视角预览 · ${preview?.title || ''}`} open={Boolean(preview)} onCancel={() => setPreview(null)} footer={null} width={760} destroyOnHidden>{preview && <StudentCardPreview key={preview.id} card={preview} />}</Modal>
    <Modal title="定向修复历史兼容快照" open={repairOpen} onCancel={() => setRepairOpen(false)} onOk={() => repairForm.submit()} confirmLoading={saving}>
      <Alert type="warning" message="仅补齐缺失卡片、习题或视频，不更改已有题目和作答；已结课记录不可修复。请先补齐当前教学内容。" />
      <Form form={repairForm} layout="vertical" onFinish={async (values) => {
        const route = generation.current;
        if (context?.read_only) return;
        setSaving(true); try { await learningManageAPI.repairLegacy(lessonId,values); if (route !== generation.current) return; message.success('修复已完成并留有审计记录'); setRepairOpen(false); repairForm.resetFields(); }
        finally { if (route === generation.current) setSaving(false); }
      }}>
        <Form.Item name="student_id" label="学生 ID" rules={[{required:true}]}><InputNumber min={1} precision={0} /></Form.Item>
        <Form.Item name="reason" label="修复原因" rules={[{required:true,whitespace:true}]}><Input.TextArea maxLength={500} /></Form.Item>
      </Form>
    </Modal>

    <Modal open={Boolean(editing)} title={editing?.id ? '编辑知识卡片' : '新增知识卡片'} onCancel={() => setEditing(null)} footer={null} width={720} destroyOnHidden>
      <Form form={cardForm} layout="vertical">
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请填写卡片标题' }]}><Input /></Form.Item>
        <Form.Item name="summary" label="摘要"><Input.TextArea /></Form.Item>
        <Tabs items={[
          { key: 'edit', label: '编辑 Markdown', forceRender: true, children: <Form.Item name="content" label="正文（支持 Markdown）" extra="支持标题、加粗、列表、链接、代码块和表格；切换预览检查排版。" rules={[{ required: true, whitespace: true, message: '请填写卡片正文' }, { max: 20000, message: '正文不能超过 20000 个字符' }]}><Input.TextArea rows={10} showCount maxLength={20000} placeholder={'## 知识要点\n\n**核心概念**\n\n- 要点一\n- 要点二'} /></Form.Item> },
          { key: 'preview', label: '预览', children: <Card size="small" style={{ marginBottom: 16 }}><MarkdownContent>{cardContent || '尚未填写正文'}</MarkdownContent></Card> },
        ]} />
        <Form.Item name="key_points" label="关键要点"><Input.TextArea /></Form.Item>
        <Form.Item name="common_mistakes" label="常见误区"><Input.TextArea /></Form.Item>
        <Form.Item name="estimated_minutes" label="预计分钟"><InputNumber min={1} max={600} /></Form.Item>
        <Space style={{ display: 'flex', justifyContent: 'flex-end' }}><Button onClick={() => setEditing(null)}>取消</Button><Button loading={saving} onClick={() => saveCard('draft')}>保存草稿</Button><Button type="primary" loading={saving} onClick={() => saveCard('published')}>保存并发布</Button></Space>
      </Form>
    </Modal>

    <Modal open={Boolean(exerciseCard)} title={`${editingExercise?.id ? '编辑' : '添加'}练习 · ${exerciseCard?.title || ''}`} onCancel={() => setExerciseCard(null)} onOk={() => exerciseForm.submit()} confirmLoading={saving} width={720} destroyOnHidden>
      <Form form={exerciseForm} layout="vertical" initialValues={{ question_type: 'single_choice', points: 1, is_required: true }} onFinish={saveExercise}>
        <Alert type="info" showIcon message="每位学生每道题只有一次作答机会；提交后将立即看到标准答案详解。" style={{ marginBottom: 16 }} />
        <Form.Item name="question_type" label="题型" rules={[{ required: true }]}><Select onChange={() => exerciseForm.setFieldsValue({answer:undefined})} options={Object.entries(typeLabel).map(([value, label]) => ({ value, label }))} /></Form.Item>
        <QuestionFields form={exerciseForm} />
        <Form.Item name="sort_order" label="显示顺序"><InputNumber min={0} max={10000} /></Form.Item>
      </Form>
    </Modal>
  </PageContainer>;
}
