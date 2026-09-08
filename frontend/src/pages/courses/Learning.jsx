import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Progress, Space, Typography, message } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { courseAPI } from '../../api';

const { Title, Paragraph } = Typography;

export default function Learning() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const detail = await courseAPI.detail(id);
      if (!cancelled) setData(detail);
    };
    load().catch(() => message.error('加载学习内容失败'));
    return () => { cancelled = true; };
  }, [id]);
  if (!data) return null;
  if (data.lessons.length === 0) {
    return <Card>
      <Space direction="vertical">
        <Title level={4}>课程暂无课时</Title>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/courses/${id}`)}>返回课程</Button>
      </Space>
    </Card>;
  }
  const lesson = data.lessons[active];
  const saveProgress = async (progress) => {
    await courseAPI.updateProgress(id, { lesson_id: lesson.id, progress, last_position: progress });
    const detail = await courseAPI.detail(id);
    setData(detail);
  };

  return <div>
    <Space style={{ marginBottom: 16 }}><Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/courses/${id}`)}>返回课程</Button><Title level={4} style={{ margin: 0 }}>学习：{data.course.title}</Title></Space>
    <Card style={{ marginBottom: 16 }}><Typography.Text>课程进度</Typography.Text><Progress percent={Number(data.progress)} /></Card>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 260px) 1fr', gap: 16 }}>
      <Card title="章节目录" size="small">
        {data.lessons.map((item, index) => <Button key={item.id} type={index === active ? 'primary' : 'text'} block style={{ textAlign: 'left', marginBottom: 6 }} onClick={() => setActive(index)}>
          {item.progress === 100 && <CheckCircleOutlined />} {index + 1}. {item.title}
        </Button>)}
      </Card>
      <Card title={lesson.title}>
        <Paragraph>{lesson.description || '本章节暂无文字说明，请结合课程资源完成学习。'}</Paragraph>
        <Button type="primary" onClick={() => saveProgress(100)}>标记本章节完成</Button>
      </Card>
    </div>
  </div>;
}
