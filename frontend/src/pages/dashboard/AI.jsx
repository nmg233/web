import { useState, useEffect, useRef } from 'react';
import { Card, Input, Button, Select, Typography, Space, Spin } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { aiAPI } from '../../api';

const { Title, Text } = Typography;

export default function AIAssistant() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState(null);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    aiAPI.getCourses().then((res) => setCourses(res.courses || [])).catch(() => {});
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  const handleAsk = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setChat((prev) => [...prev, { role: 'user', content: question }]);
    try {
      const res = await aiAPI.ask(question, courseId);
      setChat((prev) => [...prev, { role: 'ai', content: res.answer }]);
    } catch {
      setChat((prev) => [...prev, { role: 'ai', content: '抱歉，灵境小智暂时遇到了问题。' }]);
    } finally {
      setLoading(false);
      setQuestion('');
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Title level={4}>🤖 灵境小智</Title>
      <Text type="secondary">基于课程知识库的智能问答，选择课程可获得更精准的回答</Text>

      <Card style={{ marginTop: 16, height: 400, overflow: 'auto' }}>
        {chat.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', marginTop: 120 }}>
            <RobotOutlined style={{ fontSize: 48 }} />
            <p>你好！我是灵境小智，有什么问题尽管问我～</p>
          </div>
        )}
        {chat.map((msg, i) => (
          <div key={i} style={{ marginBottom: 16, display: 'flex', gap: 8, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {msg.role === 'ai' && <RobotOutlined style={{ fontSize: 20, color: '#1a73e8' }} />}
            <div style={{
              maxWidth: '70%', padding: '8px 14px', borderRadius: 12,
              background: msg.role === 'user' ? '#1a73e8' : '#f0f2f5',
              color: msg.role === 'user' ? '#fff' : '#333',
              whiteSpace: 'pre-wrap',
            }}>
              {msg.content}
            </div>
            {msg.role === 'user' && <UserOutlined style={{ fontSize: 20, color: '#1a73e8' }} />}
          </div>
        ))}
        {loading && <Spin />}
        <div ref={chatEndRef} />
      </Card>

      <Space.Compact style={{ width: '100%', marginTop: 12 }}>
        <Select
          style={{ width: 200 }} placeholder="选择课程（可选）" allowClear
          value={courseId} onChange={setCourseId}
          options={courses.map((c) => ({ label: c.title, value: c.id }))}
        />
        <Input
          placeholder="输入你的问题..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onPressEnter={handleAsk}
        />
        <Button type="primary" icon={<SendOutlined />} onClick={handleAsk} loading={loading}>发送</Button>
      </Space.Compact>
    </div>
  );
}
