import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { learningAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';
import KnowledgePreview from '../../components/learning/KnowledgePreview';

export default function LessonPreview() {
  const { lessonId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError(''); setData(null);
    learningAPI.preview(lessonId).then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(err?.response?.data?.error || '无法加载课时预览'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [lessonId, reload]);
  return <PageContainer title={data?.lesson?.title || '课时内容预览'} description={data?.course?.title}
    extra={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate(user?.role === 'teacher' ? '/observer/students' : '/mentor/content')}>返回{user?.role === 'teacher' ? '学生列表' : '内容中心'}</Button>}>
    <AsyncPageState loading={loading} error={error} onRetry={() => setReload((value) => value + 1)}>
      <KnowledgePreview cards={data?.cards} />
    </AsyncPageState>
  </PageContainer>;
}
