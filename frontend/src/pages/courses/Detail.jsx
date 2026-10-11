import {copyText as siteText, copyTemplate as siteTemplate} from "../../content/copy";
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Card, Descriptions, Table, Button, Tag, Tabs, Form, Input, Modal, Result, Space, Typography, message, Checkbox, Select, Upload, Popconfirm } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, PlusOutlined, UploadOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { courseAPI, studentAPI, authAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import ContentMaintenance from './ContentMaintenance';
import {maintenanceText as c} from './maintenanceCopy';

const { Title, Text } = Typography;


const GRADE_LABELS = { primary: siteText("site.915e2ea85c7ce8af"), junior: siteText("site.1fa6b3e6d10c1e1d"), senior: siteText("site.74bf169b5a9e05ba") };
const DIFFICULTY_LABELS = { basic: siteText("site.f266a529f1e7e8d2"), advanced: siteText("site.51d5932003a89c23"), challenge: siteText("site.51031a148ed65878") };
const STATUS_LABELS = { draft: siteText("site.04248d0f2f479939"), published: siteText("site.20cbdcda701a2e89"), archived: siteText("site.dc47afd16bc5d23b") };
const RESOURCE_TYPE_LABELS = {
  lesson_plan: siteText("site.c5c3f9aeaa4ce1ba"), guide_card: siteText("site.4e8455bcf26e60ae"), template: siteText("site.c807d31728957e93"),
  courseware: siteText("site.1e519a121604edfc"), video: siteText("site.1a67bc5b8cb35bd5"), other: siteText("site.7c07df51a5eaa747"),
};

export default function CourseDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search,setSearch]=useSearchParams();
  const requestRevision=useRef(0);
  const [course, setCourse] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [lessons, setLessons] = useState([]);
  const [resources, setResources] = useState([]);
  const [replays, setReplays] = useState([]);
  const [replayUrl, setReplayUrl] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [lessonModal, setLessonModal] = useState(false);
  const [taskModal, setTaskModal] = useState(false);
  const [activeLesson, setActiveLesson] = useState(null);
  const [replayModal, setReplayModal] = useState(false);
  const [editingReplay, setEditingReplay] = useState(null);
  const [replayFile, setReplayFile] = useState(null);
  const [replayUploading, setReplayUploading] = useState(false);
  const [resourceModal, setResourceModal] = useState(false);
  const [resourceFile, setResourceFile] = useState(null);
  const [resourceUploading, setResourceUploading] = useState(false);
  const [lessonForm] = Form.useForm();
  const [taskForm] = Form.useForm();
  const [replayForm] = Form.useForm();
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
    const revision=++requestRevision.current;
    setPageLoading(true);
    setLoadError('');
    try {
      const res = await courseAPI.detail(id);
      if(revision!==requestRevision.current)return;
      setCourse(res.course);
      setLessons(res.lessons || []);
      setResources(res.resources || []);
      courseAPI.listReplays(id).then((replayRes) => {if(revision===requestRevision.current)setReplays(replayRes.replays || []);}).catch(() => {});
      setEnrollments(res.enrollments || []);
      setTasks(res.tasks || []);
      setTeachers(res.teachers || []);
    } catch (err) {
      if(revision!==requestRevision.current)return;
      setCourse(null);
      setLoadError(err?.response?.data?.error || siteText("site.2dff4fe99bd33a63"));
    } finally {
      if(revision===requestRevision.current)setPageLoading(false);
    }
  };

  // 页面首次进入时加载完整详情；loadData 会在异步回调中更新多个状态。
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { loadData(); return()=>{requestRevision.current++;}; }, [id]);

  const handleAddLesson = async (values) => {
    try {
      await courseAPI.addLesson(id, values);
      message.success(siteText("site.aedcc7ad1fa4519e"));
      setLessonModal(false);
      lessonForm.resetFields();
      loadData();
    } catch { /* handled */ }
  };

  const handleAddTask = async (values) => {
    try {
      await courseAPI.addTask(activeLesson.id, values);
      message.success(siteText("site.4b5970447d3bcea5"));
      setTaskModal(false);
      taskForm.resetFields();
      loadData();
    } catch { /* handled */ }
  };

  const downloadResource = async (r) => {
    try {
      const blob = await courseAPI.downloadResource(r.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = r.title || siteText("site.4902db407c8b5af0");
      anchor.click();
      URL.revokeObjectURL(url);
    } catch { /* handled */ }
  };

  const playReplay = async (replayId) => {
    try {
      // 签名流式地址直挂 <video>：支持 Range 拖动，避免整段 blob 下载
      const res = await courseAPI.streamUrl(replayId);
      setReplayUrl(res.url);
    } catch { /* handled */ }
  };

  const refreshReplays = () => {
    courseAPI.listReplays(id).then((res) => setReplays(res.replays || [])).catch(() => {});
  };

  const openReplayModal = (replay = null) => {
    setEditingReplay(replay);
    setReplayFile(null);
    replayForm.resetFields();
    if (replay) {
      replayForm.setFieldsValue({
        title: replay.title,
        description: replay.description,
        duration_seconds: replay.duration_seconds,
        recording_date: replay.recording_date,
        sort_order: replay.sort_order,
      });
    }
    setReplayModal(true);
  };

  const handleReplaySubmit = async (values) => {
    if (!editingReplay && !replayFile) {
      message.error(siteText("site.c2214999f69ce78a"));
      return;
    }
    setReplayUploading(true);
    try {
      if (editingReplay) {
        await courseAPI.updateReplay(editingReplay.id, values);
        message.success(siteText("site.4dc7e394e242fd27"));
      } else {
        const formData = new FormData();
        formData.append('file', replayFile);
        formData.append('title', values.title);
        formData.append('description', values.description || '');
        formData.append('duration_seconds', values.duration_seconds || '');
        formData.append('recording_date', values.recording_date || '');
        formData.append('sort_order', values.sort_order || '0');
        await courseAPI.uploadReplay(id, formData);
        message.success(siteText("site.ea99ac4cb53583fb"));
      }
      setReplayModal(false);
      refreshReplays();
    } catch { /* handled */ } finally {
      setReplayUploading(false);
    }
  };

  const handleDeleteReplay = async (replayId) => {
    try {
      await courseAPI.deleteReplay(replayId);
      message.success(siteText("site.890f350e75659b87"));
      if (replayUrl) setReplayUrl(null);
      refreshReplays();
    } catch { /* handled */ }
  };

  // 发布/撤回：不强制课程须有课时，仅在 0 课时时给提示
  const handleChangeStatus = (targetStatus) => {
    const apply = async () => {
      try {
        await courseAPI.update(id, { status: targetStatus });
        message.success(targetStatus === 'published' ? siteText("site.e5bd83eeb86bbb32") : siteText("site.79820bcc3250859e"));
        loadData();
      } catch { /* handled */ }
    };
    if (targetStatus === 'published' && lessons.length === 0) {
      Modal.confirm({
        title: siteText("site.8e2f4c50f92b7904"),
        content: siteText("site.04a00ace3bb993f2"),
        okText: siteText("site.8ea02d1fc1705315"), cancelText: siteText("site.c7d073fde6e4c69c"),
        onOk: apply,
      });
      return;
    }
    if (targetStatus === 'draft') {
      Modal.confirm({
        title: siteText("site.f34b4468f5ea2c6b"),
        content: siteText("site.9486385008b4b0fe"),
        okText: siteText("site.c995ba6f76b81102"), cancelText: siteText("site.e22a4167edd7f34b"),
        onOk: apply,
      });
      return;
    }
    apply();
  };

  const openResourceModal = () => {
    setResourceFile(null);
    resourceForm.resetFields();
    setResourceModal(true);
  };

  // ==== 选课导入 ====
  const loadCandidates = async (query = {}) => {
    setCandidateLoading(true);
    try {
      const res = await courseAPI.enrollCandidates(id, query);
      setCandidates(res.students || []);
    } catch { /* handled */ } finally {
      setCandidateLoading(false);
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
    setCandidateSchool(sid);
    setCandidateClass(undefined);
    if (sid) {
      try {
        const res = await studentAPI.getClasses(sid);
        setCandidateClasses(res.classes || []);
      } catch { setCandidateClasses([]); }
    } else {
      setCandidateClasses([]);
    }
  };

  const handleImportSubmit = async () => {
    if (selectedKeys.length === 0) {
      message.warning(siteText("site.2d649e0bbd6a81a5"));
      return;
    }
    setImporting(true);
    try {
      const res = await courseAPI.enroll(id, selectedKeys);
      message.success(res.message || siteTemplate("site.e14c5b851bc2293a", {slot0: (res.added)}));
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
      message.warning(siteText("site.d9fa4b1c578aebde"));
      return;
    }
    setRemoveLoading(true);
    try {
      await courseAPI.removeEnrollment(id, removeTarget.id, removeReason.trim());
      message.success(siteText("site.6864a632392055a3"));
      setRemoveTarget(null);
      loadData();
    } catch { /* handled */ } finally {
      setRemoveLoading(false);
    }
  };

  const handleResourceSubmit = async (values) => {
    if (!resourceFile) {
      message.error(siteText("site.cab7e3595e158720"));
      return;
    }
    setResourceUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', resourceFile);
      formData.append('title', values.title || '');
      formData.append('resource_type', values.resource_type || 'courseware');
      await courseAPI.uploadResource(id, formData);
      message.success(siteText("site.85ab24305a450143"));
      setResourceModal(false);
      loadData();
    } catch { /* handled */ } finally {
      setResourceUploading(false);
    }
  };

  if (!course||String(course.id)!==String(id)) return pageLoading
    ? <div style={{ padding: 24 }}><Card loading /></div>
    : <Result status={loadError.includes('无权') ? '403' : '404'} title={siteText("site.c02911e9c1fd083a")} subTitle={loadError} extra={<Space><Button onClick={() => navigate('/courses')}>{siteText("site.897cdc66aa4c5c61")}</Button><Button type="primary" onClick={loadData}>{siteText("site.b10cc60cc2f17883")}</Button></Space>} />;

  const isStudent = user?.role === 'student';
  const isEnrolled = isStudent && enrollments.some((e) => e.student_id === user.id);
  const firstLearningLesson = lessons.find((lesson) => lesson.status !== 'cancelled');

  const tabItems = [
    ...(course.can_manage?[{key:'maintenance',label:c('title'),children:<ContentMaintenance key={id} id={id}/>}]:[]),
    {
      key: 'lessons', label: siteText("site.da605a00c0cc8f39"),
      children: (
        <div>
          {course.can_manage && (
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => setLessonModal(true)} style={{ marginBottom: 16 }}>{siteText("site.fefe81c54427efe9")}</Button>
          )}
          {lessons.map((lesson) => (
            <Card key={lesson.id} size="small" style={{ marginBottom: 8 }} title={lesson.title}
              extra={<Space>
                {isEnrolled && <Button type="primary" size="small" onClick={() => navigate(`/courses/${course.id}/lessons/${lesson.id}/learn`)}>{siteText("site.7cbfd4a69b6bd74e")}</Button>}
                {course.can_manage && <Button type="primary" size="small" onClick={() => navigate(`/courses/${course.id}/lessons/${lesson.id}/content`)}>{siteText("site.bb84a46624582e70")}</Button>}
                {course.can_manage && <Button size="small" onClick={() => { setActiveLesson(lesson); setTaskModal(true); }}>{siteText("site.b0aa5aee80b7fa54")}</Button>}
              </Space>}
            >
              {lesson.description && <p>{lesson.description}</p>}
              <Space wrap size={[4, 0]}>
                {lesson.duration && <Tag>{lesson.duration}{siteText("site.3b8590060236e9d8")}</Tag>}
                {lesson.start_at && <Tag color="blue">{siteText("site.a1cddcd6c59eb5bc")}{lesson.start_at.replace('T', ' ')}</Tag>}
                {lesson.location && <Tag color="green">{siteText("site.e022dc43a291c7c7")}{lesson.location}</Tag>}
                {lesson.instructor_name && <Tag>{siteText("site.14a915e6ecc03d59")}{lesson.instructor_name}</Tag>}
              </Space>
              {tasks.filter((task) => task.lesson_id === lesson.id).map((task) => <div key={task.id} style={{ marginTop: 8 }}><Link to={`/tasks/${task.id}`}>{task.title}</Link>{task.deadline && <Tag style={{ marginLeft: 8 }}>{siteText("site.b13857ca6ccf3773")}{task.deadline}</Tag>}</div>)}
            </Card>
          ))}
        </div>
      ),
    },
    {
      key: 'replays', label: siteText("site.d9187a1e51d156a9"),
      children: (
        <div>
          {course.can_manage && user.role==='admin' && (
            <Button type="dashed" icon={<UploadOutlined />} onClick={() => openReplayModal()} style={{ marginBottom: 16 }}>{siteText("site.a03bcadc6f427197")}</Button>
          )}
          {replayUrl && <video controls src={replayUrl} style={{ width: '100%', maxHeight: 420, marginBottom: 16 }} />}
          {replays.length === 0 ? (
            <Typography.Text type="secondary">{siteText("site.999eaf8d1129e1db")}</Typography.Text>
          ) : replays.map((replay) => (
            <Card key={replay.id} size="small" style={{ marginBottom: 8 }}
              extra={course.can_manage && (
                <Space size={4}>
                  <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openReplayModal(replay)}>{siteText("site.3be380b766bc89c7")}</Button>
                  <Popconfirm title={siteText("site.e0427eaf97caa346")} okText={siteText("site.112c8da10fb2fc22")} cancelText={siteText("site.e22a4167edd7f34b")} onConfirm={() => handleDeleteReplay(replay.id)}>
                    <Button size="small" type="link" danger icon={<DeleteOutlined />}>{siteText("site.631573e93be5f4cf")}</Button>
                  </Popconfirm>
                </Space>
              )}
            >
              <Space>
                <span>{replay.title}</span>
                {replay.recording_date && <Tag>{replay.recording_date}</Tag>}
                {replay.duration_seconds && <Tag>{Math.round(replay.duration_seconds / 60)}{siteText("site.3b8590060236e9d8")}</Tag>}
                <Button size="small" type="link" onClick={() => playReplay(replay.id)}>{siteText("site.f84d9738a00e4415")}</Button>
              </Space>
            </Card>
          ))}
        </div>
      ),
    },
    {
      key: 'resources', label: siteText("site.3e044f87f3feccbe"),
      children: (
        <div>
          {course.can_manage && (
            <Space style={{ marginBottom: 16 }}>
              <Button type="dashed" icon={<UploadOutlined />} onClick={openResourceModal}>{siteText("site.c08b0c09523e5703")}</Button>
              <Button onClick={() => navigate(`/courses/${id}/ai-knowledge`)}>{siteText("site.263bba4fd46502bf")}</Button>
            </Space>
          )}
          {resources.length === 0 ? (
            <Typography.Text type="secondary">{siteText("site.085f6dae2da392eb")}</Typography.Text>
          ) : resources.map((r) => (
            <Card key={r.id} size="small" style={{ marginBottom: 8 }}>
              <Space>
                <Tag>{RESOURCE_TYPE_LABELS[r.resource_type] || r.resource_type}</Tag>
                <span>{r.title}</span>
                {r.has_file && (
                  <Button size="small" type="link" icon={<DownloadOutlined />} onClick={() => downloadResource(r)}>{siteText("site.cd605a47fc086d92")}</Button>
                )}
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
      label: siteTemplate("site.1855c2b52efc1b42", {slot0: (enrollments.length)}),
      children: (
        <div>
          {course.can_enroll && <Button type="dashed" icon={<PlusOutlined />} onClick={openImportModal} style={{ marginBottom: 16 }}>{siteText("site.8d2d0f2814c2bb12")}</Button>}
          <Table dataSource={enrollments} rowKey="id" pagination={false} size="small"
            columns={[
              { title: siteText("site.7cc5822b69416ce2"), dataIndex: 'student_name' },
              { title: siteText("site.cc937981f7d3ce49"), dataIndex: 'school_name' },
              { title: siteText("site.9ef404bec164f565"), dataIndex: 'class_name' },
              { title: siteText("site.b7ad43ba120a0833"), dataIndex: 'enrolled_by_name', render: (v) => v || '—' },
              ...(user?.role === 'admin' ? [{
                title: siteText("site.9f6296c8ef30b865"), key: 'actions',
                render: (_, r) => (
                  <Button size="small" type="link" danger onClick={() => openRemoveModal(r)}>{siteText("site.7af36450c6a484ec")}</Button>
                ),
              }] : []),
            ]}
          />
        </div>
      ),
    });
  }

  return (
    <div className={course.can_manage?'course-maintenance-page':undefined}>
      <Space className="course-detail-header" style={{ marginBottom: 16 }}>
        <Link className="ant-btn ant-btn-default" to="/courses"><ArrowLeftOutlined/>{siteText("site.2b2602fe97ea824d")}</Link>
        <Title level={4} style={{ margin: 0 }}>{course.title}</Title>
        {course.can_manage && course.status !== 'published' && (
          <Button type="primary" size="small" onClick={() => handleChangeStatus('published')}>{siteText("site.ad9e34aa52b0b6e6")}</Button>
        )}
        {course.can_manage && course.status === 'published' && (
          <Button size="small" onClick={() => handleChangeStatus('draft')}>{siteText("site.64c911e2e80f6704")}</Button>
        )}
        {isStudent && isEnrolled && <Tag color="green">{siteText("site.ae2a3b18e87b22b3")}</Tag>}
        {isStudent && isEnrolled && firstLearningLesson && <Button type="primary" onClick={() => navigate(`/courses/${id}/lessons/${firstLearningLesson.id}/learn`)}>{siteText("site.11b1c4c4c18d18a4")}</Button>}
        {isStudent && isEnrolled && <Button type="link" onClick={() => navigate(`/dashboard/ai?course_id=${id}`)}>{siteText("site.a240a3a770a5bcff")}</Button>}
      </Space>

      {isStudent ? (
        <Card style={{ marginBottom: 16 }}>
          {/* 学生视角：线下课程主页 */}
          {(() => {
            const upcoming = lessons
              .filter((l) => l.start_at && new Date(l.start_at) >= Date.now() - 3600 * 1000)
              .sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)))[0];
            return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    {upcoming ? (
                      <>
                        <Text strong style={{ fontSize: 16 }}>{siteText("site.687e685bda795096")}{upcoming.start_at.replace('T', ' ')}</Text>
                        <br />
                        <Text type="secondary">
                          {upcoming.title}{upcoming.location ? ` · 📍 ${upcoming.location}` : ''}{upcoming.instructor_name ? ` · 👨‍🏫 ${upcoming.instructor_name}` : ''}
                        </Text>
                      </>
                    ) : (
                      <Text type="secondary">{siteText("site.8944919bb84ebbbc")}</Text>
                    )}
                  </div>
                  <Space wrap>
                    <Tag>{lessons.length}{siteText("site.8db3bc495c5934e1")}</Tag>
                    <Tag>{tasks.length}{siteText("site.11559bef23a71a7d")}</Tag>
                    <Tag>{resources.length}{siteText("site.197c51376e154c20")}</Tag>
                  </Space>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Space wrap>
                    <Button type="primary" disabled={!firstLearningLesson} onClick={() => navigate(`/courses/${id}/lessons/${firstLearningLesson.id}/learn`)}>{siteText("site.fa2c7e0671985094")}</Button>
                    <Button onClick={() => navigate(`/dashboard/ai?course_id=${id}`)}>{siteText("site.a240a3a770a5bcff")}</Button>
                  </Space>
                </div>
              </div>
            );
          })()}
        </Card>
      ) : (
        <Card style={{ marginBottom: 16 }}>
          <Descriptions column={2} size="small">
            <Descriptions.Item label={siteText("site.49a8a615cf6059c2")}>{course.theme || '—'}</Descriptions.Item>
            <Descriptions.Item label={siteText("site.af8cc19b47947748")}>{GRADE_LABELS[course.grade_level] || course.grade_level}</Descriptions.Item>
            <Descriptions.Item label={siteText("site.9dc48f0148d99859")}>{DIFFICULTY_LABELS[course.difficulty] || course.difficulty}</Descriptions.Item>
            <Descriptions.Item label={siteText("site.7271ab6693f110e3")}><Tag color={course.status === 'published' ? 'green' : course.status === 'archived' ? 'default' : 'orange'}>{STATUS_LABELS[course.status] || course.status}</Tag></Descriptions.Item>
            <Descriptions.Item label={siteText("site.e097bc496098bb01")}>{course.creator_name}</Descriptions.Item>
            <Descriptions.Item label={siteText("site.ed42d8611e8bbbf1")}>{course.total_hours || '—'}</Descriptions.Item>
          </Descriptions>
          {course.description && <p style={{ marginTop: 12 }}>{course.description}</p>}
        </Card>
      )}

      <Tabs activeKey={tabItems.some(item=>item.key===search.get('tab'))?search.get('tab'):tabItems[0].key} onChange={key=>setSearch({tab:key},{replace:true})} items={tabItems} destroyOnHidden={false}/>

      {/* 添加课时 Modal */}
      <Modal title={siteText("site.5196dad269ecb896")} open={lessonModal} onCancel={() => setLessonModal(false)} onOk={() => lessonForm.submit()}>
        <Form name="course-add-lesson" form={lessonForm} layout="vertical" onFinish={handleAddLesson}>
          <Form.Item name="title" label={siteText("site.aeab0b361a5b12cd")} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label={siteText("site.11d1ce5aaed10e89")}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="duration" label={siteText("site.8e7a7f1c84586481")}><Input type="number" /></Form.Item>
          <Form.Item name="start_at" label={siteText("site.4f022f7e3f45379e")}><Input type="datetime-local" /></Form.Item>
          <Form.Item name="end_at" label={siteText("site.e430a5bb677f246f")}><Input type="datetime-local" /></Form.Item>
          <Form.Item name="location" label={siteText("site.54e6311a084c22d6")}><Input placeholder={siteText("site.c9dfa057df4ffef5")} /></Form.Item>
          <Form.Item name="instructor_id" label={siteText("site.4d2fcd604d171006")}>
            <Select allowClear placeholder={siteText("site.6fbb320ac590c0a7")}
              options={teachers.map((t) => ({ value: t.id, label: `${t.real_name}${t.role === 'academic_mentor' ? siteText("site.93acd22f8d8d1880") : ''}` }))} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加任务 Modal */}
      <Modal title={siteText("site.9886a9520506bd4a")} open={taskModal} onCancel={() => setTaskModal(false)} onOk={() => taskForm.submit()}>
        <Form name="course-add-task" form={taskForm} layout="vertical" onFinish={handleAddTask}>
          <Form.Item name="title" label={siteText("site.7116edd08327c83e")} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label={siteText("site.11d1ce5aaed10e89")}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="task_type" label={siteText("site.b2c1b05dc0234230")} initialValue="inquiry">
            <Select options={[['inquiry', '调研'], ['experiment', '实验'], ['creation', '创作'], ['reflection', '反思'], ['presentation', '展示']].map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="require_upload" valuePropName="checked" initialValue>
            <Checkbox>{siteText("site.e62392330f330902")}</Checkbox>
          </Form.Item>
          <Form.Item name="deadline" label={siteText("site.4cb827754c771853")}><Input type="datetime-local" /></Form.Item>
        </Form>
      </Modal>
      {/* 上传/编辑回放 Modal */}
      <Modal
        title={editingReplay ? siteText("site.fded6c93a3178971") : siteText("site.56fecedcb656feae")}
        open={replayModal}
        onCancel={() => setReplayModal(false)}
        onOk={() => replayForm.submit()}
        confirmLoading={replayUploading}
      >
        <Form name="course-replay" form={replayForm} layout="vertical" onFinish={handleReplaySubmit}>
          <Form.Item name="title" label={siteText("site.fa48a8381177028f")} rules={[{ required: true, message: siteText("site.b13f5c72c867a33d") }]}>
            <Input placeholder={siteText("site.f700a95cbcca2664")} />
          </Form.Item>
          {!editingReplay && (
            <Form.Item label={siteText("site.ebc4e83bde075517")} required>
              <Upload
                accept=".mp4,.webm"
                maxCount={1}
                beforeUpload={(file) => { setReplayFile(file); return false; }}
                onRemove={() => setReplayFile(null)}
                fileList={replayFile ? [{ uid: '-1', name: replayFile.name }] : []}
              >
                <Button icon={<UploadOutlined />}>{siteText("site.c9e0b965e5d43561")}</Button>
              </Upload>
            </Form.Item>
          )}
          <Form.Item name="description" label={siteText("site.bf27f6738755a67e")}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="duration_seconds" label={siteText("site.9b2b59ed8d6a4a4d")}><Input type="number" min={1} /></Form.Item>
          <Form.Item name="recording_date" label={siteText("site.423c18eabf100c54")}><Input type="date" /></Form.Item>
          <Form.Item name="sort_order" label={siteText("site.df2f829f992f1b4c")}><Input type="number" min={0} /></Form.Item>
        </Form>
      </Modal>

      {/* 上传课程资料 Modal */}
      <Modal
        title={siteText("site.660b0292fc93d53d")}
        open={resourceModal}
        onCancel={() => setResourceModal(false)}
        onOk={() => resourceForm.submit()}
        confirmLoading={resourceUploading}
      >
        <Form form={resourceForm} layout="vertical" onFinish={handleResourceSubmit}>
          <Form.Item name="title" label={siteText("site.1b5d943b1d92d50b")}><Input placeholder={siteText("site.6526e59c7db323b2")} /></Form.Item>
          <Form.Item name="resource_type" label={siteText("site.bfbcad199b0422a2")} initialValue="courseware">
            <Select options={Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item label={siteText("site.9369b36b24652b4a")} required>
            <Upload
              accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.pdf,.doc,.docx,.ppt,.pptx,.txt,.zip,.obj,.glb,.gltf,.stl"
              maxCount={1}
              beforeUpload={(file) => { setResourceFile(file); return false; }}
              onRemove={() => setResourceFile(null)}
              fileList={resourceFile ? [{ uid: '-1', name: resourceFile.name }] : []}
            >
              <Button icon={<UploadOutlined />}>{siteText("site.fbf7edda6f07e5c2")}</Button>
            </Upload>
            <Typography.Text type="secondary">{siteText("site.20863779519d334a")}</Typography.Text>
          </Form.Item>
        </Form>
      </Modal>
      {/* 导入学生 Modal（执行导师/管理员） */}
      <Modal
        title={siteText("site.8b75c392697bd92d")}
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onOk={handleImportSubmit}
        okText={siteTemplate("site.e89a14c2a7dab7fd", {slot0: (selectedKeys.length)})}
        okButtonProps={{ disabled: selectedKeys.length === 0 }}
        confirmLoading={importing}
        width={680}
      >
        <Space style={{ marginBottom: 12 }} wrap>
          <Input.Search
            placeholder={siteText("site.4a2756b726bf5c72")} allowClear style={{ width: 200 }}
            onSearch={(v) => loadCandidates({ search: v || undefined, school_id: candidateSchool, class_id: candidateClass })}
          />
          <Select
            placeholder={siteText("site.50925fa6938c5046")} allowClear style={{ width: 180 }} value={candidateSchool}
            onChange={handleCandidateSchoolChange}
            options={schoolOptions.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Select
            placeholder={siteText("site.fe64a764abedeaf2")} allowClear style={{ width: 160 }} value={candidateClass}
            onChange={(v) => { setCandidateClass(v); loadCandidates({ search: undefined, school_id: candidateSchool, class_id: v }); }}
            options={candidateClasses.map((c) => ({ value: c.id, label: `${c.grade || ''} ${c.name}` }))}
          />
          <Button size="small" onClick={() => loadCandidates({ school_id: candidateSchool, class_id: candidateClass })}>{siteText("site.1921df656c6e27c8")}</Button>
        </Space>
        <Table
          rowKey="id" size="small" loading={candidateLoading} dataSource={candidates}
          pagination={{ pageSize: 8 }} scroll={{ y: 320 }}
          rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
          columns={[
            { title: siteText("site.7cc5822b69416ce2"), dataIndex: 'real_name' },
            { title: siteText("site.cc937981f7d3ce49"), dataIndex: 'school_name', render: (v) => v || '—' },
            { title: siteText("site.9ef404bec164f565"), dataIndex: 'class_name', render: (v) => v || '—' },
          ]}
        />
      </Modal>

      {/* 管理员异常修正：移除报名 Modal */}
      <Modal
        title={siteTemplate("site.c77da5bc102ef95c", {slot0: (removeTarget?.student_name || '')})}
        open={!!removeTarget}
        onCancel={() => setRemoveTarget(null)}
        onOk={handleRemoveSubmit}
        okText={siteText("site.1d3177bb1eacaf96")}
        okButtonProps={{ danger: true }}
        confirmLoading={removeLoading}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>{siteText("site.4e04893643352b86")}</Text>
        <Input.TextArea
          rows={3}
          placeholder={siteText("site.44f94a35f36c9737")}
          value={removeReason}
          onChange={(e) => setRemoveReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}
