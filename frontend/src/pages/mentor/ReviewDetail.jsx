import {copyText as siteText, copyTemplate as siteTemplate} from '../../content/copy';
import {ReflectionFields} from '../../student/ArchiveRecords';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Alert, Button, Card, Collapse, Descriptions, Form, Input, InputNumber,
  Modal, Progress, Space, Table, Tag, Typography, message,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { mentorReviewAPI } from '../../api';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';
import ReportHistory from '../../components/common/ReportHistory';
import { exerciseAnswer } from '../../utils/exerciseAnswer';
import { returnContext } from '../../utils/returnContext';

function AnswerFeedback({ exercise, reportId, readOnly }) {
  const [content, setContent] = useState(exercise.feedback?.content || '');
  const [saving, setSaving] = useState(false);
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Typography.Text strong>{exercise.prompt}</Typography.Text>
    {(exercise.options || []).length > 0 && <Typography.Paragraph>选项：{exercise.options.map((o) => typeof o === 'object' ? `${o.value ?? o.key}：${o.label ?? o.text}` : o).join('；')}</Typography.Paragraph>}
    <Typography.Text>学生答案：{exerciseAnswer(exercise.student_answer, exercise.options)}</Typography.Text>
    <Typography.Text>参考答案：{exerciseAnswer(exercise.reference_answer, exercise.options)}</Typography.Text>
    <Typography.Paragraph>详解：{exercise.explanation}</Typography.Paragraph>
    {exercise.rubric && <Typography.Paragraph>评价要点：{exercise.rubric}</Typography.Paragraph>}
    <Tag>{!exercise.attempted ? '未作答' : exercise.question_type === 'short_answer' ? '简答：不自动判对错' : exercise.correct === 1 ? '正确' : '不正确'}</Tag>
    <Input.TextArea disabled={readOnly || !exercise.attempted} value={content} onChange={(e) => setContent(e.target.value)} rows={2} maxLength={5000} placeholder="填写逐题反馈（学生可见）" />
    {!readOnly && <Button loading={saving} disabled={!content.trim() || !exercise.attempted} onClick={async () => {
      setSaving(true); try { await mentorReviewAPI.feedback(reportId, exercise.id, content); message.success('反馈已保存'); }
      finally { setSaving(false); }
    }}>保存反馈</Button>}
  </Space>;
}

const dimensions = [
  ['knowledge_understanding', siteText("site.8b310548b22c624b")],
  ['problem_analysis', siteText("site.9603aab650dcabfc")],
  ['practical_application', siteText("site.fd4fcc0eeeadf290")],
  ['reflection_expression', siteText("site.e5e4562ec821dc2b")],
];

