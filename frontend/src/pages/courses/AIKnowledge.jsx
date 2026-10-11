import {copyText as siteText, copyTemplate as siteTemplate} from "../../content/copy";
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, Popconfirm, Space, Switch, Table, Tag, Typography, Upload, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { aiAPI, courseAPI } from '../../api';

const { Title, Paragraph } = Typography;
const labels = { not_added: siteText("site.8febdd62c7762643"), pending: siteText("site.99e17c41fd5d5283"), processing: siteText("site.3b202b47a2209934"), ready: siteText("site.8309f1772ea04c86"), failed: siteText("site.7f02ceccea8b3c12"), unsupported: siteText("site.528715502c21fed6") };

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
      setCourseTitle(course.course?.title || siteText("site.4fce977f48aab66e"));
      setError('');
    } catch (err) { setError(err?.response?.data?.error || siteText("site.4b9e77286ccac57e")); }
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
      message.success(siteText("site.cf066a09f1317ecc"));
      await load();
    } catch (err) { message.error(err?.response?.data?.error || siteText("site.dcd892b84d4ea7c6")); }
    finally { setUploading(false); }
    return false;
  };

  const retry = async (resourceId) => {
    try { await aiAPI.indexResource(resourceId); await load(); }
    catch (err) { message.error(err?.response?.data?.error || siteText("site.72b30f0ded4a7f5a")); }
  };
  const toggle = async (row, enabled) => {
    try { await aiAPI.setDocumentEnabled(row.document_id, enabled); await load(); }
    catch (err) { message.error(err?.response?.data?.error || siteText("site.1cb681a2ca428313")); }
  };
  const remove = async (row) => {
    try { await courseAPI.deleteResource(row.resource_id); message.success(siteText("site.fa58f90b5e77b431")); await load(); }
    catch (err) { message.error(err?.response?.data?.error || siteText("site.32be8b1c44634c7a")); }
  };

  return <div>
    <Space><Title level={4}>{siteText("site.cb11d2dc3d703ce8")}{courseTitle}</Title><Link to={`/courses/${courseId}`}>{siteText("site.788bbf8ea2451fb8")}</Link></Space>
    <Paragraph>{siteText("site.bf32306bc4c53932")}</Paragraph>
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
    <Card>
      <Upload accept=".pdf,.docx,.pptx,.txt" showUploadList={false} beforeUpload={upload} disabled={uploading}>
        <Button icon={<UploadOutlined />} loading={uploading}>{siteText("site.748422ebc3db96cf")}</Button>
      </Upload>
      <Table rowKey="resource_id" dataSource={documents} style={{ marginTop: 16 }} pagination={{ pageSize: 10 }}
        columns={[
          { title: siteText("site.17c4c43f4cd66a97"), dataIndex: 'title', render: (value, row) => <span>{value} <Tag>{row.extension}</Tag></span> },
          { title: siteText("site.aad7b00be81cbef7"), dataIndex: 'created_at' },
          { title: siteText("site.d30d8b7574787fd7"), render: (_, row) => <span><Tag color={row.status === 'ready' ? 'green' : row.status === 'failed' ? 'red' : 'default'}>{labels[row.status]}</Tag>{row.error_message || row.hint || ''}{row.status === 'ready' && siteTemplate("site.eb39e2819c65680e", {slot0: (row.chunk_count)})}</span> },
          { title: siteText("site.81b819e5ae66e4b3"), render: (_, row) => row.document_id && row.status !== 'unsupported' ? <Switch checked={Boolean(row.enabled)} onChange={(value) => toggle(row, value)} /> : '—' },
          { title: siteText("site.5d4fdf171c2b4cf8"), render: (_, row) => <Space>
            {['not_added', 'failed'].includes(row.status) && !row.hint && <Button size="small" onClick={() => retry(row.resource_id)}>{row.status === 'failed' ? siteText("site.ff8c9649e6e1fde9") : siteText("site.d9c391ffe468617c")}</Button>}
            <Popconfirm title={siteText("site.9e97686d4211d74a")} onConfirm={() => remove(row)}><Button size="small" danger>{siteText("site.58e9cfe8e28dd1ed")}</Button></Popconfirm>
          </Space> },
        ]} />
    </Card>
  </div>;
}
