import {runtimeText as runtimeCopyText} from '../../content/runtimeCopy.js';
import StudentCopyText from '../../content/ManagedText';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { learningAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';
import KnowledgePreview from '../../components/learning/KnowledgePreview';
import { returnContext } from '../../utils/returnContext';

export default function LessonPreview() {
  const { lessonId, courseId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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
  return <PageContainer title={data?.lesson?.title || runtimeCopyText("student26.a4c920a7ad7b41c0")} description={data?.course?.title}
    extra={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate(returnContext(location.state?.returnTo, user?.role === 'teacher' ? '/observer/students' : courseId ? `/courses/${courseId}` : '/courses'), {state: location.state?.parentState})}><StudentCopyText id="student26.016ab259c4a56d95"/></Button>}>
    <AsyncPageState loading={loading} error={error} onRetry={() => setReload((value) => value + 1)}>
      <KnowledgePreview cards={data?.cards} />
    </AsyncPageState>
  </PageContainer>;
}