export default function ReviewDetail() {
  const { reportId } = useParams();
  const navigate=useNavigate(),location=useLocation(),sequence=useRef(0);
  const queueReturn=returnContext(location.state?.returnTo || location.state?.queueReturn, '/mentor/reviews');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const load = async () => {
    const ticket=++sequence.current;setLoading(true);setError('');setData(null);
    try {const result=await mentorReviewAPI.detail(reportId);if(ticket===sequence.current)setData(result);}
    catch(err){if(ticket===sequence.current)setError(err?.response?.data?.error||siteText("site.d45f7e01a58c637e"));}
    finally{if(ticket===sequence.current)setLoading(false);}
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load();return()=>{sequence.current++;Modal.destroyAll();}; }, [reportId]);

  const review = async (status) => {
    if(!data||data.report.id!==Number(reportId)||loading||data.read_only)return;const ticket=sequence.current;
    const values = await form.validateFields(['score', 'comment', 'dimensions']);
    if (status === 'rejected' && !values.comment?.trim()) return message.warning(siteText("site.58f041e733c2002d"));
    Modal.confirm({
      title: status === 'approved' ? siteText("site.869aec222b9107ed") : siteText("site.ffedc448a6b1bec1"),
      content: siteTemplate("site.806761112dc6ee0e", {slot0: (data.student.real_name), slot1: (data.lesson.title), slot2: (values.score)}),
      onOk: async () => {
        if(ticket!==sequence.current)throw new Error('页面已切换，请重新确认评审对象');
        setSubmitting(true);
        try {
          await mentorReviewAPI.review(reportId, { status, comment: values.comment, score: values.score, dimensions: values.dimensions });
          if(ticket===sequence.current){message.success(siteText("site.e7740768d7a65239")); await load();}
        } finally { if(ticket===sequence.current)setSubmitting(false); }
      },
    });
  };

  if (!data||data.report.id!==Number(reportId)) return <PageContainer title={siteText("site.e6893badb42bf4e0")}><AsyncPageState loading={loading} error={error} onRetry={load}><span /></AsyncPageState></PageContainer>;
  const { report, reflection, cards, progress } = data;
  const dimensionItems = dimensions.map(([key, label]) => ({ key, label, children: report.score_dimensions?.[key] === undefined ? '-' : siteTemplate("site.27a3004adf4f8669", {slot0: (report.score_dimensions[key])}) }));

  return <PageContainer
    title={`${data.student.real_name} · ${data.lesson.title}`}
    description={`${data.course.title} · 学习报告第 ${report.version} 版 · ${report.status === 'submitted' ? '待评审' : report.status === 'approved' ? '已通过' : '需修改'}`}
    extra={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate(queueReturn)}>返回评审队列</Button>}
  >
    {data.replacement&&<Alert type="warning" title="此旧报告仅保留历史，不再评审" description="学生完成补学并提交新版报告后，请评审新版。"/>}<div className="mentor-review-layout">
      <div>
        <Card className="content-card" title={siteText("site.d0a14bf38d967f42")} style={{ marginBottom: 16 }}><Descriptions column={1} bordered size="small">
          <Descriptions.Item label={siteText("site.fe885b9c3b0a779f")}>{report.summary}</Descriptions.Item>
          <Descriptions.Item label={siteText("site.5820acd0ba97b640")}>{report.key_points || '-'}</Descriptions.Item>
          <Descriptions.Item label={siteText("site.0754b0e16f1d0309")}>{report.application || '-'}</Descriptions.Item>
          <Descriptions.Item label={siteText("site.5b29b18b40d6b61a")}>{report.difficulties || '-'}</Descriptions.Item>
          <Descriptions.Item label={siteText("site.824021374595d011")}>{report.next_plan || '-'}</Descriptions.Item>
        </Descriptions></Card>
        <ReportHistory history={data.history} reportId={report.id} onView={(id) => navigate(`/mentor/reviews/${id}`, {state: {returnTo:queueReturn}})} />
        <Card className="content-card" title="反思记录" style={{ marginBottom: 16 }}>{reflection?.reflection_version===2?<ReflectionFields reflection={reflection}/>:<Descriptions column={1} size="small">
          <Descriptions.Item label="遇到的困难">{reflection?.difficulty || '-'}</Descriptions.Item>
          <Descriptions.Item label="解决方式">{reflection?.solution || '-'}</Descriptions.Item>
          <Descriptions.Item label="可以改进之处">{reflection?.improvement || '-'}</Descriptions.Item>
          <Descriptions.Item label="新的问题">{reflection?.new_question || '-'}</Descriptions.Item>
        </Descriptions>}</Card>
        <Card className="content-card" title="知识学习证据"><Table size="small" pagination={false} rowKey="id" dataSource={cards} expandable={{ expandedRowRender: (c) => <Space direction="vertical" style={{ width: '100%' }}>{c.exercises.map((e) => <Card key={e.id} size="small"><AnswerFeedback exercise={e} reportId={report.id} readOnly={data.read_only || data.history[0]?.id !== report.id} /></Card>)}</Space> }} columns={[
          { title: '知识卡片', dataIndex: 'title' },
          { title: '状态', render: (_, row) => <Tag color={row.completed_at ? 'green' : 'default'}>{row.completed_at ? '已完成' : '未完成'}</Tag> },
          { title: '客观题得分', dataIndex: 'best_score', render: (value) => value === null ? '无自动评分题' : `${value} 分` },
          { title: '作答次数', dataIndex: 'attempt_count' },
        ]} /></Card>
      </div>

      <aside className="mentor-review-aside">
        <Card className="content-card" title={siteText("site.dfc40202fe68dbc0")} style={{ marginBottom: 16 }}><Progress type="circle" percent={progress.percent || 0} /><Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>{siteText("site.ca9c60a993722867")}</Typography.Paragraph></Card>
        {report.status === 'submitted' && !data.read_only ? <Card className="content-card" title={siteText("site.a486b98a9daf6c05")}>
          <Form form={form} layout="vertical">
            <Form.Item name="score" label={siteText("site.1aa2ecc1e57c07cf")} rules={[{ required: true, message: siteText("site.3c523a18c4a7635b") }, { type: 'number', min: 0, max: 100 }]}><InputNumber min={0} max={100} precision={0} addonAfter={siteText("site.8a347b2b332813f5")} style={{ width: '100%' }} /></Form.Item>
            <Collapse ghost items={[{ key: 'dimensions', label: siteText("site.84f1cf54e14f87c2"), children: <>{dimensions.map(([key, label]) => <Form.Item key={key} name={['dimensions', key]} label={label} rules={[{ type: 'number', min: 0, max: 100 }]}><InputNumber min={0} max={100} precision={0} addonAfter={siteText("site.8a347b2b332813f5")} style={{ width: '100%' }} /></Form.Item>)}</> }]} />
            <Form.Item name="comment" label={siteText("site.980050611b8a1567")}><Input.TextArea rows={5} maxLength={5000} showCount placeholder={siteText("site.0ac9b9a8a391207a")} /></Form.Item>
            <Space direction="vertical" style={{ width: '100%' }}><Button block type="primary" loading={submitting} onClick={() => review('approved')}>{siteText("site.f2e5aaa39d3ad41e")}</Button><Button block danger loading={submitting} onClick={() => review('rejected')}>{siteText("site.38fc6d58c53b7b27")}</Button></Space>
          </Form>
        </Card> : <Card className="content-card" title={siteText("site.c6321b674a914475")}>
          <Alert type={report.status === 'approved' ? 'success' : 'warning'} showIcon message={`${report.status === 'approved' ? siteText("site.93cd797fbf2af309") : siteText("site.b6e5971ed05fd1cb")} · ${Number.isInteger(report.score) ? `${report.score} 分` : siteText("site.5e53e44a66a97b5e")}`} description={report.review_comment} />
          {report.score_dimensions && <Descriptions column={1} size="small" items={dimensionItems} style={{ marginTop: 16 }} />}
        </Card>}
      </aside>
    </div>
  </PageContainer>;
}
