import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Card, Descriptions, Table, Button, Tag, Tabs, Form, Input, Modal, Result, Space, Typography, Progress, message, Checkbox, Select, Upload, Popconfirm, Dropdown } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, PlusOutlined, UploadOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { courseAPI, studentAPI, authAPI, taskAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import ReplaySummary from '../../components/common/ReplaySummary';
import SignedReplayPlayer from '../../components/common/SignedReplayPlayer';
import LessonReplays from '../../components/courses/LessonReplays';
import { lessonReplayFields, replayFileError } from '../../utils/replayUpload';
import { requestKey } from '../../utils/requestKey';

const { Title, Text } = Typography;


const GRADE_LABELS = { primary: '小学', junior: '初中', senior: '高中' };
const DIFFICULTY_LABELS = { basic: '基础', advanced: '进阶', challenge: '挑战' };
const STATUS_LABELS = { draft: '草稿', published: '已发布', archived: '已归档' };
const RESOURCE_TYPE_LABELS = {
  lesson_plan: '教案', guide_card: '指导卡', template: '模板',
  courseware: '课件', video: '视频', other: '其他',
};

export default function CourseDetail() {
  const { id } = useParams();
  return <CourseDetailPage key={id} />;
}

function CourseDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const requests = useRef({ load: 0, play: 0, replays: 0 });
  const mounted = useRef(false);
  const replayBusy = useRef(false);
  const replaySession = useRef(0);
  const candidateRequests = useRef({ list: 0, classes: 0 });
  const [uploadPercent, setUploadPercent] = useState(0);
  const replayAbort = useRef(null);
  const [uploadNotice,setUploadNotice] = useState('');
  const [checkingUpload,setCheckingUpload] = useState(false);
  const [searchParams] = useSearchParams();
  const uploadStorageKey = (lessonId) => `pbl:replay-upload:${user?.id}:${id}:${lessonId}`;
  const uploadStorage = (key, value) => { try { if(value) sessionStorage.setItem(key,JSON.stringify(value)); else sessionStorage.removeItem(key); } catch { /* 隐私模式下仍可在当前页面重试 */ } };
  const replayRequest = useRef({ fingerprint: '', key: '' });
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [lessons, setLessons] = useState([]);
  const [resources, setResources] = useState([]);
  const [replays, setReplays] = useState([]);
  const [replayUrl, setReplayUrl] = useState(null);
  const [playingReplayId, setPlayingReplayId] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [lessonModal, setLessonModal] = useState(false);
  const [editingLesson,setEditingLesson] = useState(null);
  const [editingTask,setEditingTask] = useState(null);
  const [maintenanceSaving,setMaintenanceSaving] = useState(false);
  const maintenanceBusy = useRef(false);
  const [taskModal, setTaskModal] = useState(false);
  const [activeLesson, setActiveLesson] = useState(null);
  const [replayModal, setReplayModal] = useState(false);
  const [editingReplay, setEditingReplay] = useState(null);
  const [replayLesson, setReplayLesson] = useState(null);
  const [replayFile, setReplayFile] = useState(null);
  const [replayUploading, setReplayUploading] = useState(false);
  const [resourceModal, setResourceModal] = useState(false);
  const [editingResource,setEditingResource] = useState(null);
  const [resourceFile, setResourceFile] = useState(null);
  const [resourceUploading, setResourceUploading] = useState(false);
  const resourceBusy = useRef(false);
  const [lessonForm] = Form.useForm();
  const [taskForm] = Form.useForm();
  const [replayForm] = Form.useForm();
  const replaySummary = Form.useWatch('summary', replayForm);
  const [resourceForm] = Form.useForm();
  // 选课导入（执行导师/管理员）
  const [importOpen, setImportOpen] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [importing, setImporting] = useState(false);
  const [schoolOptions, setSchoolOptions] = useState([]);
  const [candidateSchool, setCandidateSchool] = useState(undefined);
  const [candidateClasses, setCandidateClasses] = useState([]);
  const [candidateClass, setCandidateClass] = useState(undefined);
  // 管理员异常修正：移除报名
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removeReason, setRemoveReason] = useState('');
  const [removeLoading, setRemoveLoading] = useState(false);

  const loadData = async () => {
    const sequence = ++requests.current.load;
    const replaySequence = ++requests.current.replays;
    setPageLoading(true);
    setLoadError('');
    try {
      const res = await courseAPI.detail(id);
      if (sequence !== requests.current.load) return;
      setCourse(res.course);
      setLessons(res.lessons || []);
      setResources(res.resources || []);
      courseAPI.listReplays(id).then((replayRes) => { if (sequence === requests.current.load && replaySequence === requests.current.replays) setReplays(replayRes.replays || []); }).catch(() => {});
      setEnrollments(res.enrollments || []);
      setTasks(res.tasks || []);
      setTeachers(res.teachers || []);
    } catch (err) {
      if (sequence !== requests.current.load) return;
      setCourse(null);
      setLoadError(err?.response?.data?.error || '课程不存在，或当前身份无权查看。');
    } finally {
      if (sequence === requests.current.load) setPageLoading(false);
    }
  };

  // 页面首次进入时加载完整详情；loadData 会在异步回调中更新多个状态。
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { mounted.current = true; setCourse(null); setReplayUrl(null); loadData(); return () => { mounted.current = false; replayAbort.current?.abort(); replaySession.current++; requests.current.load++; requests.current.play++; requests.current.replays++; candidateRequests.current.list++; candidateRequests.current.classes++; Modal.destroyAll(); }; }, [id]);
  useEffect(() => {
    if(!pageLoading && searchParams.get('lesson')) document.getElementById(`lesson-${Number(searchParams.get('lesson'))}`)?.scrollIntoView({block:'start'});
  }, [pageLoading,searchParams]);

  const handleAddLesson = async (values) => {
    if(maintenanceBusy.current) return;
    maintenanceBusy.current=true; setMaintenanceSaving(true);
    try {
      if(editingLesson) await courseAPI.updateLesson(editingLesson.id,values);
      else await courseAPI.addLesson(id, values);
      if(!mounted.current) return;
      message.success(editingLesson ? '课时已更新' : '课时添加成功');
      setLessonModal(false);
      lessonForm.resetFields();
      loadData();
    } catch { /* handled */ } finally {maintenanceBusy.current=false; if(mounted.current)setMaintenanceSaving(false);}
  };

  const handleAddTask = async (values) => {
    if(maintenanceBusy.current) return;
    maintenanceBusy.current=true; setMaintenanceSaving(true);
    try {
      if(editingTask) await taskAPI.update(editingTask.id,values);
      else await courseAPI.addTask(activeLesson.id, values);
      if(!mounted.current) return;
      message.success(editingTask ? '任务已更新' : '任务添加成功');
      setTaskModal(false);
      taskForm.resetFields();
      loadData();
    } catch { /* handled */ } finally {maintenanceBusy.current=false; if(mounted.current)setMaintenanceSaving(false);}
  };

  const openLesson = (lesson=null) => {
    setEditingLesson(lesson); lessonForm.resetFields();
    if(lesson) lessonForm.setFieldsValue({...lesson,start_at:lesson.start_at?.replace(' ','T'),end_at:lesson.end_at?.replace(' ','T')});
    setLessonModal(true);
  };
  const openTask = (lesson,task=null) => {
    setEditingTask(task); setActiveLesson(lesson); taskForm.resetFields();
    if(task) taskForm.setFieldsValue({...task,require_upload:Boolean(task.require_upload),deadline:task.deadline?.replace(' ','T')});
    setTaskModal(true);
  };
  const cancelLesson = (lesson) => {
    let reason='';
    Modal.confirm({title:`取消课时「${lesson.title}」？`,content:<><p>待评、待修改报告或成果未处理时不能取消。取消后保留历史，不再允许学习写入。</p><Input.TextArea maxLength={500} placeholder="必填：取消原因" onChange={(event)=>{reason=event.target.value;}} /></>,okText:'确认取消课时',cancelText:'返回',onOk:async()=>{
      if(!reason.trim()) {message.warning('请填写取消原因'); throw new Error('取消原因必填');}
      await courseAPI.cancelLesson(lesson.id,reason.trim()); if(mounted.current) {message.success('课时已取消');loadData();}
    }});
  };

  const downloadResource = async (r) => {
    try {
      const blob = await courseAPI.downloadResource(r.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = r.download_name || r.title || '课程资源';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch { /* handled */ }
  };

  const playReplay = async (replayId) => {
    const sequence = ++requests.current.play;
    try {
      // 签名流式地址直挂 <video>：支持 Range 拖动，避免整段 blob 下载
      const res = await courseAPI.streamUrl(replayId);
      if (sequence === requests.current.play) { setReplayUrl(res.url); setPlayingReplayId(replayId); }
    } catch { /* handled */ }
  };

  const refreshReplays = async () => {
    const sequence = requests.current.load;
    const replaySequence = ++requests.current.replays;
    // 不卸载页面和页签；刷新课时视频与开放检查，避免上传成功后仍显示旧提示。
    const results = await Promise.allSettled([courseAPI.listReplays(id), courseAPI.detail(id)]);
    if (!mounted.current || sequence !== requests.current.load || replaySequence !== requests.current.replays) return;
    if (results[0].status === 'fulfilled') setReplays(results[0].value.replays || []);
    if (results[1].status === 'fulfilled') { setCourse(results[1].value.course); setLessons(results[1].value.lessons || []); }
    if (results.some((result) => result.status === 'rejected')) message.warning('操作已成功，但列表刷新失败，请重新加载课程核对结果，勿重复上传。');
  };

  const openReplayModal = (replay = null, lesson = null) => {
    if (replayBusy.current) return;
    if (!replay && (!lesson || lesson.status === 'cancelled')) return;
    let pendingFields=null;
    setUploadNotice('');
    if(!replay && lesson) {
      try {
        const pending = JSON.parse(sessionStorage.getItem(uploadStorageKey(lesson.id)) || 'null');
        if(pending?.key && pending?.fingerprint) {
          replayRequest.current = pending;
          const stored=JSON.parse(pending.fingerprint);
          if(Array.isArray(stored) && String(stored[0])===String(id) && String(stored[1]?.lesson_id)===String(lesson.id)) pendingFields=stored[1];
          setUploadNotice('上次上传结果未确认。已恢复原视频信息；先查询结果，未保存时重新选择相同文件后重试。');
        }
        else replayRequest.current = {fingerprint:'',key:''};
      } catch { replayRequest.current = {fingerprint:'',key:''}; }
    }
    replaySession.current++;
    setEditingReplay(replay);
    setReplayLesson(lesson || lessons.find((item) => item.id === replay?.lesson_id) || null);
    setReplayFile(null);
    setUploadPercent(0);
    replayForm.resetFields();
    if (replay) {
      replayForm.setFieldsValue({
        title: replay.title,
        lesson_id: replay.lesson_id,
        description: replay.description,
        summary: replay.summary || '',
        duration_seconds: replay.duration_seconds,
        recording_date: replay.recording_date,
        sort_order: replay.sort_order,
      });
    } else replayForm.setFieldsValue(pendingFields || { title: `${lesson.title} · 课堂回放` });
    setReplayModal(true);
  };

  const handleReplaySubmit = async (values) => {
    if (replayBusy.current) return;
    let fields;
    if (!editingReplay) {
      const error = replayFileError(replayFile);
      if (error) return message.error(error);
      try { fields = lessonReplayFields(id, lessons, replayLesson, values); }
      catch (err) { return message.error(err.message); }
    }
    replayBusy.current = true;
    const session = replaySession.current;
    setReplayUploading(true);
    try {
      if (editingReplay) {
        await courseAPI.updateReplay(editingReplay.id, { ...values, lesson_id: editingReplay.lesson_id || values.lesson_id });
      } else {
        const formData = new FormData();
        formData.append('file', replayFile);
        for (const [key, value] of Object.entries(fields)) formData.append(key, value);
        const fingerprint = JSON.stringify([id, fields, replayFile.name, replayFile.size, replayFile.lastModified]);
        if (replayRequest.current.fingerprint !== fingerprint) replayRequest.current = { fingerprint, key: requestKey() };
        uploadStorage(uploadStorageKey(replayLesson.id),replayRequest.current);
        formData.append('request_key', replayRequest.current.key);
        setUploadPercent(0);
        replayAbort.current = new AbortController();
        await courseAPI.uploadReplay(id, formData, (event) => { if (mounted.current && session === replaySession.current) setUploadPercent(event.total ? Math.round(event.loaded / event.total * 100) : 0); }, replayAbort.current.signal);
      }
      if (!mounted.current || session !== replaySession.current) return;
      replayRequest.current = { fingerprint: '', key: '' };
      if(!editingReplay) uploadStorage(uploadStorageKey(replayLesson.id),null);
      message.success(editingReplay ? '回放信息已更新' : `视频已上传到「${replayLesson.title}」`);
      setReplayModal(false);
      replaySession.current++;
      refreshReplays();
    } catch {
      if(mounted.current && session === replaySession.current && !editingReplay) setUploadNotice('上传未确认：停止等待或网络中断不代表服务器已回滚。请先查询结果，或使用相同文件、信息和请求标识重试。');
    } finally {
      replayAbort.current = null;
      replayBusy.current = false;
      if (mounted.current) setReplayUploading(false);
    }
  };

  const checkReplayUpload = async () => {
    if(!replayRequest.current.key || checkingUpload) return;
    const session=replaySession.current;
    setCheckingUpload(true);
    try {
      const result=await courseAPI.replayUploadResult(id,replayRequest.current.key);
      if(!mounted.current || session !== replaySession.current) return;
      if(result.state === 'saved') {
        uploadStorage(uploadStorageKey(replayLesson.id),null); replayRequest.current={fingerprint:'',key:''};
        message.success(`已确认保存：${result.replay.title}`); setReplayModal(false); replaySession.current++; refreshReplays();
      } else setUploadNotice(result.state === 'removed' ? '该上传曾成功，但视频已被删除；请重新上传。' : '暂未查到保存结果，服务端可能仍在处理。请稍后查询；相同内容重试不会重复建记录。');
    } catch { /* handled */ } finally {if(mounted.current)setCheckingUpload(false);}
  };

  const handleDeleteReplay = async (replayId) => {
    try {
      await courseAPI.deleteReplay(replayId);
      if (!mounted.current) return;
      message.success('回放已删除');
      requests.current.play++;
      if (replayUrl) setReplayUrl(null);
      refreshReplays();
    } catch { /* handled */ }
  };

  // 发布/撤回：不强制课程须有课时，仅在 0 课时时给提示
  const handleChangeStatus = (targetStatus) => {
    if(targetStatus==='draft' && course.has_learning_history) return message.warning('已有学生学习记录，不能撤回草稿；请先处理待评/待修改报告及成果，再归档。');
    const apply = async () => {
      try {
        await courseAPI.update(id, { status: targetStatus });
        message.success(targetStatus === 'published' ? '课程已发布' : '已撤回为草稿');
        loadData();
      } catch { /* handled */ }
    };
    if (targetStatus === 'published' && lessons.length === 0) {
      Modal.confirm({
        title: '课程还没有课时',
        content: '发布后学生即可看到课程信息，但当前还没有课时内容。确认现在发布？',
        okText: '确认发布', cancelText: '再准备一下',
        onOk: apply,
      });
      return;
    }
    if (targetStatus === 'draft') {
      Modal.confirm({
        title: '撤回为草稿？',
        content: '撤回后学生将无法再看到该课程。',
        okText: '确认撤回', cancelText: '取消',
        onOk: apply,
      });
      return;
    }
    apply();
  };

  const openResourceModal = (resource=null) => {
    setEditingResource(resource);
    setResourceFile(null);
    resourceForm.resetFields();
    if(resource) resourceForm.setFieldsValue(resource);
    setResourceModal(true);
  };

  // ==== 选课导入 ====
  const loadCandidates = async (query = {}) => {
    const sequence = ++candidateRequests.current.list;
    setCandidateLoading(true);
    try {
      const res = await courseAPI.enrollCandidates(id, query);
      if (sequence !== candidateRequests.current.list) return;
      setCandidates(res.students || []);
    } catch { /* handled */ } finally {
      if (sequence === candidateRequests.current.list) setCandidateLoading(false);
    }
  };

  const openImportModal = async () => {
    setSelectedKeys([]);
    setCandidateSchool(undefined);
    setCandidateClass(undefined);
    setCandidateClasses([]);
    setCandidates([]);
    setImportOpen(true);
    authAPI.getSchools()
      .then((res) => setSchoolOptions(Array.isArray(res) ? res : (res.schools || [])))
      .catch(() => {});
    await loadCandidates({});
  };

  const handleCandidateSchoolChange = async (sid) => {
    const sequence = ++candidateRequests.current.classes;
    setCandidateSchool(sid);
    setCandidateClass(undefined);
    if (sid) {
      try {
        const res = await studentAPI.getClasses(sid);
        if (sequence === candidateRequests.current.classes) setCandidateClasses(res.classes || []);
      } catch { if (sequence === candidateRequests.current.classes) setCandidateClasses([]); }
    } else {
      setCandidateClasses([]);
    }
  };

  const handleImportSubmit = async () => {
    if (selectedKeys.length === 0) {
      message.warning('请先选择要导入的学生');
      return;
    }
    setImporting(true);
    try {
      const res = await courseAPI.enroll(id, selectedKeys);
      message.success(res.message || `已导入 ${res.added} 名学生`);
      setImportOpen(false);
      loadData();
    } catch { /* handled */ } finally {
      setImporting(false);
    }
  };

  const openRemoveModal = (row) => {
    setRemoveTarget(row);
    setRemoveReason('');
  };

  const handleRemoveSubmit = async () => {
    if (!removeReason.trim()) {
      message.warning('请填写移除原因（将记录在审计中）');
      return;
    }
    setRemoveLoading(true);
    try {
      await courseAPI.removeEnrollment(id, removeTarget.id, removeReason.trim());
      message.success('报名已移除');
      setRemoveTarget(null);
      loadData();
    } catch { /* handled */ } finally {
      setRemoveLoading(false);
    }
  };

  const handleResourceSubmit = async (values) => {
    if(resourceBusy.current) return;
    if (!editingResource && !resourceFile) {
      message.error('请选择资料文件（≤50MB）');
      return;
    }
    resourceBusy.current=true; setResourceUploading(true);
    try {
      if(editingResource) await courseAPI.updateResource(editingResource.id,{...values,lesson_id:values.lesson_id || null});
      else {
      const formData = new FormData();
      formData.append('file', resourceFile);
      formData.append('title', values.title || '');
      formData.append('resource_type', values.resource_type || 'courseware');
      formData.append('lesson_id', values.lesson_id || '');
      formData.append('description', values.description || '');
      await courseAPI.uploadResource(id, formData);
      }
      if(!mounted.current) return;
      message.success(editingResource ? '资料信息已更新' : '资料上传成功');
      setResourceModal(false);
      loadData();
    } catch { /* handled */ } finally {
      resourceBusy.current=false;
      if(mounted.current)setResourceUploading(false);
    }
  };

  if (!course || course.id !== Number(id)) return pageLoading
    ? <div style={{ padding: 24 }}><Card loading /></div>
    : <Result status={loadError.includes('无权') ? '403' : '404'} title="无法打开课程" subTitle={loadError} extra={<Space><Button onClick={() => navigate('/courses')}>返回课程列表</Button><Button type="primary" onClick={loadData}>重新加载</Button></Space>} />;

  const isStudent = user?.role === 'student';
  const isEnrolled = isStudent && enrollments.some((e) => e.student_id === user.id);
  const availableLessons = lessons.filter((l) => l.status !== 'cancelled' && l.learning_in_scope !== false);
  const firstLearningLesson = availableLessons.find((l) => l.progress > 0 && l.progress < 100)
    || availableLessons.find((l) => l.progress < 100) || availableLessons[0];
  const canEdit = course.can_manage && course.status !== 'archived';

  const tabItems = [
    {
      key: 'lessons', label: '课时安排',
      children: (
        <div>
          {canEdit && (
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => openLesson()} style={{ marginBottom: 16 }}>添加课时</Button>
          )}
          {lessons.map((lesson) => (
            <Card key={lesson.id} id={`lesson-${lesson.id}`} size="small" style={{ marginBottom: 8,scrollMarginTop:80 }} title={lesson.title}
              extra={<Space wrap>
                {isEnrolled && lesson.status !== 'cancelled' && lesson.learning_in_scope !== false && <Button type="primary" size="small" onClick={() => navigate(`/courses/${course.id}/lessons/${lesson.id}/learn`)}>进入课后学习</Button>}
                {course.can_manage && <Button type={canEdit && lesson.status !== 'cancelled' ? 'primary' : 'default'} size="small" onClick={() => navigate(`/courses/${course.id}/lessons/${lesson.id}/${canEdit && lesson.status !== 'cancelled' ? 'content' : 'preview'}`, { state: { returnTo: `/courses/${course.id}` } })}>{canEdit && lesson.status !== 'cancelled' ? '设置知识卡片与习题' : '预览知识卡片与习题'}</Button>}
                {canEdit && lesson.status !== 'cancelled' && <Dropdown trigger={['click']} menu={{items:[{key:'edit',label:'编辑课时'},{key:'task',label:'添加独立成果任务'},{key:'cancel',label:'取消课时',danger:true}],onClick:({key})=>key==='edit' ? openLesson(lesson) : key==='task' ? openTask(lesson) : cancelLesson(lesson)}}><Button size="small">课时管理</Button></Dropdown>}
              </Space>}
            >
              {lesson.status === 'cancelled' && <Tag color="red">已取消，仅保留历史</Tag>}
              {lesson.readiness && !lesson.readiness.ready && <Text type="warning">课后学习尚未开放：{lesson.readiness.issues.join('；')}</Text>}
              {lesson.description && <p>{lesson.description}</p>}
              <Space wrap size={[4, 0]}>
                {lesson.duration && <Tag>{lesson.duration} 分钟</Tag>}
                {lesson.start_at && <Tag color="blue">上课 {lesson.start_at.replace('T', ' ')}</Tag>}
                {lesson.location && <Tag color="green">地点：{lesson.location}</Tag>}
                {lesson.instructor_name && <Tag>授课：{lesson.instructor_name}</Tag>}
              </Space>
              <LessonReplays lesson={lesson} replays={replays} canEdit={canEdit}
                playing={replayUrl ? { id: playingReplayId, url: replayUrl } : null}
                onUpload={(target) => openReplayModal(null, target)} onEdit={openReplayModal}
                onDelete={handleDeleteReplay} onPlay={playReplay} />
              {tasks.filter((task) => task.lesson_id === lesson.id).map((task) => <div key={task.id} style={{ marginTop: 8 }}><Space wrap><Link to={`/tasks/${task.id}`}>{task.title}</Link>{task.deadline && <Tag>截止 {task.deadline}</Tag>}{task.status==='cancelled' && <Tag>已取消，保留历史</Tag>}{canEdit && lesson.status !== 'cancelled' && task.status!=='cancelled' && <><Button size="small" onClick={()=>openTask(lesson,task)}>编辑任务</Button><Popconfirm title="取消独立成果任务？已有作品的任务不能取消。" onConfirm={async()=>{await taskAPI.cancel(task.id);if(mounted.current)loadData();}}><Button size="small" danger>取消任务</Button></Popconfirm></>}</Space></div>)}
            </Card>
          ))}
        </div>
      ),
    },
    {
      key: 'replays', label: '课程回放',
      children: (
        <div>
          {canEdit && <p><Text type="secondary">上传入口在「课时安排」中各课时的「上传本课时视频」，此处汇总展示回放。</Text></p>}
          {replayUrl && <SignedReplayPlayer key={playingReplayId} replayId={playingReplayId} initialUrl={replayUrl} />}
          {replays.length === 0 ? (
            <Typography.Text type="secondary">暂无课程回放</Typography.Text>
          ) : replays.map((replay) => (
            <Card key={replay.id} size="small" style={{ marginBottom: 8 }}
              extra={canEdit && !replay.lesson_id && (
                <Space size={4}>
                  <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openReplayModal(replay)}>编辑</Button>
                  <Popconfirm title="确定删除该回放？" okText="删除" cancelText="取消" onConfirm={() => handleDeleteReplay(replay.id)}>
                    <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                </Space>
              )}
            >
              <Space>
                <span>{replay.title}</span>
                <Tag>{replay.lesson_id ? (lessons.find((lesson) => lesson.id === replay.lesson_id)?.title || '课时回放') : '历史课程共享回放'}</Tag>
                {replay.recording_date && <Tag>{replay.recording_date}</Tag>}
                {replay.duration_seconds && <Tag>{Math.round(replay.duration_seconds / 60)} 分钟</Tag>}
                <Button size="small" type="link" onClick={() => playReplay(replay.id)}>播放</Button>
              </Space>
              {replay.description && <Text>{replay.description}</Text>}
              <ReplaySummary replay={replay} />
            </Card>
          ))}
        </div>
      ),
    },
    {
      key: 'resources', label: '课程资源',
      children: (
        <div>
          {canEdit && (
            <Space style={{ marginBottom: 16 }}>
              <Button type="dashed" icon={<UploadOutlined />} onClick={()=>openResourceModal()}>上传资料</Button>
              <Button onClick={() => navigate(`/courses/${id}/ai-knowledge`)}>管理 AI 知识库</Button>
            </Space>
          )}
          {resources.length === 0 ? (
            <Typography.Text type="secondary">暂无课程资源</Typography.Text>
          ) : resources.map((r) => (
            <Card key={r.id} size="small" style={{ marginBottom: 8 }}>
              <Space wrap>
                <Tag>{RESOURCE_TYPE_LABELS[r.resource_type] || r.resource_type}</Tag>
                <Tag>{r.lesson_id ? lessons.find(l=>l.id===r.lesson_id)?.title || '课时资料' : '课程共享资料'}</Tag>
                <span>{r.title}</span>
                {r.has_file && (
                  <Button size="small" type="link" icon={<DownloadOutlined />} onClick={() => downloadResource(r)}>下载</Button>
                )}
                {canEdit && !lessons.some(l=>l.id===r.lesson_id && l.status==='cancelled') && <><Button size="small" onClick={()=>openResourceModal(r)}>编辑资料信息</Button><Popconfirm title="删除资料？已有学习快照的资料需保留，不可删除。" onConfirm={async()=>{await courseAPI.deleteResource(r.id);if(mounted.current)loadData();}}><Button size="small" danger>删除资料</Button></Popconfirm></>}
              </Space>
            </Card>
          ))}
        </div>
      ),
    },
  ];

  // 管理者可查看报名；归档课程仍可查看历史，但不可继续导入。
  if (course.can_manage) {
    tabItems.push({
      key: 'students',
      label: `选课学生 (${enrollments.length})`,
      children: (
        <div>
          {course.can_enroll && <Button type="dashed" icon={<PlusOutlined />} onClick={openImportModal} style={{ marginBottom: 16 }}>
            导入学生
          </Button>}
          <Table dataSource={enrollments} rowKey="id" pagination={false} size="small"
            columns={[
              { title: '姓名', dataIndex: 'student_name' },
              { title: '学校', dataIndex: 'school_name' },
              { title: '班级', dataIndex: 'class_name' },
              { title: '导入人', dataIndex: 'enrolled_by_name', render: (v) => v || '—' },
              ...(user?.role === 'admin' ? [{
                title: '操作', key: 'actions',
                render: (_, r) => (
                  <Button size="small" type="link" danger onClick={() => openRemoveModal(r)}>移除报名</Button>
                ),
              }] : []),
            ]}
          />
        </div>
      ),
    });
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/courses')}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>{course.title}</Title>
        {canEdit && course.status !== 'published' && (
          <Button type="primary" size="small" onClick={() => handleChangeStatus('published')}>发布课程</Button>
        )}
        {canEdit && course.status === 'published' && (
          <Button size="small" disabled={course.has_learning_history} title={course.has_learning_history ? '已有学习记录，请使用归档并先处理待评/待修改内容' : undefined} onClick={() => handleChangeStatus('draft')}>撤回为草稿</Button>
        )}
        {isStudent && isEnrolled && <Tag color="green">已选修</Tag>}
      </Space>

      {isStudent ? (
        <Card style={{ marginBottom: 16 }}>
          {/* 学生视角：线下课程主页 */}
          {(() => {
            const upcoming = lessons
              .filter((l) => l.status !== 'cancelled' && l.learning_in_scope !== false && l.start_at && new Date(l.start_at) >= Date.now() - 3600 * 1000)
              .sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)))[0];
            return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    {upcoming ? (
                      <>
                        <Text strong style={{ fontSize: 16 }}>📅 下一次上课：{upcoming.start_at.replace('T', ' ')}</Text>
                        <br />
                        <Text type="secondary">
                          {upcoming.title}{upcoming.location ? ` · 📍 ${upcoming.location}` : ''}{upcoming.instructor_name ? ` · 👨‍🏫 ${upcoming.instructor_name}` : ''}
                        </Text>
                      </>
                    ) : (
                      <Text type="secondary">暂无排课安排</Text>
                    )}
                  </div>
                  <Space wrap>
                    <Tag>{lessons.filter((l) => l.status !== 'cancelled' && l.learning_in_scope !== false).length} 次线下课</Tag>
                    {course.completion?.completed && <Tag color="green">已结课 · {course.completion.completed_at}</Tag>}
                    <Tag>{tasks.length} 个课后任务</Tag>
                    <Tag>{resources.length} 份课堂资料</Tag>
                  </Space>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Space wrap>
                    <Button type="primary" disabled={!firstLearningLesson} onClick={() => navigate(`/courses/${id}/lessons/${firstLearningLesson.id}/learn`)}>继续课后学习</Button>
                    <Button onClick={() => navigate(`/dashboard/ai?course_id=${id}`)}>灵境小智</Button>
                  </Space>
                </div>
              </div>
            );
          })()}
        </Card>
      ) : (
        <Card style={{ marginBottom: 16 }}>
          <Descriptions column={2} size="small">
            <Descriptions.Item label="主题">{course.theme || '—'}</Descriptions.Item>
            <Descriptions.Item label="适用学段">{GRADE_LABELS[course.grade_level] || course.grade_level}</Descriptions.Item>
            <Descriptions.Item label="难度">{DIFFICULTY_LABELS[course.difficulty] || course.difficulty}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={course.status === 'published' ? 'green' : course.status === 'archived' ? 'default' : 'orange'}>{STATUS_LABELS[course.status] || course.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="创建者">{course.creator_name}</Descriptions.Item>
            <Descriptions.Item label="总课时">{course.total_hours || '—'}</Descriptions.Item>
          </Descriptions>
          {course.description && <p style={{ marginTop: 12 }}>{course.description}</p>}
        </Card>
      )}

      <Tabs items={tabItems} destroyOnHidden />

      {/* 添加课时 Modal */}
      <Modal title={editingLesson ? '编辑课时' : '添加课时'} open={lessonModal} confirmLoading={maintenanceSaving} onCancel={() => {if(!maintenanceBusy.current)setLessonModal(false);}} onOk={() => lessonForm.submit()}>
        <Form form={lessonForm} layout="vertical" disabled={maintenanceSaving} onFinish={handleAddLesson}>
          <Form.Item name="title" label="课时名称" rules={[{ required: true, whitespace:true }]}><Input maxLength={200} /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="duration" label="时长（分钟）"><Input type="number" /></Form.Item>
          <Form.Item name="start_at" label="上课时间"><Input type="datetime-local" /></Form.Item>
          <Form.Item name="end_at" label="下课时间"><Input type="datetime-local" /></Form.Item>
          <Form.Item name="location" label="上课地点"><Input placeholder="如：北航 XX 实验室" /></Form.Item>
          <Form.Item name="instructor_id" label="执行导师">
            <Select allowClear placeholder="选择执行导师"
              options={teachers.map((t) => ({ value: t.id, label: `${t.real_name}${t.role === 'academic_mentor' ? '（执行导师）' : ''}` }))} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加任务 Modal */}
      <Modal title={editingTask ? '编辑独立成果任务' : '添加独立成果任务'} open={taskModal} confirmLoading={maintenanceSaving} onCancel={() => {if(!maintenanceBusy.current)setTaskModal(false);}} onOk={() => taskForm.submit()}>
        <Form form={taskForm} layout="vertical" disabled={maintenanceSaving} onFinish={handleAddTask}>
          <Form.Item name="title" label="任务名称" rules={[{ required: true, whitespace:true }]}><Input maxLength={200}/></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="task_type" label="任务类型" initialValue="inquiry">
            <Select options={[['inquiry', '调研'], ['experiment', '实验'], ['creation', '创作'], ['reflection', '反思'], ['presentation', '展示']].map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="require_upload" valuePropName="checked" initialValue>
            <Checkbox>要求上传附件</Checkbox>
          </Form.Item>
          <Form.Item name="deadline" label="截止时间"><Input type="datetime-local" /></Form.Item>
        </Form>
      </Modal>
      {/* 上传/编辑回放 Modal */}
      <Modal
        title={editingReplay ? '编辑回放' : `上传本课时视频：${replayLesson?.title || ''}`}
        open={replayModal}
        onCancel={() => { if (!replayBusy.current) { replaySession.current++; setReplayModal(false); } }}
        onOk={() => replayForm.submit()}
        confirmLoading={replayUploading}
        closable={!replayUploading}
        maskClosable={!replayUploading}
        keyboard={!replayUploading}
        cancelButtonProps={{ disabled: replayUploading }}
        okText={editingReplay ? '保存信息' : '上传到本课时'}
        cancelText="取消"
      >
        {uploadNotice && <p role="status"><Text type="warning">{uploadNotice}</Text></p>}
        {!editingReplay && uploadNotice && !replayUploading && <Button loading={checkingUpload} onClick={checkReplayUpload}>查询上次上传结果</Button>}
        {!editingReplay && replayUploading && <Button danger onClick={() => replayAbort.current?.abort()}>停止上传并确认结果</Button>}
        <Form form={replayForm} layout="vertical" onFinish={handleReplaySubmit} disabled={replayUploading}>
          {!editingReplay && <p><Text strong>课程：{course.title} / 课时：{replayLesson?.title}</Text><br /><Text type="secondary">视频自动绑定此课时，无需再次选择；不会上传为课程共享回放。</Text></p>}
          <Form.Item name="title" label="回放标题" rules={[{ required: true, whitespace: true, message: '请输入回放标题' }]}>
            <Input placeholder="如：第 3 讲 机翼上反角实验" />
          </Form.Item>
          {!editingReplay && (
            <Form.Item label="视频文件" required>
              <Upload
                accept=".mp4,.webm"
                maxCount={1}
                disabled={replayUploading}
                beforeUpload={(file) => { const error = replayFileError(file); if (error) { message.error(error); return Upload.LIST_IGNORE; } setReplayFile(file); return false; }}
                onRemove={() => setReplayFile(null)}
                fileList={replayFile ? [{ uid: '-1', name: replayFile.name }] : []}
              >
                <Button icon={<UploadOutlined />}>选择视频（mp4/webm，≤500MB）</Button>
              </Upload>
            </Form.Item>
          )}
          {editingReplay?.lesson_id && <p><Text strong>所属课时：{replayLesson?.title || '原绑定课时'}</Text><br /><Text type="secondary">编辑视频信息不会改变课时归属；已开始学生仍使用原学习快照。</Text></p>}
          {editingReplay && !editingReplay.lesson_id && <Form.Item name="lesson_id" label="所属课时（历史共享回放可补绑定）" extra="保留历史共享视频，也可补绑定到课时；已开始学生仍使用原学习快照。"><Select allowClear options={lessons.filter((l) => l.status !== 'cancelled').map((l) => ({ label: l.title, value: l.id }))} /></Form.Item>}
          {replayUploading && (editingReplay ? <Text type="secondary">正在保存视频信息，请勿离开当前课程。</Text> : <><Progress percent={uploadPercent} status="active" /><Text type="secondary">{uploadPercent >= 100 ? '文件已传输，等待服务器确认保存。' : '正在上传，请勿离开当前课程。'} 上传期间不能修改或关闭表单。</Text></>)}
          <Form.Item name="description" label="视频简介" rules={[{ required: true, whitespace: true, message: '请填写视频简介' }]}><Input.TextArea rows={2} /></Form.Item>
          <Tabs items={[
            { key: 'edit', label: '编辑 Markdown', forceRender: true, children: <Form.Item name="summary" label="回放内容摘要（课程纪要）" extra="支持标题、加粗、列表、链接、代码块和表格；课程结束后可单独更新，无需重新上传视频。" rules={[{ max: 10000, message: '摘要不能超过 10000 个字符' }]}>
              <Input.TextArea rows={6} showCount maxLength={10000} placeholder={'## 课程纪要\n\n**重点知识**\n\n- 要点一\n- 要点二'} />
            </Form.Item> },
            { key: 'preview', label: '预览', children: <div style={{ marginBottom: 16 }}><ReplaySummary replay={{ summary: replaySummary }} /></div> },
          ]} />
          <Upload accept=".txt,.md" disabled={replayUploading} showUploadList={false} beforeUpload={async (file) => {
            const session = replaySession.current;
            if (!/\.(txt|md)$/i.test(file.name) || file.size > 100000) { message.error('请选择不超过 100KB 的 UTF-8 文本或 Markdown 文件'); return Upload.LIST_IGNORE; }
            try {
              const summary = await file.text();
              if (!mounted.current || session !== replaySession.current || replayBusy.current) return false;
              if (summary.length > 10000) message.error('摘要不能超过 10000 个字符');
              else { replayForm.setFieldValue('summary', summary); message.success('摘要已导入，请保存回放信息'); }
            } catch { message.error('无法读取摘要文件，请重试'); }
            return false;
          }}><Button icon={<UploadOutlined />} style={{ marginBottom: 16 }}>从文件导入摘要（.txt / .md）</Button></Upload>
          <Form.Item name="duration_seconds" label="时长（秒）"><Input type="number" min={1} /></Form.Item>
          <Form.Item name="recording_date" label="录制日期"><Input type="date" /></Form.Item>
          <Form.Item name="sort_order" label="排序（数字越小越靠前）"><Input type="number" min={0} /></Form.Item>
        </Form>
      </Modal>

      {/* 上传课程资料 Modal */}
      <Modal
        title={editingResource ? '编辑资料信息（不更换文件，历史快照保留）' : '上传课程资料'}
        open={resourceModal}
        onCancel={() => {if(!resourceUploading)setResourceModal(false);}}
        onOk={() => resourceForm.submit()}
        confirmLoading={resourceUploading}
      >
        <Form form={resourceForm} layout="vertical" disabled={resourceUploading} onFinish={handleResourceSubmit}>
          <Form.Item name="lesson_id" label="所属课时（不选择则为课程共享资料）"><Select allowClear options={lessons.filter((l) => l.status !== 'cancelled').map((l) => ({ label: l.title, value: l.id }))} /></Form.Item>
          <Form.Item name="description" label="资料说明"><Input.TextArea /></Form.Item>
          <Form.Item name="title" label="资料名称"><Input placeholder="如：第 1 讲讲义" /></Form.Item>
          <Form.Item name="resource_type" label="资料类型" initialValue="courseware">
            <Select options={Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          {!editingResource && <Form.Item label="文件" required>
            <Upload
              accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.pdf,.doc,.docx,.ppt,.pptx,.txt,.zip,.obj,.glb,.gltf,.stl"
              maxCount={1}
              beforeUpload={(file) => { setResourceFile(file); return false; }}
              onRemove={() => setResourceFile(null)}
              fileList={resourceFile ? [{ uid: '-1', name: resourceFile.name }] : []}
            >
              <Button icon={<UploadOutlined />}>选择文件（≤50MB）</Button>
            </Upload>
            <Typography.Text type="secondary">AI 知识库仅解析可提取文字的 PDF、DOCX、PPTX、TXT。旧版 DOC/PPT 需先转换；扫描版 PDF 需先 OCR。</Typography.Text>
          </Form.Item>}
        </Form>
      </Modal>
      {/* 导入学生 Modal（执行导师/管理员） */}
      <Modal
        title="导入学生"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onOk={handleImportSubmit}
        okText={`导入（已选 ${selectedKeys.length} 人）`}
        okButtonProps={{ disabled: selectedKeys.length === 0 }}
        confirmLoading={importing}
        width={680}
      >
        <Space style={{ marginBottom: 12 }} wrap>
          <Input.Search
            placeholder="搜索姓名/用户名" allowClear style={{ width: 200 }}
            onSearch={(v) => loadCandidates({ search: v || undefined, school_id: candidateSchool, class_id: candidateClass })}
          />
          <Select
            placeholder="按学校筛选" allowClear style={{ width: 180 }} value={candidateSchool}
            onChange={handleCandidateSchoolChange}
            options={schoolOptions.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Select
            placeholder="按班级筛选" allowClear style={{ width: 160 }} value={candidateClass}
            onChange={(v) => { setCandidateClass(v); loadCandidates({ search: undefined, school_id: candidateSchool, class_id: v }); }}
            options={candidateClasses.map((c) => ({ value: c.id, label: `${c.grade || ''} ${c.name}` }))}
          />
          <Button size="small" onClick={() => loadCandidates({ school_id: candidateSchool, class_id: candidateClass })}>查询</Button>
        </Space>
        <Table
          rowKey="id" size="small" loading={candidateLoading} dataSource={candidates}
          pagination={{ pageSize: 8 }} scroll={{ y: 320 }}
          rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
          columns={[
            { title: '姓名', dataIndex: 'real_name' },
            { title: '学校', dataIndex: 'school_name', render: (v) => v || '—' },
            { title: '班级', dataIndex: 'class_name', render: (v) => v || '—' },
          ]}
        />
      </Modal>

      {/* 管理员异常修正：移除报名 Modal */}
      <Modal
        title={`移除报名：${removeTarget?.student_name || ''}`}
        open={!!removeTarget}
        onCancel={() => setRemoveTarget(null)}
        onOk={handleRemoveSubmit}
        okText="确认移除"
        okButtonProps={{ danger: true }}
        confirmLoading={removeLoading}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          移除后该生将无法再访问课程与任务。该操作会记录在成长档案审计中；若该生已产生任何学习记录，系统将拒绝移除。
        </Text>
        <Input.TextArea
          rows={3}
          placeholder="请填写移除原因（必填，将随审计记录保存）"
          value={removeReason}
          onChange={(e) => setRemoveReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}
