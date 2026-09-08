import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Form, Input, Select, Button, Typography, message, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { courseAPI } from '../../api';

const { Title } = Typography;

export default function CourseForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit) {
      courseAPI.detail(id).then((res) => form.setFieldsValue(res.course)).catch(() => message.error('加载失败'));
    }
  }, [id, form, isEdit]);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      if (isEdit) {
        await courseAPI.update(id, values);
        message.success('课程更新成功');
      } else {
        await courseAPI.create(values);
        message.success('课程创建成功');
      }
      navigate('/courses');
    } catch { /* handled */ }
    finally { setLoading(false); }
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/courses')}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>{isEdit ? '编辑课程' : '创建课程'}</Title>
      </Space>
      <Card>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="title" label="课程名称" rules={[{ required: true, message: '请输入课程名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="theme" label="主题"><Input placeholder="如：航空航天、人工智能" /></Form.Item>
          <Form.Item name="description" label="课程描述"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="driving_question" label="驱动问题"><Input placeholder="如：如何在月球建立人类基地？" /></Form.Item>
          <Form.Item name="story_line" label="故事线"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="grade_level" label="适用学段" rules={[{ required: true }]}>
            <Select options={[
              { label: '小学', value: 'primary' }, { label: '初中', value: 'junior' }, { label: '高中', value: 'senior' },
            ]} />
          </Form.Item>
          <Form.Item name="difficulty" label="难度等级" rules={[{ required: true }]}>
            <Select options={[
              { label: '基础', value: 'basic' }, { label: '进阶', value: 'advanced' }, { label: '挑战', value: 'challenge' },
            ]} />
          </Form.Item>
          <Form.Item name="total_hours" label="总课时"><Input type="number" placeholder="小时" /></Form.Item>
          <Form.Item name="materials_needed" label="所需材料"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={[
              { label: '草稿', value: 'draft' }, { label: '已发布', value: 'published' }, { label: '已归档', value: 'archived' },
            ]} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>{isEdit ? '保存修改' : '创建课程'}</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
