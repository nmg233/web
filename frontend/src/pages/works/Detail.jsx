import {copyText as siteText, copyTemplate as siteTemplate} from "../../content/copy";
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Space, Typography, Spin, Input, message, Form, Select } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import { workAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import { formatBeijingTime } from '../../utils/date';
import StudentWorkDetail from '../../student/StudentWorkDetail';

const { Title } = Typography;
const dimensions = [['problem_discovery', '问题发现'], ['solution_design', '方案设计'], ['hands_on', '动手操作'], ['data_analysis', '数据分析'], ['presentation', '表达展示']];

function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined) return siteText("site.eee4970f985f6ddd");
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getFileType(work) {
  const name = work.file_name || '';
  const extension = name.includes('.') ? name.split('.').pop().toUpperCase() : '';
  return extension || work.file_type || siteText("site.eee4970f985f6ddd");
}

export default function WorkDetail() {
  const { user } = useAuth();
  const { id } = useParams();
  return user?.role === 'student' ? <StudentWorkDetail key={id} /> : <StaffWorkDetail />;
}

function StaffWorkDetail() {
  const { id } = useParams(); const { user } = useAuth(); const navigate = useNavigate();
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true);
  useEffect(() => { workAPI.detail(id).then(setData).catch(() => message.error(siteText("site.b2d3e10a9e08121b"))).finally(() => setLoading(false)); }, [id]);
  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!data?.work) return <p>{siteText("site.3b587396cd3f4222")}</p>;
  const { work, review, versions = [] } = data;
  const isOwner = work.student_id === user?.id;
  const canReview = ['admin', 'academic_mentor'].includes(user?.role);
  const statusText = work.review_status === 'rejected' && work.has_newer_version ? siteText("site.635c2c39c079e914") : work.review_status === 'pending' ? siteText("site.347651bf49604b8b") : work.review_status === 'approved' ? siteText("site.e8d21f248500af2d") : siteText("site.1749b70547a94071");
  const download = async () => {
    try {
      const blob = await workAPI.download(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = work.file_name || siteText("site.1b2793e919aad93b");
      anchor.click();
      URL.revokeObjectURL(url);
    } catch { /* handled */ }
  };
  return <div><Space style={{ marginBottom: 16 }}><Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/works')}>{siteText("site.718d38eb99f9cdcb")}</Button><Title level={4} style={{ margin: 0 }}>{work.title}</Title></Space><Card>
    <Descriptions column={2} bordered size="small"><Descriptions.Item label={siteText("site.a92c71100db6a50d")}>{work.student_name}</Descriptions.Item><Descriptions.Item label={siteText("site.e0229095c967f723")}>{work.course_title || '—'} / {work.task_title || '—'}</Descriptions.Item><Descriptions.Item label={siteText("site.057765eb9eea3856")}><Tag color={work.review_status === 'approved' ? 'green' : work.review_status === 'rejected' && !work.has_newer_version ? 'red' : work.has_newer_version ? 'blue' : 'orange'}>{statusText}</Tag></Descriptions.Item><Descriptions.Item label={siteText("site.f3871c9c12b1278c")}>{formatBeijingTime(work.created_at)}</Descriptions.Item><Descriptions.Item label={siteText("site.0fb39b9e1cfcd330")}>{siteText("site.c2690da31a9d3aa5")}{work.version || 1}{siteText("site.0c829506b69d60cd")}</Descriptions.Item><Descriptions.Item label={siteText("site.5fa3bde7e7416f41")}><Select value={Number(id)} onChange={(value) => navigate(`/works/${value}`)} style={{ width: 180 }} options={versions.map((v) => ({ value: v.id, label: siteTemplate("site.560fe442d6315b41", {slot0: (v.version || 1)}) }))} /></Descriptions.Item></Descriptions>
    {work.description && <p style={{ marginTop: 12 }}>{work.description}</p>}{work.has_file && <Card title={siteText("site.11996ba740913dbe")} size="small" style={{ marginTop: 12 }}><Descriptions size="small" column={3}><Descriptions.Item label={siteText("site.2fdae812fda21eb8")}>{work.file_name || siteText("site.11996ba740913dbe")}</Descriptions.Item><Descriptions.Item label={siteText("site.7f8086bd36283d6d")}>{getFileType(work)}</Descriptions.Item><Descriptions.Item label={siteText("site.8803ce62fed4c104")}>{formatFileSize(work.file_size)}</Descriptions.Item></Descriptions><Button type="primary" icon={<DownloadOutlined />} onClick={download}>{siteText("site.3020165042e50087")}</Button></Card>}
    {review && <Card title={siteText("site.34daa66e72549960")} size="small" style={{ marginTop: 16 }}><p>{review.comment || siteText("site.5dda1653288bd7ff")}</p><p>{siteText("site.eaf776f04b44c4e0")}{review.suggestion || siteText("site.6838c20c96d73576")}</p>{work.review_status === 'approved' && <Space wrap>{dimensions.map(([key, label]) => <Tag key={key} color="blue">{label} {review[key]}{siteText("site.01e4f050a5a9b849")}</Tag>)}</Space>}</Card>}
    {isOwner && work.review_status === 'rejected' && !work.has_newer_version && <Button type="primary" style={{ marginTop: 16 }} onClick={() => navigate(`/works/upload?parent_work_id=${work.id}&task_id=${work.task_id || ''}&enrollment_id=${work.enrollment_id || ''}`)}>{siteText("site.1f7136bfbea0562e")}</Button>}
    {canReview && work.review_status === 'pending' && <ReviewForm id={id} setData={setData} />}
  </Card></div>;
}

function ReviewForm({ id, setData }) {
  const [form] = Form.useForm();
  const status = Form.useWatch('status', form) || 'approved';
  return <Card title={siteText("site.61985239e354ea65")} size="small" style={{ marginTop: 16 }}><Form form={form} layout="vertical" initialValues={{ status: 'approved' }} onFinish={async (values) => { await workAPI.review(id, values); message.success(siteText("site.c45c3ccc5d2087d1")); setData(await workAPI.detail(id)); }}><Form.Item name="status" label={siteText("site.e072680f03f63a28")}><Select options={[{ value: 'approved', label: siteText("site.2714f819002376a9") }, { value: 'rejected', label: siteText("site.0426d92748ff7ed0") }]} /></Form.Item><Form.Item name="comment" label={siteText("site.e82aef598238ed80")}><Input.TextArea rows={2} /></Form.Item><Form.Item name="suggestion" label={siteText("site.2d8552c89a3c2c2b")}><Input.TextArea rows={2} /></Form.Item>{status === 'approved' && <Space wrap>{dimensions.map(([key, label]) => <Form.Item key={key} name={key} label={label} rules={[{ required: true, message: siteText("site.3ddbe861e4dae938") }]}><Select style={{ width: 120 }} options={[1,2,3,4,5].map((v) => ({ value: v, label: siteTemplate("site.3908e816c746d0ae", {slot0: (v)}) }))} /></Form.Item>)}</Space>}<Button type="primary" htmlType="submit">{siteText("site.7cce025e82a20cb3")}</Button></Form></Card>;
}
