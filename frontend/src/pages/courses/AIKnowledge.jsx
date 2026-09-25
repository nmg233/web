import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, Popconfirm, Space, Switch, Table, Tag, Typography, Upload, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { aiAPI, courseAPI } from '../../api';

const { Title, Paragraph } = Typography;
const labels = { not_added: '未加入', pending: '等待解析', processing: '解析中', ready: '可检索', failed: '解析失败', unsupported: '格式不支持' };

export default function AIKnowledge() {
  const { courseId } = useParams();
  const [documents, setDocuments] = useState([]);
  const [courseTitle, setCourseTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const [docs, course] = await Promise.all([aiAPI.getDocuments(courseId), courseAPI.detail(courseId)]);
      setDocuments(docs.documents || []);
      setCourseTitle(course.course?.title || '课程');
      setError('');
    } catch (err) { setError(err?.response?.data?.error || '无法读取课程资料'); }
  }, [courseId]);

  // 与项目内其他异步页面一致：页面进入后读取服务端数据。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!documents.some((row) => ['pending', 'processing'].includes(row.status))) return undefined;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [documents, load]);

  const upload = async (file) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('title', file.name);
      form.append('resource_type', 'courseware');
      await courseAPI.uploadResource(courseId, form);
      message.success('资料已上传，正在解析');
      await load();
    } catch (err) { message.error(err?.response?.data?.error || '上传失败'); }
    finally { setUploading(false); }
    return false;
  };

  const retry = async (resourceId) => {
    try { await aiAPI.indexResource(resourceId); await load(); }
    catch (err) { message.error(err?.response?.data?.error || '重试失败'); }
  };
  const toggle = async (row, enabled) => {
    try { await aiAPI.setDocumentEnabled(row.document_id, enabled); await load(); }
    catch (err) { message.error(err?.response?.data?.error || '操作失败'); }
  };
  const remove = async (row) => {
    try { await courseAPI.deleteResource(row.resource_id); message.success('课程资料已删除'); await load(); }
    catch (err) { message.error(err?.response?.data?.error || '删除失败'); }
  };

  return <div>
    <Space><Title level={4}>课程知识库 · {courseTitle}</Title><Link to={`/courses/${courseId}`}>返回课程</Link></Space>
    <Paragraph>这里复用课程资源。PDF、DOCX、PPTX、TXT 中可提取的文字会加入当前课程知识库。旧版 DOC/PPT 请先转换为 DOCX/PPTX；扫描版 PDF 请先进行 OCR 后再上传。图片、视频等仍可作为课程资源，但不会进入文字检索。</Paragraph>
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
    <Card>
      <Upload accept=".pdf,.docx,.pptx,.txt" showUploadList={false} beforeUpload={upload} disabled={uploading}>
        <Button icon={<UploadOutlined />} loading={uploading}>上传课程资料（≤50 MB）</Button>
      </Upload>
      <Table rowKey="resource_id" dataSource={documents} style={{ marginTop: 16 }} pagination={{ pageSize: 10 }}
        columns={[
          { title: '文件', dataIndex: 'title', render: (value, row) => <span>{value} <Tag>{row.extension}</Tag></span> },
          { title: '上传时间', dataIndex: 'created_at' },
          { title: '处理状态', render: (_, row) => <span><Tag color={row.status === 'ready' ? 'green' : row.status === 'failed' ? 'red' : 'default'}>{labels[row.status]}</Tag>{row.error_message || row.hint || ''}{row.status === 'ready' && `（${row.chunk_count} 段）`}</span> },
          { title: '检索', render: (_, row) => row.document_id && row.status !== 'unsupported' ? <Switch checked={Boolean(row.enabled)} onChange={(value) => toggle(row, value)} /> : '—' },
          { title: '操作', render: (_, row) => <Space>
            {['not_added', 'failed'].includes(row.status) && !row.hint && <Button size="small" onClick={() => retry(row.resource_id)}>{row.status === 'failed' ? '重试' : '加入知识库'}</Button>}
            <Popconfirm title="删除这份课程资源及其知识库内容？" onConfirm={() => remove(row)}><Button size="small" danger>删除文件</Button></Popconfirm>
          </Space> },
        ]} />
    </Card>
  </div>;
}
