import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Form, Input, Select, Upload, Button, Typography, message, Space } from 'antd';
import { UploadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { workAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';

const { Title } = Typography;

export default function WorkUpload() {
  const {user}=useAuth();
  const [query]=useSearchParams();
  return <WorkUploadPage key={`${user?.id}:${query.toString()}`} />;
}

function WorkUploadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState([]);
  const [file, setFile] = useState(null);
  const lifecycle=useRef({epoch:0});
  const pending=useRef(false);
  useEffect(()=>{const scope=lifecycle.current;scope.epoch++;return ()=>{scope.epoch++;};},[]);

  useEffect(() => {
    let active=true;
    if (user?.role !== 'admin') {
      workAPI.uploadOptions().then((res) => {
        if(!active) return;
        const opts = res.enrollments || res.courseOptions || [];
        setCourses(opts.map((c) => ({ label: c.course_title, value: c.enrollment_id || c.course_id })));
        if (searchParams.get('enrollment_id')) form.setFieldValue('enrollment_id', Number(searchParams.get('enrollment_id')));
      }).catch(() => {});
    }
    return ()=>{active=false;};
  }, [form, searchParams, user?.role]);

  const onFinish = async (values) => {
    if(pending.current) return;
    if (!values.description?.trim() && !file) {
      message.error('请填写成果内容或选择文件');
      return;
    }
    const scope=lifecycle.current,epoch=scope.epoch,page=window.location.pathname+window.location.search;
    // 路由地址可先于 Suspense 中旧页面卸载变化，不能只依赖 effect cleanup。
    const current=()=>epoch===scope.epoch && page===window.location.pathname+window.location.search;
    pending.current=true;setLoading(true);
    try {
      const formData = new FormData();
      if (file) formData.append('file', file);
      formData.append('title', values.title);
      formData.append('description', values.description || '');
      formData.append('enrollment_id', values.enrollment_id || '');
      formData.append('task_id', searchParams.get('task_id') || '');
      formData.append('parent_work_id', searchParams.get('parent_work_id') || '');
      await workAPI.upload(formData);
      if(!current()) return;
      message.success('作品上传成功');
      navigate('/works');
    } catch { /* handled */ }
    finally { pending.current=false;if(current()) setLoading(false); }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/works')}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>📤 上传作品</Title>
      </Space>
      <Card>
        <Form form={form} layout="vertical" onFinish={onFinish} disabled={loading}>
          <Form.Item name="title" label="作品名称" rules={[{ required: true, message: '请输入作品名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="成果内容（文字或附件至少填写一种）"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="enrollment_id" label="关联课程">
            <Select placeholder="选择课程" options={courses} />
          </Form.Item>
          <Form.Item label="上传文件（可选）">
            <Upload beforeUpload={(f) => { setFile(f); return false; }} maxCount={1} onRemove={() => setFile(null)}>
              <Button icon={<UploadOutlined />}>选择文件</Button>
            </Upload>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>提交作品</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
