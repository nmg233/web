import {maintenanceAPI as maintenance} from './maintenanceApi';
import useTeachingLeaveGuard from './useTeachingLeaveGuard';
import {copyText as siteText} from "../../content/copy";
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Alert,Card, Form, Input, Select, Button, Typography, message, Space,Modal } from 'antd';
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
  const dirty=useRef(false),busy=useRef(false),unsaved=useRef(new Set()),processing=useRef(new Set()),request=useRef(crypto.randomUUID()),known=useRef(null);
  useTeachingLeaveGuard(unsaved,'课程填写尚未保存，是否放弃并离开？',processing);
  useEffect(()=>{const warn=e=>{if(dirty.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);

  useEffect(() => {
    let cancelled = false;
    if (isEdit) {
      courseAPI.detail(id).then(async(res) => {
        if (cancelled) return;
        if (!res.course.can_manage) {
          message.warning(siteText("site.85d879f83bb8a020"));
          navigate(`/courses/${id}`, { replace: true });
          return;
        }
        const latest=await maintenance.read(id);if(cancelled)return;known.current=latest.course.content_revision;setLoadedCourse(latest.course);
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
    busy.current=true;processing.current.add('save');
    setLoading(true);
    try {
      if (isEdit) {
        await maintenance.save(id,'/course',{...values,expected_revision:known.current});
        message.success(siteText("site.a2c4aa5c6824a935"));
      } else {
        const result=await courseAPI.create({...values,request_key:request.current});dirty.current=false;unsaved.current.clear();processing.current.clear();navigate('/courses/'+result.id);return;
      }
      dirty.current=false;unsaved.current.clear();processing.current.clear();navigate('/courses/'+id);
    } catch(error) {setReadError(error.response?.data?.error||'保存未确认，当前输入已保留，请核对服务器版本');}
    finally { busy.current=false;processing.current.clear();setLoading(false); }
  };

  const inspectLatest=async()=>{try{const latest=(await maintenance.read(id)).course,mine=form.getFieldsValue(),diff=Object.keys(mine).filter(key=>String(mine[key]??'')!==String(latest[key]??'')),labels={title:'课程名称',description:'课程简介',learning_objectives:'学习目标',theme:'教学主题',presentation_theme:'视觉预设',driving_question:'核心问题',story_line:'故事',materials_needed:'材料准备',grade_level:'学段',difficulty:'难度',total_hours:'总课时'};Modal.confirm({title:'核对最新课程，保留我的输入',content:<div style={{maxHeight:'60vh',overflow:'auto'}}><p>服务器课程：{latest.title}</p>{diff.map(key=><div key={key}><strong>{labels[key]||key}</strong><p style={{whiteSpace:'pre-wrap'}}>服务器：{String(latest[key]??'（未填写）')}</p><p style={{whiteSpace:'pre-wrap'}}>我的输入：{String(mine[key]??'（未填写）')}</p></div>)}<p>确认只采用最新修订号，不替换表单。确认后保存会使用当前表单，请先核对全部差异。</p></div>,onOk:()=>{known.current=latest.content_revision;setReadError('已核对新修订，输入保留，请检查后保存');}});}catch(error){setReadError(error.response?.data?.error||'最新版本读取失败，输入已保留');}};
  if (!['admin', 'academic_mentor'].includes(user?.role)) return <p>{siteText("site.5face19c0cc4760d")}</p>;
  if (isEdit && editableId !== id) return readError?<Alert type="error" title={readError} action={<Button onClick={()=>setAttempt(n=>n+1)}>{c('retryRead')}</Button>}/>:<p>{siteText("site.39bfa026fb882acf")}</p>;

  return (
    <div style={{ maxWidth: 700 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => {if(!dirty.current||window.confirm(c('discard')))navigate('/courses');}}>{siteText("site.00f8cce00054f186")}</Button>
        <Title level={4} style={{ margin: 0 }}>{isEdit ? siteText("site.16a1ed1919717f2d") : siteText("site.4b59127ba4857134")}</Title>
      </Space>
      {readError&&<Alert type="warning" title={readError} description="当前输入保留；可另开本课程概览核对字段差异，不能直接覆盖他人修改。" action={isEdit?<Button disabled={loading} onClick={inspectLatest}>核对最新修订（保留输入）</Button>:null}/>}
      <Card>
        <Form form={form} layout="vertical" onFinish={onFinish} onValuesChange={()=>{dirty.current=true;unsaved.current.add('course');}} disabled={loading} initialValues={{presentation_theme:'campus'}}>
          <Form.Item name="title" label={siteText("site.c266f61dfb37f71d")} rules={[{ required: true, message: siteText("site.d911ed4f250de1c0") }]}>
            <Input maxLength={120}/>
          </Form.Item>
          <Form.Item name="theme" label={siteText("site.948c344e38f324b3")}><Input maxLength={120} placeholder={siteText("site.13465840b4bc43f7")} /></Form.Item>
          <Form.Item name="presentation_theme" label={c('field.presentation_theme')} extra={c('purpose')}><Select options={['campus','voyage'].map(value=>({value,label:c('theme.'+value)}))}/></Form.Item>
          <Form.Item name="description" label={siteText("site.95dc1aa6970c76bb")}><Input.TextArea maxLength={10000} showCount rows={3} /></Form.Item>
          <Form.Item name="driving_question" label={siteText("site.48867c629ac7d0f5")}><Input maxLength={1000} showCount placeholder={siteText("site.50a0856d01e03c88")} /></Form.Item>
          <Form.Item name="learning_objectives" label="学习目标（发布前检查）"><Input.TextArea maxLength={10000} rows={3}/></Form.Item>
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
