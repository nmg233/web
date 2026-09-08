import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Space, Typography, Spin, Input, message, Form, Select } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import { workAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import { formatBeijingTime } from '../../utils/date';

const { Title } = Typography;
const dimensions = [['problem_discovery', '问题发现'], ['solution_design', '方案设计'], ['hands_on', '动手操作'], ['data_analysis', '数据分析'], ['presentation', '表达展示']];

function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined) return '未知';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getFileType(work) {
  const name = work.file_name || '';
  const extension = name.includes('.') ? name.split('.').pop().toUpperCase() : '';
  return extension || work.file_type || '未知';
}

export default function WorkDetail() {
  const { id } = useParams(); const { user } = useAuth(); const navigate = useNavigate();
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true);
  useEffect(() => { workAPI.detail(id).then(setData).catch(() => message.error('加载失败')).finally(() => setLoading(false)); }, [id]);
  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!data?.work) return <p>作品不存在</p>;
  const { work, review, versions = [] } = data;
  const isOwner = work.student_id === user?.id;
  const canReview = ['admin', 'academic_mentor'].includes(user?.role);
  const statusText = work.review_status === 'rejected' && work.has_newer_version ? '已修改' : work.review_status === 'pending' ? '待批改' : work.review_status === 'approved' ? '通过' : '需修改';
  const download = async () => {
    try {
      const blob = await workAPI.download(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = work.file_name || '作品附件';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch { /* handled */ }
  };
  return <div><Space style={{ marginBottom: 16 }}><Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/works')}>返回</Button><Title level={4} style={{ margin: 0 }}>{work.title}</Title></Space><Card>
    <Descriptions column={2} bordered size="small"><Descriptions.Item label="学生">{work.student_name}</Descriptions.Item><Descriptions.Item label="课程/任务">{work.course_title || '—'} / {work.task_title || '—'}</Descriptions.Item><Descriptions.Item label="状态"><Tag color={work.review_status === 'approved' ? 'green' : work.review_status === 'rejected' && !work.has_newer_version ? 'red' : work.has_newer_version ? 'blue' : 'orange'}>{statusText}</Tag></Descriptions.Item><Descriptions.Item label="提交时间">{formatBeijingTime(work.created_at)}</Descriptions.Item><Descriptions.Item label="版本">第 {work.version || 1} 版</Descriptions.Item><Descriptions.Item label="历史版本"><Select value={Number(id)} onChange={(value) => navigate(`/works/${value}`)} style={{ width: 180 }} options={versions.map((v) => ({ value: v.id, label: `第 ${v.version || 1} 版` }))} /></Descriptions.Item></Descriptions>
    {work.description && <p style={{ marginTop: 12 }}>{work.description}</p>}{work.has_file && <Card title="附件" size="small" style={{ marginTop: 12 }}><Descriptions size="small" column={3}><Descriptions.Item label="名称">{work.file_name || '附件'}</Descriptions.Item><Descriptions.Item label="类型">{getFileType(work)}</Descriptions.Item><Descriptions.Item label="大小">{formatFileSize(work.file_size)}</Descriptions.Item></Descriptions><Button type="primary" icon={<DownloadOutlined />} onClick={download}>下载附件</Button></Card>}
    {review && <Card title="教师批改" size="small" style={{ marginTop: 16 }}><p>{review.comment || '暂无评语'}</p><p>修改建议：{review.suggestion || '无'}</p>{work.review_status === 'approved' && <Space wrap>{dimensions.map(([key, label]) => <Tag key={key} color="blue">{label} {review[key]} 分</Tag>)}</Space>}</Card>}
    {isOwner && work.review_status === 'rejected' && !work.has_newer_version && <Button type="primary" style={{ marginTop: 16 }} onClick={() => navigate(`/works/upload?parent_work_id=${work.id}&task_id=${work.task_id || ''}&enrollment_id=${work.enrollment_id || ''}`)}>修改后重新提交</Button>}
    {canReview && work.review_status === 'pending' && <ReviewForm id={id} setData={setData} />}
  </Card></div>;
}

function ReviewForm({ id, setData }) {
  const [form] = Form.useForm();
  const status = Form.useWatch('status', form) || 'approved';
  return <Card title="作品批改" size="small" style={{ marginTop: 16 }}><Form form={form} layout="vertical" initialValues={{ status: 'approved' }} onFinish={async (values) => { await workAPI.review(id, values); message.success('批改已保存'); setData(await workAPI.detail(id)); }}><Form.Item name="status" label="批改结果"><Select options={[{ value: 'approved', label: '通过' }, { value: 'rejected', label: '需修改' }]} /></Form.Item><Form.Item name="comment" label="教师评语"><Input.TextArea rows={2} /></Form.Item><Form.Item name="suggestion" label="修改建议"><Input.TextArea rows={2} /></Form.Item>{status === 'approved' && <Space wrap>{dimensions.map(([key, label]) => <Form.Item key={key} name={key} label={label} rules={[{ required: true, message: '请选择评分' }]}><Select style={{ width: 120 }} options={[1,2,3,4,5].map((v) => ({ value: v, label: `${v} 分` }))} /></Form.Item>)}</Space>}<Button type="primary" htmlType="submit">保存批改</Button></Form></Card>;
}
