import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Button, Card, Form, Input, InputNumber, Modal, Popconfirm,
  Select, Space, Switch, Tag, Typography, Tabs, message,
} from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { learningManageAPI } from '../../api';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';
import MarkdownContent from '../../components/common/MarkdownContent';

const blankCard = { status: 'draft', is_required: true, estimated_minutes: 10 };
const statusLabel = { draft: '草稿·学生不可见', published: '已发布', archived: '已归档' };
const typeLabel = { single_choice: '单选题', multiple_choice: '多选题', true_false: '判断题', fill_blank: '填空题', short_answer: '简答题' };

export default function LessonContentEditor() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const [cards, setCards] = useState([]);
  const [editing, setEditing] = useState(null);
  const [exerciseCard, setExerciseCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [cardForm] = Form.useForm();
  const [exerciseForm] = Form.useForm();
  const cardContent = Form.useWatch('content', cardForm);

  const load = async () => {
    setLoading(true); setError('');
    try { setCards((await learningManageAPI.cards(lessonId)).cards || []); }
    catch (err) { setError(err?.response?.data?.error || '无法加载课时内容'); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [lessonId]);

  const openCard = (card = blankCard) => {
    setEditing(card);
    cardForm.resetFields();
    cardForm.setFieldsValue({ ...card, is_required: Boolean(card.is_required) });
  };
  const saveCard = async (status) => {
    const values = await cardForm.validateFields();
    setSaving(true);
    try {
      const payload = { ...values, status };
      if (editing?.id) await learningManageAPI.updateCard(editing.id, payload);
      else await learningManageAPI.createCard(lessonId, payload);
      message.success(status === 'published' ? '知识卡片已发布，学生现在可以学习' : '知识卡片草稿已保存');
      setEditing(null); await load();
    } finally { setSaving(false); }
  };
  const publishCard = async (cardId) => {
    await learningManageAPI.updateCard(cardId, { status: 'published' });
    message.success('知识卡片已发布，学生现在可以学习');
    await load();
  };
  const saveExercise = async (values) => {
    const options = values.options_text ? values.options_text.split('\n').map((value) => value.trim()).filter(Boolean) : [];
    let answer = values.answer;
    if (values.question_type === 'multiple_choice') answer = String(answer).split(',').map((value) => value.trim()).filter(Boolean);
    if (values.question_type === 'true_false') answer = String(answer) === 'true';
    await learningManageAPI.createExercise(exerciseCard.id, { ...values, options, answer, max_attempts: 1 });
    message.success('练习已添加');
    setExerciseCard(null); await load();
  };

  return <PageContainer
    title="课时内容编辑"
    description="知识卡片默认保存为学生不可见的草稿；内容与答案详解确认后再发布。"
    extra={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/courses/${courseId}`)}>返回课程</Button>}
  >
    <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 16 }} onClick={() => openCard()}>新增知识卡片</Button>
    <AsyncPageState loading={loading} error={error} onRetry={load} empty={!cards.length} emptyText="尚未创建知识卡片">
      {cards.map((card, index) => <Card
        className="content-card"
        key={card.id}
        style={{ marginBottom: 16 }}
        title={<Space wrap><span>{index + 1}. {card.title}</span><Tag color={card.status === 'published' ? 'green' : 'default'}>{statusLabel[card.status] || card.status}</Tag>{card.is_required ? <Tag color="blue">必修</Tag> : <Tag>选修</Tag>}</Space>}
        extra={<Space wrap>
          {card.status === 'draft' && <Button type="primary" onClick={() => publishCard(card.id)}>发布给学生</Button>}
          <Button onClick={() => openCard(card)}>编辑</Button>
          <Button onClick={() => { setExerciseCard(card); exerciseForm.resetFields(); }}>添加练习</Button>
          <Popconfirm title="确认删除或归档该卡片？" onConfirm={async () => { await learningManageAPI.deleteCard(card.id); load(); }}><Button danger>删除</Button></Popconfirm>
        </Space>}
      >
        <Typography.Paragraph type="secondary">{card.summary || '暂无摘要'}</Typography.Paragraph>
        <MarkdownContent>{card.content}</MarkdownContent>
        {(card.exercises || []).length === 0
          ? <Alert type="warning" showIcon message="尚未配置配套练习" />
          : (card.exercises || []).map((exercise) => <Card size="small" key={exercise.id} style={{ marginTop: 8 }}><Space wrap><Tag>{typeLabel[exercise.question_type]}</Tag><span>{exercise.prompt}</span><Tag>一次作答</Tag><Popconfirm title="确认删除该练习？" onConfirm={async () => { await learningManageAPI.deleteExercise(exercise.id); load(); }}><Button type="link" danger>删除</Button></Popconfirm></Space></Card>)}
      </Card>)}
    </AsyncPageState>

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
        <Space wrap><Form.Item name="estimated_minutes" label="预计分钟"><InputNumber min={1} max={600} /></Form.Item><Form.Item name="is_required" label="必修" valuePropName="checked"><Switch /></Form.Item></Space>
        <Space style={{ display: 'flex', justifyContent: 'flex-end' }}><Button onClick={() => setEditing(null)}>取消</Button><Button loading={saving} onClick={() => saveCard('draft')}>保存草稿</Button><Button type="primary" loading={saving} onClick={() => saveCard('published')}>保存并发布</Button></Space>
      </Form>
    </Modal>

    <Modal open={Boolean(exerciseCard)} title={`添加练习 · ${exerciseCard?.title || ''}`} onCancel={() => setExerciseCard(null)} onOk={() => exerciseForm.submit()} destroyOnHidden>
      <Form form={exerciseForm} layout="vertical" initialValues={{ question_type: 'single_choice', points: 1, is_required: true }} onFinish={saveExercise}>
        <Alert type="info" showIcon message="每位学生每道题只有一次作答机会；提交后将立即看到标准答案详解。" style={{ marginBottom: 16 }} />
        <Form.Item name="question_type" label="题型" rules={[{ required: true }]}><Select options={Object.entries(typeLabel).map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item name="prompt" label="题目" rules={[{ required: true, message: '请填写题目' }]}><Input.TextArea /></Form.Item>
        <Form.Item name="options_text" label="选项（选择题每行一个）"><Input.TextArea /></Form.Item>
        <Form.Item name="answer" label="标准答案（多选用英文逗号分隔）" rules={[{ required: true, message: '请填写标准答案' }]}><Input /></Form.Item>
        <Form.Item name="explanation" label="答案详解" rules={[{ required: true, message: '请填写学生作答后看到的答案详解' }]}><Input.TextArea rows={4} showCount maxLength={5000} /></Form.Item>
      </Form>
    </Modal>
  </PageContainer>;
}
