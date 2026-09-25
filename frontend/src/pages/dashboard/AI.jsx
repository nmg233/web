import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Alert, Card, Input, Button, Select, Typography, Space, Spin, message } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { aiAPI, courseAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';

const { Title, Text } = Typography;

export default function AIAssistant() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => {
    aiAPI.getCourses().then((res) => {
      setCourses(res.courses || []);
      setEnabled(Boolean(res.enabled));
      const requested = Number(params.get('course_id'));
      if (res.courses?.some((course) => course.id === requested)) setCourseId(requested);
    }).catch(() => setLoadError('无法加载可提问课程，请刷新页面重试。'));
  }, [params]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  const downloadSource = async (source) => {
    try {
      const blob = await courseAPI.downloadResource(source.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = source.title || '课程资料';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch { message.error('下载资料失败'); }
  };

  const handleAsk = async () => {
    const value = question.trim();
    if (!value || loading) return;
    if (!courseId) { message.warning('请先选择一门课程'); return; }
    setLoading(true);
    setQuestion('');
    setChat((prev) => [...prev, { role: 'user', content: value }]);
    try {
      const res = await aiAPI.ask(value, courseId);
      setChat((prev) => [...prev, { role: 'ai', content: res.answer, sources: res.sources || [] }]);
    } catch (err) {
      setChat((prev) => [...prev, { role: 'ai', content: err?.response?.data?.error || '抱歉，灵境小智暂时遇到了问题。' }]);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ maxWidth: 850, margin: '0 auto' }}>
      <Title level={4}>🤖 灵境小智</Title>
      <Text type="secondary">请选择课程，询问课程知识、任务或相关专业问题。课程规定以实际资料为准。</Text>
      {loadError && <Alert type="error" showIcon message={loadError} style={{ marginTop: 12 }} />}
      {!enabled && <Alert type="info" showIcon message="灵境小智暂未启用，请联系管理员。" style={{ marginTop: 12 }} />}
      {user?.role === 'admin' && <div style={{ marginTop: 8 }}><Link to="/dashboard/ai/settings">管理员 AI 配置</Link></div>}
      <Card style={{ marginTop: 16, height: 440, overflow: 'auto' }}>
        {chat.length === 0 && <div style={{ textAlign: 'center', color: '#999', marginTop: 120 }}>
          <RobotOutlined style={{ fontSize: 48 }} />
          <p>你好！选好课程后，就可以开始提问。</p>
        </div>}
        {chat.map((item, i) => <div key={i} style={{ marginBottom: 18, display: 'flex', gap: 8, justifyContent: item.role === 'user' ? 'flex-end' : 'flex-start' }}>
          {item.role === 'ai' && <RobotOutlined style={{ fontSize: 20, color: '#1a73e8' }} />}
          <div style={{ maxWidth: '78%', padding: '8px 14px', borderRadius: 12, background: item.role === 'user' ? '#1a73e8' : '#f0f2f5', color: item.role === 'user' ? '#fff' : '#333', whiteSpace: 'pre-wrap' }}>
            {item.content}
            {item.sources?.length > 0 && <div style={{ marginTop: 12, borderTop: '1px solid #d9d9d9', paddingTop: 8 }}>
              <Text strong>参考资料</Text>
              {item.sources.map((source) => <div key={source.ref}>
                <Text type="secondary">[{source.ref}] {source.title} · {source.locator} </Text>
                {source.type === 'resource' ? <Button type="link" size="small" onClick={() => downloadSource(source)}>下载</Button>
                  : source.type === 'task' ? <Link to={`/tasks/${source.id}`}>查看</Link>
                    : <Link to={`/courses/${courseId}`}>查看课程</Link>}
              </div>)}
            </div>}
          </div>
          {item.role === 'user' && <UserOutlined style={{ fontSize: 20, color: '#1a73e8' }} />}
        </div>)}
        {loading && <Spin />}
        <div ref={chatEndRef} />
      </Card>
      <Space.Compact style={{ width: '100%', marginTop: 12 }}>
        <Select style={{ width: 230 }} placeholder="选择课程（必选）" value={courseId}
          onChange={(id) => { setCourseId(id); setChat([]); }}
          options={courses.map((course) => ({ label: course.title, value: course.id }))} />
        <Input placeholder="输入与当前课程相关的问题" maxLength={1000} value={question}
          disabled={!enabled || !courseId} onChange={(event) => setQuestion(event.target.value)} onPressEnter={handleAsk} />
        <Button type="primary" icon={<SendOutlined />} onClick={handleAsk} loading={loading} disabled={!enabled || !courseId}>发送</Button>
      </Space.Compact>
    </div>
  );
}
