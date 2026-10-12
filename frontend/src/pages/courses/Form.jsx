import {copyText as siteText} from "../../content/copy";
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Alert,Card, Form, Input, Select, Button, Typography, message, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { courseAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import {maintenanceText as c} from './maintenanceCopy';

const { Title } = Typography;

export default function CourseForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const [editableId, setEditableId] = useState(null);
  const [loadedCourse, setLoadedCourse] = useState(null);
  const [readError,setReadError]=useState(''),[attempt,setAttempt]=useState(0);
  const dirty=useRef(false),busy=useRef(false);
  useEffect(()=>{const warn=e=>{if(dirty.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);

  useEffect(() => {
    let cancelled = false;
    if (isEdit) {
      courseAPI.detail(id).then((res) => {
        if (cancelled) return;
        if (!res.course.can_manage) {
          message.warning(siteText("site.85d879f83bb8a020"));
          navigate(`/courses/${id}`, { replace: true });
          return;
        }
        setLoadedCourse(res.course);
        setEditableId(id);
      }).catch(error => {if(!cancelled)setReadError(error.response?.data?.error||c('loadFailed'));});
    }
    return () => { cancelled = true; };
  }, [id, form, isEdit, navigate,attempt]);

  useEffect(() => {
    if (isEdit && editableId === id && loadedCourse) form.setFieldsValue(loadedCourse);
  }, [editableId, id, isEdit, loadedCourse, form]);

  const onFinish = async (values) => {
    if (busy.current||isEdit && editableId !== id) return;
    busy.current=true;
    setLoading(true);
    try {
      if (isEdit) {
        await courseAPI.update(id, values);
        message.success(siteText("site.a2c4aa5c6824a935"));
      } else {
        await courseAPI.create(values);
        message.success(siteText("site.e8edb2213dea0464"));
      }
      dirty.current=false;navigate('/courses');
    } catch { /* handled */ }
    finally { busy.current=false;setLoading(false); }
  };

  if (!['admin', 'academic_mentor'].includes(user?.role)) return <p>{siteText("site.5face19c0cc4760d")}</p>;
  if (isEdit && editableId !== id) return readError?<Alert type="error" title={readError} action={<Button onClick={()=>setAttempt(n=>n+1)}>{c('retryRead')}</Button>}/>:<p>{siteText("site.39bfa026fb882acf")}</p>;

  return (
    <div style={{ maxWidth: 700 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => {if(!dirty.current||window.confirm(c('discard')))navigate('/courses');}}>{siteText("site.00f8cce00054f186")}</Button>
        <Title level={4} style={{ margin: 0 }}>{isEdit ? siteText("site.16a1ed1919717f2d") : siteText("site.4b59127ba4857134")}</Title>
      </Space>
      <Card>
        <Form form={form} layout="vertical" onFinish={onFinish} onValuesChange={()=>{dirty.current=true;}} disabled={loading} initialValues={{presentation_theme:'campus'}}>
          <Form.Item name="title" label={siteText("site.c266f61dfb37f71d")} rules={[{ required: true, message: siteText("site.d911ed4f250de1c0") }]}>
            <Input maxLength={120}/>
          </Form.Item>
          <Form.Item name="theme" label={siteText("site.948c344e38f324b3")}><Input maxLength={120} placeholder={siteText("site.13465840b4bc43f7")} /></Form.Item>
          <Form.Item name="presentation_theme" label={c('field.presentation_theme')} extra={c('purpose')}><Select options={['campus','voyage'].map(value=>({value,label:c('theme.'+value)}))}/></Form.Item>
          <Form.Item name="description" label={siteText("site.95dc1aa6970c76bb")}><Input.TextArea maxLength={10000} showCount rows={3} /></Form.Item>
          <Form.Item name="driving_question" label={siteText("site.48867c629ac7d0f5")}><Input maxLength={1000} showCount placeholder={siteText("site.50a0856d01e03c88")} /></Form.Item>
          <Form.Item name="story_line" label={siteText("site.7c00a522354ec631")}><Input.TextArea maxLength={10000} showCount rows={2} /></Form.Item>
          <Form.Item name="grade_level" label={siteText("site.1620890a8ec34510")} rules={[{ required: true }]}>
            <Select options={[
              { label: siteText("site.767e43d1f758efdc"), value: 'primary' }, { label: siteText("site.ed2b0e04ed9e1ae0"), value: 'junior' }, { label: siteText("site.433bcd13f48de0b7"), value: 'senior' },
            ]} />
          </Form.Item>
          <Form.Item name="difficulty" label={siteText("site.044520583daa04bc")} rules={[{ required: true }]}>
            <Select options={[
              { label: siteText("site.12e48a9f785aac07"), value: 'basic' }, { label: siteText("site.9b34d3d2de702b00"), value: 'advanced' }, { label: siteText("site.493d6670cfe1182f"), value: 'challenge' },
            ]} />
          </Form.Item>
          <Form.Item name="total_hours" label={siteText("site.c1ded6174eae4fd6")}><Input type="number" min={0} max={10000} step={1} placeholder={siteText("site.66bd8bb988566ddf")} /></Form.Item>
          <Form.Item name="materials_needed" label={siteText("site.3ab498631b47e8ec")}><Input.TextArea maxLength={10000} showCount rows={2} /></Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>{isEdit ? siteText("site.03ac413d17a0dc22") : siteText("site.4b59127ba4857134")}</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
