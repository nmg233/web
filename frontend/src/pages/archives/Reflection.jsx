import Alert from '../../student/visual/StudentAlert';
import {copyText} from '../../content/copy';
import CopyBlock from '../../content/CopyBlock';
import { useCourseApis } from '../../student/useCourseApis';
import { useEffect, useRef, useState } from 'react';
import {useCourseNavigate as useNavigate} from '../../student/useCourseApis';

import { Form, Select, Result } from 'antd';
import { STUDENT_COURSES_CHANGED } from '../../student/accessPolicy';
import { loadArchiveScope } from '../../student/archiveModel';
import PageContainer from '../../components/common/PageContainer';
import { StudyHeader, StudySection } from '../../student/visual/StudyUI';
import { PixelButton } from '../../student/visual/PixelUI';
import PixelIcon from '../../student/visual/PixelIcon';
import '../../student/visual/pixel-archive.css';

const errorText = (error) => error.response?.data?.error || copyText('system.reflection.001');
import {useAuth} from '../../store/AuthContext';
import {useCourseId} from '../../student/useCourseApis';
import OpenReflectionForm from '../../student/OpenReflectionForm';
import {openReflectionDraft} from '../../student/reflectionModel';
export default function Reflection(){const{user}=useAuth();const courseId=useCourseId();return <ReflectionEditor key={user.id+':'+courseId} accountId={user.id}/>;}
function ReflectionEditor({accountId}) {
  const { archiveAPI, courseAPI } = useCourseApis();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [scope, setScope] = useState({ loading: true, enrollments: [], error: '' });
  const [lessons, setLessons] = useState({ loading: false, rows: [], error: '' });
  const [notice, setNotice] = useState('');
  const [draftError,setDraftError]=useState('');
  const selectedDraft=useRef(null);
  const draftKey=enrollment=>`pbl:reflection-draft:${accountId}:${enrollment}`;
  const saveDraft=()=>{if(!selectedDraft.current)return;try{localStorage.setItem(draftKey(selectedDraft.current),JSON.stringify(form.getFieldsValue(true)));setDraftError('');}catch{setDraftError(copyText('next2.reflection.draftFailed'));}};
  const [submitError, setSubmitError] = useState('');
  const sequence = useRef(0);
  const scopeSequence = useRef(0);
  const alive = useRef(false);
  const scopeRef = useRef([]);
  const refreshRef = useRef(null);
  const invalidate = () => {
    sequence.current += 1;
    form.setFieldsValue({ enrollment_id: undefined, lesson_id: undefined });
    setLessons({ loading: false, rows: [], error: '' });
    setNotice(copyText('system.reflection.002'));
  };
  const refreshScope = async () => {
    const request = ++scopeSequence.current;
    setScope((current) => ({ ...current, loading: true, error: '' }));
    try {
      const next = await loadArchiveScope({ courses: courseAPI.list, enrollments: archiveAPI.getReflections });
      if (!alive.current || request !== scopeSequence.current) return null;
      const selected = form.getFieldValue('enrollment_id');
      if (selected && !next.enrollments.some((row) => String(row.enrollment_id) === String(selected))) invalidate();
      scopeRef.current = next.enrollments;
      setScope({ loading: false, enrollments: next.enrollments, error: '' });
      if (!form.getFieldValue('enrollment_id') && next.enrollments.length===1) {
        form.setFieldValue('enrollment_id',next.enrollments[0].enrollment_id);
        void selectCourse(next.enrollments[0].enrollment_id);
      }
      return next;
    } catch (error) {
      if (alive.current && request === scopeSequence.current) setScope((current) => ({ ...current, loading: false, error: errorText(error) }));
      return null;
    }
  };
  useEffect(() => { refreshRef.current = refreshScope; });
  useEffect(() => {
    alive.current = true;
    refreshRef.current();
    const update = ({ detail }) => {
      const allowed = new Set(detail.courses.map((course) => String(course.id)));
      const selected = scopeRef.current.find((row) => row.enrollment_id === form.getFieldValue('enrollment_id'));
      if (selected && !allowed.has(String(selected.course_id))) {
        sequence.current += 1;
        form.setFieldsValue({ enrollment_id: undefined, lesson_id: undefined });
        setLessons({ loading: false, rows: [], error: '' });
        setNotice(copyText('system.reflection.003'));
      }
      scopeRef.current = scopeRef.current.filter((row) => allowed.has(String(row.course_id)));
      setScope((current) => ({ ...current, enrollments: scopeRef.current }));
      refreshRef.current();
    };
    window.addEventListener(STUDENT_COURSES_CHANGED, update);
    return () => { alive.current = false; scopeSequence.current += 1; sequence.current += 1; window.removeEventListener(STUDENT_COURSES_CHANGED, update); };
  }, [form]);
  const selectCourse = async (enrollmentId) => {
    saveDraft();
    selectedDraft.current=enrollmentId||null;
    let saved={}; try{const raw=localStorage.getItem(draftKey(enrollmentId));if(raw){saved=JSON.parse(raw);if(saved.reflection_version!==2&&!localStorage.getItem(draftKey(enrollmentId)+':legacy-v1'))localStorage.setItem(draftKey(enrollmentId)+':legacy-v1',raw);}}catch{setDraftError(copyText('next2.reflection.draftFailed'));}
    form.setFieldsValue({...openReflectionDraft(saved,copyText),enrollment_id:enrollmentId,lesson_id:undefined});
    const request = ++sequence.current;
    setNotice(''); setSubmitError('');
    const enrollment = scopeRef.current.find((row) => row.enrollment_id === enrollmentId);
    setLessons({ loading: Boolean(enrollment), rows: [], error: '' });
    if (!enrollment) return;
    try {
      const result = await courseAPI.detail(enrollment.course_id);
      if (alive.current && request === sequence.current) setLessons({ loading: false, rows: result.lessons || [], error: '' });
    } catch (error) {
      if (alive.current && request === sequence.current) {
        setLessons({ loading: false, rows: [], error: errorText(error) });
        if ([403, 404].includes(error.response?.status)) await refreshScope();
      }
    }
  };
  const submit = async (values) => {
    setSubmitting(true); setSubmitError('');
    try {
      // UI rechecks scope; the backend also verifies publication, enrollment and lesson ownership.
      const confirmed = await refreshScope();
      if (!confirmed) throw new Error(copyText('system.reflection.004'));
      const enrollment = confirmed.enrollments.find((row) => String(row.enrollment_id) === String(values.enrollment_id));
      if (!enrollment) throw new Error(copyText('system.reflection.005'));
      if (String(form.getFieldValue('enrollment_id')) !== String(values.enrollment_id)) throw new Error(copyText('system.reflection.006'));
      await archiveAPI.submitReflection(values);
      if (alive.current && String(form.getFieldValue('enrollment_id'))===String(values.enrollment_id)) { try{localStorage.removeItem(draftKey(values.enrollment_id));}catch{ /* Submission remains saved on the server. */ } setDone(true); }
    } catch (error) {
      if (alive.current) setSubmitError(error.response?.data?.error || error.message || errorText(error));
      if (error.response?.data?.error?.includes('报名记录')) await refreshScope();
    } finally { if (alive.current) setSubmitting(false); }
  };
  return <PageContainer><div className="study-workspace archive-workspace">
    <StudyHeader eyebrow={<><PixelIcon name="book" />{copyText('system.reflection.008')}</>} title={copyText('system.reflection.009')} description={copyText('next2.reflection.help')}><PixelButton icon={<PixelIcon name="back" />} onClick={() => navigate('/archives')}>{copyText('system.reflection.011')}</PixelButton></StudyHeader>
    {done ? <StudySection number="✓" title={copyText('system.reflection.012')}><Result status="success" title={copyText('system.reflection.013')} subTitle={copyText('next2.reflection.done')} extra={<PixelButton type="primary" onClick={() => navigate('/archives')}>{copyText('system.reflection.014')}</PixelButton>} /></StudySection> : <div className="archive-reflection-layout">
      <StudySection number="R" title={copyText('system.reflection.015')} description={copyText('system.reflection.016')}>
        {notice && <Alert type="warning" showIcon title={notice} />}
        {scope.error && <Alert type="warning" showIcon title={copyText('system.reflection.017')} description={scope.error} action={<PixelButton onClick={refreshScope}>{copyText('system.reflection.018')}</PixelButton>} />}
        {!scope.loading && !scope.error && !scope.enrollments.length && <Alert type="info" title={copyText('system.reflection.019')} description={copyText('system.reflection.020')} />}
        <Form form={form} layout="vertical" initialValues={{reflection_version:2}} onValuesChange={saveDraft} onFinish={submit} disabled={submitting} onFinishFailed={({ errorFields }) => { if (errorFields[0]) form.scrollToField(errorFields[0].name, { focus: true, block: 'center' }); }}>
          <Form.Item name="enrollment_id" label={copyText('system.reflection.021')} rules={[{ required: true, message: copyText('system.reflection.022') }]}><Select placeholder={copyText('system.reflection.023')} loading={scope.loading} disabled={submitting || scope.loading || Boolean(scope.error)} onChange={selectCourse} options={scope.enrollments.map((row) => ({ value: row.enrollment_id, label: `${row.course_title} · #${row.course_id}` }))} /></Form.Item>
          <Form.Item name="lesson_id" label={copyText('system.reflection.024')}><Select allowClear placeholder={copyText('system.reflection.025')} loading={lessons.loading} disabled={submitting || lessons.loading || Boolean(lessons.error)} options={lessons.rows.map((lesson) => ({ value: lesson.id, label: lesson.title }))} /></Form.Item>
          {lessons.error && <Alert type="warning" showIcon title={copyText('system.reflection.026')} description={lessons.error} action={<PixelButton onClick={() => selectCourse(form.getFieldValue('enrollment_id'))}>{copyText('system.reflection.027')}</PixelButton>} />}
          <OpenReflectionForm/><p className="study-help">{copyText('next2.reflection.draft')}</p>{draftError&&<Alert type="warning" title={draftError}/>}
          <div className="study-submit-result" aria-live="polite">{submitError && <Alert type="error" showIcon title={copyText('system.reflection.037')} description={submitError} />}</div>
          <div className="study-actions"><PixelButton aria-label={copyText('system.reflection.038')} type="primary" htmlType="submit" loading={submitting} disabled={scope.loading || Boolean(scope.error) || !scope.enrollments.length}>{copyText('system.reflection.039')}</PixelButton><CopyBlock id="system.reflection.040" as="p" /></div>
        </Form>
      </StudySection>
      <aside className="study-context"><h3>{copyText('system.reflection.041')}</h3><p>{copyText('next2.reflection.help')}</p><p>{copyText('next2.reflection.scope')}</p><CopyBlock id="system.reflection.046" as="p" /></aside>
    </div>}
  </div></PageContainer>;
}
