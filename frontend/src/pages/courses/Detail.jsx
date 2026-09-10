import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, Descriptions, Table, Button, Tag, Tabs, Form, Input, Modal, Space, Typography, message, Checkbox, Select, Upload, Popconfirm } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, PlusOutlined, UploadOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { courseAPI, studentAPI, authAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import PageLoading from '../../components/common/PageLoading';

const { Title, Text } = Typography;

const canManage = (role) => ['admin', 'academic_mentor'].includes(role);
const canImport = (role) => ['admin', 'academic_mentor'].includes(role);

const GRADE_LABELS = { primary: '小学', junior: '初中', senior: '高中' };
const DIFFICULTY_LABELS = { basic: '基础', advanced: '进阶', challenge: '挑战' };
const STATUS_LABELS = { draft: '草稿', published: '已发布', archived: '已归档' };
const RESOURCE_TYPE_LABELS = {
  lesson_plan: '教案', guide_card: '指导卡', template: '模板',
  courseware: '课件', video: '视频', other: '其他',
};

export default function CourseDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
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
  // 选课导入（执行导师/教师/管理员；教师限本校）
  const [importOpen, setImportOpen] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [importing, setImporting] = useState(false);
  const [lockedSchoolId, setLockedSchoolId] = useState(null);
  const [schoolOptions, setSchoolOptions] = useState([]);
  const [candidateSchool, setCandidateSchool] = useState(undefined);
  const [candidateClasses, setCandidateClasses] = useState([]);
  const [candidateClass, setCandidateClass] = useState(undefined);
  // 管理员异常修正：移除报名
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removeReason, setRemoveReason] = useState('');
  const [removeLoading, setRemoveLoading] = useState(false);

  const loadData = async () => {
    try {
      const res = await courseAPI.detail(id);
      setCourse(res.course);
      setLessons(res.lessons || []);
      setResources(res.resources || []);
      courseAPI.listReplays(id).then((replayRes) => setReplays(replayRes.replays || [])).catch(() => {});
      setEnrollments(res.enrollments || []);
      setTasks(res.tasks || []);
      setTeachers(res.teachers || []);
    } catch { message.error('加载失败'); }
  };

  // 页面首次进入时加载完整详情；loadData 会在异步回调中更新多个状态。
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, [id]);

  const handleAddLesson = async (values) => {
    try {
      await courseAPI.addLesson(id, values);
      message.success('课时添加成功');
      setLessonModal(false);
      lessonForm.resetFields();
      loadData();
    } catch { /* handled */ }
  };

  const handleAddTask = async (values) => {
    try {
      await courseAPI.addTask(activeLesson.id, values);
      message.success('任务添加成功');
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
      anchor.download = r.title || '课程资源';
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
      message.error('请选择回放视频文件（mp4/webm，≤500MB）');
      return;
    }
    setReplayUploading(true);
    try {
      if (editingReplay) {
        await courseAPI.updateReplay(editingReplay.id, values);
        message.success('回放信息已更新');
      } else {
        const formData = new FormData();
        formData.append('file', replayFile);
        formData.append('title', values.title);
        formData.append('description', values.description || '');
        formData.append('duration_seconds', values.duration_seconds || '');
        formData.append('recording_date', values.recording_date || '');
        formData.append('sort_order', values.sort_order || '0');
        await courseAPI.uploadReplay(id, formData);
        message.success('回放上传成功');
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
      message.success('回放已删除');
      if (replayUrl) setReplayUrl(null);
      refreshReplays();
    } catch { /* handled */ }
  };

  // 发布/撤回：不强制课程须有课时，仅在 0 课时时给提示
  const handleChangeStatus = (targetStatus) => {
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
      setLockedSchoolId(res.lockedSchoolId);
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
    if (user?.role !== 'teacher') {
      authAPI.getSchools()
        .then((res) => setSchoolOptions(Array.isArray(res) ? res : (res.schools || [])))
        .catch(() => {});
    }
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
    if (!resourceFile) {
      message.error('请选择资料文件（≤50MB）');
      return;
    }
    setResourceUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', resourceFile);
      formData.append('title', values.title || '');
      formData.append('resource_type', values.resource_type || 'courseware');
      await courseAPI.uploadResource(id, formData);
      message.success('资料上传成功');
      setResourceModal(false);
      loadData();
    } catch { /* handled */ } finally {
      setResourceUploading(false);
    }
  };

  if (!course) return <PageLoading />;

  const isStudent = user?.role === 'student';
  const isEnrolled = isStudent && enrollments.some((e) => e.student_id === user.id);

  const tabItems = [
    {
      key: 'lessons', label: '课时安排',
      children: (
        <div>
          {canManage(user?.role) && (
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => setLessonModal(true)} style={{ marginBottom: 16 }}>添加课时</Button>
          )}
          {lessons.map((lesson) => (
            <Card key={lesson.id} size="small" style={{ marginBottom: 8 }} title={lesson.title}
              extra={canManage(user?.role) && (
                <Button size="small" onClick={() => { setActiveLesson(lesson); setTaskModal(true); }}>+ 添加任务</Button>
              )}
            >
              {lesson.description && <p>{lesson.description}</p>}
              <Space wrap size={[4, 0]}>
                {lesson.duration && <Tag>{lesson.duration} 分钟</Tag>}
                {lesson.start_at && <Tag color="blue">上课 {lesson.start_at.replace('T', ' ')}</Tag>}
                {lesson.location && <Tag color="green">📍 {lesson.location}</Tag>}
                {lesson.instructor_name && <Tag>👨‍🏫 {lesson.instructor_name}</Tag>}
              </Space>
              {tasks.filter((task) => task.lesson_id === lesson.id).map((task) => <div key={task.id} style={{ marginTop: 8 }}><Link to={`/tasks/${task.id}`}>{task.title}</Link>{task.deadline && <Tag style={{ marginLeft: 8 }}>截止 {task.deadline}</Tag>}</div>)}
            </Card>
          ))}
        </div>
      ),
    },
    {
      key: 'replays', label: '课程回放',
      children: (
        <div>
          {canManage(user?.role) && (
            <Button type="dashed" icon={<UploadOutlined />} onClick={() => openReplayModal()} style={{ marginBottom: 16 }}>
              上传回放
            </Button>
          )}
          {replayUrl && <video controls src={replayUrl} style={{ width: '100%', maxHeight: 420, marginBottom: 16 }} />}
          {replays.length === 0 ? (
            <Typography.Text type="secondary">暂无课程回放</Typography.Text>
          ) : replays.map((replay) => (
            <Card key={replay.id} size="small" style={{ marginBottom: 8 }}
              extra={canManage(user?.role) && (
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
                {replay.recording_date && <Tag>{replay.recording_date}</Tag>}
                {replay.duration_seconds && <Tag>{Math.round(replay.duration_seconds / 60)} 分钟</Tag>}
                <Button size="small" type="link" onClick={() => playReplay(replay.id)}>播放</Button>
              </Space>
            </Card>
          ))}
        </div>
      ),
    },
    {
      key: 'resources', label: '课程资源',
      children: (
        <div>
          {canManage(user?.role) && (
            <Button type="dashed" icon={<UploadOutlined />} onClick={openResourceModal} style={{ marginBottom: 16 }}>
              上传资料
            </Button>
          )}
          {resources.length === 0 ? (
            <Typography.Text type="secondary">暂无课程资源</Typography.Text>
          ) : resources.map((r) => (
            <Card key={r.id} size="small" style={{ marginBottom: 8 }}>
              <Space>
                <Tag>{RESOURCE_TYPE_LABELS[r.resource_type] || r.resource_type}</Tag>
                <span>{r.title}</span>
                {r.has_file && (
                  <Button size="small" type="link" icon={<DownloadOutlined />} onClick={() => downloadResource(r)}>下载</Button>
                )}
              </Space>
            </Card>
          ))}
        </div>
      ),
    },
  ];

  // 选课学生页签：执行导师/教师/管理员可见（学生由统一导入，日常不可退课）
  if (canImport(user?.role)) {
    tabItems.push({
      key: 'students',
      label: `选课学生 (${enrollments.length})`,
      children: (
        <div>
          <Button type="dashed" icon={<PlusOutlined />} onClick={openImportModal} style={{ marginBottom: 16 }}>
            导入学生
          </Button>
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
        {canManage(user?.role) && course.status !== 'published' && (
          <Button type="primary" size="small" onClick={() => handleChangeStatus('published')}>发布课程</Button>
        )}
        {canManage(user?.role) && course.status === 'published' && (
          <Button size="small" onClick={() => handleChangeStatus('draft')}>撤回为草稿</Button>
        )}
        {isStudent && isEnrolled && <Tag color="green">已选修</Tag>}
        {isStudent && isEnrolled && <Button onClick={() => navigate(`/courses/${id}/learn`)}>开始学习</Button>}
        {isStudent && isEnrolled && <Button type="link" onClick={() => navigate('/dashboard/ai')}>灵境小智</Button>}
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
                    <Tag>{lessons.length} 次线下课</Tag>
                    <Tag>{tasks.length} 个课后任务</Tag>
                    <Tag>{resources.length} 份课堂资料</Tag>
                  </Space>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Space wrap>
                    <Button type="primary" onClick={() => navigate(`/courses/${id}/learn`)}>📖 进入课程回顾</Button>
                    <Button onClick={() => navigate('/dashboard/ai')}>灵境小智</Button>
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

      <Tabs items={tabItems} />

      {/* 添加课时 Modal */}
      <Modal title="添加课时" open={lessonModal} onCancel={() => setLessonModal(false)} onOk={() => lessonForm.submit()}>
        <Form form={lessonForm} layout="vertical" onFinish={handleAddLesson}>
          <Form.Item name="title" label="课时名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="duration" label="时长（分钟）"><Input type="number" /></Form.Item>
          <Form.Item name="start_at" label="上课时间"><Input type="datetime-local" /></Form.Item>
          <Form.Item name="end_at" label="下课时间"><Input type="datetime-local" /></Form.Item>
          <Form.Item name="location" label="上课地点"><Input placeholder="如：北航 XX 实验室" /></Form.Item>
          <Form.Item name="instructor_id" label="授课教师">
            <Select allowClear placeholder="选择授课教师（执行导师）"
              options={teachers.map((t) => ({ value: t.id, label: `${t.real_name}${t.role === 'academic_mentor' ? '（执行导师）' : ''}` }))} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加任务 Modal */}
      <Modal title="添加任务" open={taskModal} onCancel={() => setTaskModal(false)} onOk={() => taskForm.submit()}>
        <Form form={taskForm} layout="vertical" onFinish={handleAddTask}>
          <Form.Item name="title" label="任务名称" rules={[{ required: true }]}><Input /></Form.Item>
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
        title={editingReplay ? '编辑回放' : '上传回放'}
        open={replayModal}
        onCancel={() => setReplayModal(false)}
        onOk={() => replayForm.submit()}
        confirmLoading={replayUploading}
      >
        <Form form={replayForm} layout="vertical" onFinish={handleReplaySubmit}>
          <Form.Item name="title" label="回放标题" rules={[{ required: true, message: '请输入回放标题' }]}>
            <Input placeholder="如：第 3 讲 机翼上反角实验" />
          </Form.Item>
          {!editingReplay && (
            <Form.Item label="视频文件" required>
              <Upload
                accept=".mp4,.webm"
                maxCount={1}
                beforeUpload={(file) => { setReplayFile(file); return false; }}
                onRemove={() => setReplayFile(null)}
                fileList={replayFile ? [{ uid: '-1', name: replayFile.name }] : []}
              >
                <Button icon={<UploadOutlined />}>选择视频（mp4/webm，≤500MB）</Button>
              </Upload>
            </Form.Item>
          )}
          <Form.Item name="description" label="简介"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="duration_seconds" label="时长（秒）"><Input type="number" min={1} /></Form.Item>
          <Form.Item name="recording_date" label="录制日期"><Input type="date" /></Form.Item>
          <Form.Item name="sort_order" label="排序（数字越小越靠前）"><Input type="number" min={0} /></Form.Item>
        </Form>
      </Modal>

      {/* 上传课程资料 Modal */}
      <Modal
        title="上传课程资料"
        open={resourceModal}
        onCancel={() => setResourceModal(false)}
        onOk={() => resourceForm.submit()}
        confirmLoading={resourceUploading}
      >
        <Form form={resourceForm} layout="vertical" onFinish={handleResourceSubmit}>
          <Form.Item name="title" label="资料名称"><Input placeholder="如：第 1 讲讲义" /></Form.Item>
          <Form.Item name="resource_type" label="资料类型" initialValue="courseware">
            <Select options={Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item label="文件" required>
            <Upload
              accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.pdf,.doc,.docx,.ppt,.pptx,.zip,.obj,.glb,.gltf,.stl"
              maxCount={1}
              beforeUpload={(file) => { setResourceFile(file); return false; }}
              onRemove={() => setResourceFile(null)}
              fileList={resourceFile ? [{ uid: '-1', name: resourceFile.name }] : []}
            >
              <Button icon={<UploadOutlined />}>选择文件（≤50MB）</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
      {/* 导入学生 Modal（执行导师/教师/管理员） */}
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
          {user?.role === 'teacher' ? (
            <Tag color="blue">仅本校学生{lockedSchoolId ? '（已锁定学校范围）' : ''}</Tag>
          ) : (
            <>
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
            </>
          )}
          {user?.role !== 'teacher' && (
            <Button size="small" onClick={() => loadCandidates({ school_id: candidateSchool, class_id: candidateClass })}>查询</Button>
          )}
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
          移除后该生将无法再访问课程与任务。该操作会记录在成长档案审计中；若该生已产生作品/评价/反思，系统将拒绝移除。
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
