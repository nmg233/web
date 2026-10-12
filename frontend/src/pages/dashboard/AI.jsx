import {copyText as siteText} from "../../content/copy";
import StudentAssistant from '../../student/StudentAssistant';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Alert, Card, Input, Button, Select, Typography, Grid, Tag, Spin, message } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { aiAPI, courseAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import { STUDENT_COURSES_CHANGED } from '../../student/accessPolicy';

const { Title, Text } = Typography;

export default function AIAssistant() {
  const { user } = useAuth();
  return user?.role === 'student' ? <StudentAssistant /> : <LegacyAssistant />;
}

function LegacyAssistant() {
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
  const sequenceRef = useRef(0);
  const accessibleCoursesRef = useRef(null);
  const screens = Grid.useBreakpoint();

  useEffect(() => {
    if (user?.role !== 'student') return;
    const updateCourses = ({ detail }) => {
      accessibleCoursesRef.current = new Set(detail.courses.map((course) => String(course.id)));
      const removed = new Set(detail.removedCourseIds.map(String));
      setCourses((current) => current.filter((course) => !removed.has(String(course.id))));
      if (removed.has(String(courseId))) {
        sequenceRef.current += 1;
        setCourseId(null);
        setChat([]);
        setLoading(false);
        setLoadError(siteText("site.5410d8867dc1b996"));
      }
    };
    window.addEventListener(STUDENT_COURSES_CHANGED, updateCourses);
    return () => window.removeEventListener(STUDENT_COURSES_CHANGED, updateCourses);
  }, [courseId, user?.role]);

  useEffect(() => {
    let active = true;
    sequenceRef.current += 1;
    setChat([]);
    setCourseId(null);
    setLoading(false);
    setEnabled(false);
    setLoadError('');
    aiAPI.getCourses().then((res) => {
      if (!active) return;
      const available = (res.courses || []).filter((course) => !accessibleCoursesRef.current || accessibleCoursesRef.current.has(String(course.id)));
      setCourses(available);
      setEnabled(Boolean(res.enabled));
      const requested = Number(params.get('course_id'));
      if (available.some((course) => course.id === requested)) setCourseId(requested);
    }).catch(() => { if (active) setLoadError(siteText("site.a9e67309ae3963e9")); });
    return () => { active = false; sequenceRef.current += 1; };
  }, [params]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  const downloadSource = async (source) => {
    try {
      const blob = await courseAPI.downloadResource(source.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = source.title || siteText("site.9423f5405308f993");
      anchor.click();
      URL.revokeObjectURL(url);
    } catch { message.error(siteText("site.e6840afd0d80acff")); }
  };

  const handleAsk = async () => {
    const value = question.trim();
    if (!value || loading) return;
    if (!courseId) { message.warning(siteText("site.332b5503a30f6a07")); return; }
    setLoading(true);
    const sequence = ++sequenceRef.current;
    setQuestion('');
    setChat((prev) => [...prev, { role: 'user', content: value }]);
    try {
      const res = await aiAPI.ask(value, courseId);
      if (sequence !== sequenceRef.current) return;
      setChat((prev) => [...prev, { role: 'ai', content: res.answer, sources: res.sources || [], courseId,
        origin: res.origin, requestId: res.request_id }]);
    } catch (err) {
      if (sequence !== sequenceRef.current) return;
      setChat((prev) => [...prev, { role: 'ai', error: true,
        content: err?.response?.data?.error || siteText("site.8cc6f3705f6478dd") }]);
    } finally { if (sequence === sequenceRef.current) setLoading(false); }
  };

  return (
    <div style={{ maxWidth: 850, margin: '0 auto' }}>
      <Title level={4}>{siteText("site.ec779afa35a9d932")}</Title>
      <Text type="secondary">{siteText("site.347887469bcb12d4")}</Text>
      {loadError && <Alert type="error" showIcon message={loadError} style={{ marginTop: 12 }} />}
      {!enabled && <Alert type="info" showIcon message={siteText("site.756292d44aaf0f6c")} style={{ marginTop: 12 }} />}
      {user?.role === 'admin' && <div style={{ marginTop: 8 }}><Link to="/dashboard/ai/settings">{siteText("site.1f1561e8e4e1d368")}</Link></div>}
      <Card style={{ marginTop: 16, height: 440, overflow: 'auto' }}>
        {chat.length === 0 && <div style={{ textAlign: 'center', color: '#999', marginTop: 120 }}>
          <RobotOutlined style={{ fontSize: 48 }} />
          <p>{siteText("site.27f87097ea80ede8")}</p>
        </div>}
        {chat.map((item, i) => <div key={i} style={{ marginBottom: 18, display: 'flex', gap: 8, justifyContent: item.role === 'user' ? 'flex-end' : 'flex-start' }}>
          {item.role === 'ai' && <RobotOutlined style={{ fontSize: 20, color: '#1a73e8' }} />}
          <div style={{ maxWidth: screens.sm ? '78%' : '90%', minWidth: 0, overflowWrap: 'anywhere', padding: '8px 14px', borderRadius: 12, background: item.role === 'user' ? '#1a73e8' : '#f0f2f5', color: item.role === 'user' ? '#fff' : '#333', whiteSpace: 'pre-wrap' }}>
            {item.role === 'ai' && <div style={{ marginBottom: 6 }}><Tag color={item.error ? 'orange' : 'blue'}>
              {item.error ? siteText("site.52a81ab8967cddfa") : item.origin === 'provider' ? siteText("site.df1fb13decb087c4") : siteText("site.dcf9c2f264048866")}
            </Tag></div>}
            {item.content}
            {item.sources?.length > 0 && <div style={{ marginTop: 12, borderTop: '1px solid #d9d9d9', paddingTop: 8 }}>
              <Text strong>{siteText("site.23db76d231f9eaa9")}</Text>
              {item.sources.map((source) => <div key={source.ref}>
                <Text type="secondary">[{source.ref}] {source.title} · {source.locator} </Text>
                {source.type === 'resource' ? <Button type="link" size="small" onClick={() => downloadSource(source)}>{siteText("site.f4568c4aca2b65c5")}</Button>
                  : source.type === 'task' ? <Link to={`/tasks/${source.id}`}>{siteText("site.340b38fec4a550c5")}</Link>
                    : <Link to={`/courses/${item.courseId}`}>{siteText("site.3346f25aaf1b9fa7")}</Link>}
              </div>)}
            </div>}
          </div>
          {item.role === 'user' && <UserOutlined style={{ fontSize: 20, color: '#1a73e8' }} />}
        </div>)}
        {loading && <Spin />}
        <div ref={chatEndRef} />
      </Card>
      <div style={{ display: 'flex', flexDirection: screens.sm ? 'row' : 'column', gap: 8, width: '100%', marginTop: 12 }}>
        <Select style={{ width: screens.sm ? 230 : '100%', flexShrink: 0 }} placeholder={siteText("site.24d015e5582997cb")} value={courseId} disabled={loading}
          onChange={(id) => { setCourseId(id); setChat([]); setLoadError(''); }}
          options={courses.map((course) => ({ label: course.title, value: course.id }))} />
        <Input placeholder={siteText("site.8984e1f93c5786dd")} maxLength={1000} value={question}
          disabled={!enabled || !courseId || loading} onChange={(event) => setQuestion(event.target.value)}
          onPressEnter={(event) => { if (!event.nativeEvent.isComposing) handleAsk(); }} />
        <Button type="primary" icon={<SendOutlined />} onClick={handleAsk} loading={loading} disabled={!enabled || !courseId}>{siteText("site.f20296653af738ab")}</Button>
      </div>
    </div>
  );
}
