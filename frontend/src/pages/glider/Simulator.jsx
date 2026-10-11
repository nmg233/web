import {copyText as siteText, copyTemplate as siteTemplate} from "../../content/copy";
import { useCourseApis, useCourseId } from '../../student/useCourseApis';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Row, Col, Card, Form, Button, Tag, Space, Spin, message,
  Statistic, Alert, List, Typography, Empty, Result,
} from 'antd';
import { ArrowLeftOutlined, RocketOutlined } from '@ant-design/icons';
import { formatBeijingTime } from '../../utils/date';
import { useAuth } from '../../store/AuthContext';
import { resolveExperimentReturn } from '../../student/experimentContext';
import useGliderRecords from './useGliderRecords';
import { stateMeta, STATE_TIPS } from './gliderModel';
import StudentGliderWorkspace from '../../student/StudentGliderWorkspace';
import { STUDENT_COURSES_CHANGED } from '../../student/accessPolicy';

const { Title, Text } = Typography;

export default function GliderSimulator() {
  const { courseAPI, learningAPI, gliderAPI } = useCourseApis();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const scopedCourse = useCourseId();
  const sourceCourse = scopedCourse || params.get('course_id');
  const sourceLesson = params.get('lesson_id');
  const requestedReturn = params.get('returnTo') || (scopedCourse ? '/courses/'+scopedCourse+'/lab' : null);
  const sourceKey = JSON.stringify([sourceCourse, sourceLesson, requestedReturn]);
  const { user } = useAuth();
  const [form] = Form.useForm();
  const records = useGliderRecords();
  const { history, loadingHistory, historyError, loadHistory, viewingId, viewing, waitSec, pollFailed, pollTimedOut, openRecord, revision } = records;
  const [img, setImg] = useState({ trajectory: null, telemetry: null, video: null });
  const [resultFileError, setResultFileError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [engineInfo, setEngineInfo] = useState(null);
  const [engineError, setEngineError] = useState(null);
  // 试飞课程/课时关联（决策 D-7）
  const [courses, setCourses] = useState([]);
  const [contextError, setContextError] = useState('');
  const [contextLoading, setContextLoading] = useState(!!sourceCourse);
  const [courseId, setCourseId] = useState(undefined);
  const [lessons, setLessons] = useState([]);
  const [lessonId, setLessonId] = useState(undefined);
  const [returnTo, setReturnTo] = useState('/lab');
  const [returning, setReturning] = useState(false);
  const [checkedSource, setCheckedSource] = useState(null);
  const contextPending = user?.role === 'student' && (contextLoading || checkedSource !== sourceKey);

  const verifySource = () => resolveExperimentReturn({ courseId: sourceCourse, lessonId: sourceLesson, returnTo: requestedReturn }, { course: courseAPI.detail, lesson: learningAPI.lesson });
  const returnToSource = async () => {
    if (user?.role !== 'student') { navigate('/dashboard'); return; }
    if (!sourceCourse) { navigate('/lab'); return; }
    setReturning(true);
    try {
      const resolution = await verifySource();
      if (resolution.reason) message.warning(resolution.reason);
      navigate(resolution.path, { state: { experimentNotice: resolution.reason } });
    } finally { setReturning(false); }
  };

  const [engineAttempt, setEngineAttempt] = useState(0);
  // 进入页面检测引擎就绪状态（结果缓存于后端 60s）
  // 注意：探测失败不能静默吞掉——否则按钮看似可用、点击却毫无反应，排查成本极高
  useEffect(() => {
    let alive = true;
    gliderAPI.capabilities()
      .then((res) => { if (alive) { setEngineInfo(res); setEngineError(null); } })
      .catch((err) => {
        if (!alive) return;
        setEngineInfo(null);
        setEngineError(err?.response?.data?.error || err?.message || siteText("site.428e31905bab5aee"));
      });
    return () => { alive = false; };
  }, [engineAttempt,gliderAPI]);

  // 不自动选中课程；独立进入不产生课程关联。
  useEffect(() => {
    if (user?.role !== 'student') return undefined;
    let alive = true;
    courseAPI.list()
      .then((res) => {
        if (!alive) return;
        const list = res.courses || [];
        setCourses(list);
        if (sourceCourse) {
          resolveExperimentReturn({ courseId: sourceCourse, lessonId: sourceLesson, returnTo: requestedReturn }, { course: courseAPI.detail, lesson: learningAPI.lesson }).then((resolution) => {
            if (!alive) return;
            setReturnTo(resolution.path);
            if (!resolution.available) { setContextError(resolution.reason.replaceAll('已返回', '请返回')); setCourseId(undefined); setLessonId(undefined); setLessons([]); return; }
            setContextError('');
            setCourseId(Number(sourceCourse)); setLessons(resolution.detail.lessons || []);
            setLessonId(sourceLesson ? Number(sourceLesson) : undefined);
            form.setFieldsValue({ course_id: Number(sourceCourse), lesson_id: sourceLesson ? Number(sourceLesson) : undefined });
          }).catch(() => { if (alive) setContextError(siteText("site.b0276bfc62d1ef2a")); })
            .finally(() => { if (alive) { setContextLoading(false); setCheckedSource(sourceKey); } });
        } else {
          setContextError(''); setCourseId(undefined); setLessonId(undefined); setLessons([]); setReturnTo('/lab');
          form.setFieldsValue({ course_id: undefined, lesson_id: undefined });
          setContextLoading(false); setCheckedSource(sourceKey);
        }
      })
      .catch(() => {
        if (!alive) return;
        if (sourceCourse) setContextError(siteText("site.b0276bfc62d1ef2a"));
        else { setContextError(''); setCourseId(undefined); setLessonId(undefined); setLessons([]); setReturnTo('/lab'); form.setFieldsValue({ course_id: undefined, lesson_id: undefined }); }
        setContextLoading(false); setCheckedSource(sourceKey);
      });
    return () => { alive = false; };
  }, [user?.role, form, sourceCourse, sourceLesson, requestedReturn, sourceKey,courseAPI,learningAPI]);

  useEffect(() => {
    const updateCourses = (event) => {
      const { courses: availableCourses = [], removedCourseIds = [] } = event.detail || {};
      setCourses(availableCourses);
      if (!removedCourseIds.some((id) => String(id) === String(sourceCourse || courseId))) return;
      setCourseId(undefined); setLessonId(undefined); setLessons([]);
      form.setFieldsValue({ course_id: undefined, lesson_id: undefined });
      if (sourceCourse) {
        setContextError(siteText("site.6791e4f7be701e0c"));
        setReturnTo('/lab');
      } else message.warning(siteText("site.68a8803fb16c7298"));
    };
    window.addEventListener(STUDENT_COURSES_CHANGED, updateCourses);
    return () => window.removeEventListener(STUDENT_COURSES_CHANGED, updateCourses);
  }, [courseId, form, sourceCourse]);

  const handleCourseChange = async (value) => {
    setCourseId(value);
    setLessonId(undefined);
    form.setFieldValue('lesson_id', undefined);
    setLessons([]);
    if (!value) return;
    try {
      const res = await courseAPI.detail(value);
      setLessons(res.lessons || []);
    } catch { setLessons([]); }
  };

  // 模拟成功后加载结果图与飞行回放视频
  useEffect(() => {
    if (user?.role === 'student' || !viewing) return undefined;
    if (viewing.status !== 'success') {
      const t = setTimeout(() => { setImg({ trajectory: null, telemetry: null, video: null }); setResultFileError(''); }, 0);
      return () => clearTimeout(t);
    }
    let alive = true;
    const mimeOf = (name) => (name.endsWith('.mp4') ? 'video/mp4' : name.endsWith('.png') ? 'image/png' : 'application/octet-stream');
    const urls = [];
    const missingFiles = [];
    const load = async (name) => {
      try {
        const res = await gliderAPI.file(viewing.id, name);
        if (!alive) return null;
        const blob = new Blob([res], { type: mimeOf(name) });
        const url = URL.createObjectURL(blob);
        urls.push(url);
        return url;
      } catch { missingFiles.push(name === 'trajectory3d.png' ? siteText("site.00c55a397c1790c7") : siteText("site.974fcba694075a4b")); return null; }
    };
    // 视频改走签名流式地址：支持 Range 拖动，避免整段 blob 下载
    const loadVideo = async () => {
      try {
        const res = await gliderAPI.streamUrl(viewing.id);
        if (!alive || !res.url) return null;
        return res.url;
      } catch { missingFiles.push(siteText("site.d0ffe75e194fb4b0")); return null; }
    };
    const hasVideo = !!viewing.result?.files?.video;
    (async () => {
      const [trajectory, telemetry, video] = await Promise.all([
        load('trajectory3d.png'),
        load('flight_telemetry.png'),
        hasVideo ? loadVideo() : Promise.resolve(null),
      ]);
      if (alive) {
        setImg({ trajectory, telemetry, video });
        setResultFileError(missingFiles.length ? `${missingFiles.join('、')}暂时无法加载，可能文件已移除或网络中断。试飞参数和数值结果仍可查看，请刷新记录后重试。` : '');
      }
    })();
    // 卸载/切换记录时释放对象 URL，避免反复查看累积内存
    return () => {
      alive = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [viewing, user?.role, revision,gliderAPI]);

  const startSim = async (values) => {
    setSubmitting(true); setSubmitError('');
    try {
      if (contextError || contextPending) throw new Error(siteText("site.e26a9445c9427394"));
      if (sourceCourse) {
        const resolution = await verifySource();
        setReturnTo(resolution.path);
        if (!resolution.available) {
          setContextError(resolution.reason.replaceAll('已返回', '请返回'));
          setCourseId(undefined); setLessonId(undefined); setLessons([]);
          throw new Error(resolution.reason.replaceAll('已返回', '请返回'));
        }
      } else if (courseId) {
        const detail = await courseAPI.detail(courseId);
        if (lessonId && !detail.lessons.some((lesson) => String(lesson.id) === String(lessonId) && lesson.status !== 'cancelled')) throw new Error(siteText("site.8fb65cc05e0d15c1"));
      }
      const r = await gliderAPI.simulate({
        dihedral_deg: values.dihedral,
        cg_x: values.cg,
        speed: values.speed,
        wing_area: values.wing_area,
        mass: values.mass,
        elevator_deg: values.elevator,
        rudder_deg: values.rudder,
        course_id: courseId,
        lesson_id: courseId ? lessonId : undefined,
      });
      openRecord(r.id);
      message.success(siteText("site.fa04247e6adbbcaa"));
      loadHistory();
    } catch (err) {
      setSubmitError(err?.response?.data?.error || err?.message || siteText("site.d4e886021c1bfac5"));
    } finally {
      setSubmitting(false);
    }
  };

  const meta = useMemo(() => stateMeta(viewing?.state), [viewing]);
  const isStudent = user?.role === 'student';
  const engineChecking = !engineInfo && !engineError;
  const engineReady = engineInfo?.ready === true;
  const canSubmit = isStudent && engineReady && !contextError && !contextPending;
  const blockedReason = !isStudent
    ? ''
    : engineChecking
      ? siteText("site.f2fba4773aac84cb")
      : engineError
        ? `无法确认实验环境：${engineError}`
        : !engineReady
          ? siteText("site.1123cc8bb6d0596f")
          : contextPending ? siteText("site.8bc535ac2db22e5c") : contextError;

  if (isStudent) return <StudentGliderWorkspace
    form={form} records={records} startSim={startSim} submitting={submitting} submitError={submitError}
    engineChecking={engineChecking} engineReady={engineReady} canSubmit={canSubmit} blockedReason={blockedReason}
    retryEngine={() => { setEngineInfo(null); setEngineError(null); setEngineAttempt((value) => value + 1); }}
    sourceCourse={sourceCourse} sourceLesson={sourceLesson} courses={courses} lessons={lessons}
    courseId={courseId} lessonId={lessonId} handleCourseChange={handleCourseChange} setLessonId={setLessonId}
    returning={returning} contextPending={contextPending} contextError={contextError}
    returnsToCourse={!!(sourceCourse && (!contextError || returnTo !== '/lab'))}
    returnToSource={returnToSource} returnToLab={() => navigate(scopedCourse ? '/courses/'+scopedCourse+'/lab' : '/explore')}
  />;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} loading={returning} disabled={contextPending} onClick={returnToSource}>{sourceCourse && (!contextError || returnTo !== '/lab') ? siteText("site.fcac88f55af035f0") : siteText("site.3ffbecb304fc7936")}</Button>
        <Title level={4} style={{ margin: 0 }}>{siteText("site.2b453b69a79c8d29")}</Title>
      </Space>

      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message={isStudent ? siteText("site.114bf5fb739aa1fe") : siteText("site.2a484ebfa0edf256")}
        description={isStudent
          ? siteText("site.a512ca1ba76993f2")
          : user?.role === 'admin'
            ? siteText("site.2390d0741a774ea8")
            : user?.role === 'academic_mentor'
              ? siteText("site.5098f78b1c4ee658")
              : siteText("site.e792a9191476c13a")}
      />

      {isStudent && !engineChecking && blockedReason && (
        <Alert
          style={{ marginBottom: 16 }}
          type={engineError || contextError ? 'error' : 'warning'}
          showIcon
          message={siteText("site.10674eb72d174ed1")}
          description={blockedReason}
        />
      )}

      {isStudent && engineReady && engineInfo && !contextError && (
        <Alert
          style={{ marginBottom: 16 }}
          type="success"
          showIcon
          message={siteTemplate("site.79c0e290fcc179cf", {slot0: (engineInfo.detectedBackend === 'novaphy' ? siteText("site.6230c6b28be24fcc") : (engineInfo.detectedBackend || siteText("site.ce0c1538ff1b1b71")))})}
          description={siteText("site.adb54f7adb412db0")}
        />
      )}

      <Row gutter={16}>
        {/* 左侧：参数表单 + 结果 */}
        <Col xs={24} lg={15}>
          {/* 模拟结果 */}
          {viewingId && (
            <Card
              title={siteTemplate("site.d6fa5ee13a185373", {slot0: (viewingId)})}
              style={{ marginBottom: 16 }}
              extra={viewing?.status === 'running' ? <Tag color="processing">{siteText("site.fddc234f0f585556")}</Tag> : undefined}
            >
              {pollTimedOut ? (
                <Result status="warning" title={siteText("site.ef8234c60f8c6dd7")}
                  subTitle={siteText("site.193b30965f95edcf")} />
              ) : pollFailed ? (
                <Result status="warning" title={siteText("site.24948bd6ddac08b9")}
                  subTitle={siteText("site.8012163a44906ada")} />
              ) : !viewing ? (
                <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
                  <Spin size="large" />
                  <Text type="secondary">{siteText("site.368dc276a9b3b0ff")}</Text>
                </Space>
              ) : viewing.status === 'running' ? (
                  <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
                    <Spin size="large" />
                    <Text type="secondary">{siteText("site.2f3b09cf115a33a0")}{waitSec}{siteText("site.569034913ac19505")}</Text>
                  </Space>
                ) : viewing.status === 'error' ? (
                  <Result status="error" title={siteText("site.b6b4c8caf5360fc1")} subTitle={viewing.error || siteText("site.cdfa4a19c71e89a0")} />
                ) : (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Alert
                      type={meta.color === 'red' ? 'error' : meta.color === 'orange' ? 'warning' : 'success'}
                      showIcon
                      message={<Text strong>{siteText("site.49ae69a7b982c498")}{meta.label}</Text>}
                      description={STATE_TIPS[viewing.state] || siteText("site.8dd0110275d12be6")}
                    />
                    {resultFileError && <Alert type="warning" showIcon message={resultFileError} />}
                    <Row gutter={[8, 8]}>
                      <Col xs={12} sm={8}><Statistic title={siteText("site.65a134c3a6e631a5")} value={viewing.glide_time_s ?? '—'} suffix="s" /></Col>
                      <Col xs={12} sm={8}><Statistic title={siteText("site.b293dd8c171d72b1")} value={viewing.result?.distance_m ?? '—'} suffix="m" /></Col>
                      <Col xs={12} sm={8}><Statistic title={siteText("site.b55d5db2526856a9")} value={viewing.result?.glide_ratio ?? '—'} /></Col>
                      <Col xs={12} sm={8}><Statistic title={siteText("site.ed63934db8904a95")} value={viewing.result?.mean_sink_mps ?? '—'} suffix="m/s" /></Col>
                      <Col xs={12} sm={8}><Statistic title={siteText("site.2bfbba04b95b74a8")} value={viewing.result?.mean_speed_mps ?? '—'} suffix="m/s" /></Col>
                      <Col xs={12} sm={8}><Statistic title={siteText("site.f45a6470b2e2b897")} value={viewing.result?.alt_end ?? '—'} suffix="m" /></Col>
                    </Row>

                    {/* 历史记录回放（旧版后端生成的 MP4，仅早期记录有）。新试飞不再生成视频：
                        飞行回放将由前端基于逐帧轨迹数据渲染（three.js 接入中），
                        数据接口 GET /api/glider/simulations/:id/trace，指南见 simulation/glider/RENDER_API.md */}
                    {img.video && (
                      <Card size="small" title={siteText("site.e7d8ea495f0e08ec")} style={{ marginBottom: 16 }}>
                        <video
                          src={img.video}
                          controls
                          autoPlay
                          loop
                          muted
                          playsInline
                          onError={() => message.warning(siteText("site.60c57f61186d911e"))}
                          style={{ width: '100%', borderRadius: 6, background: '#000' }}
                        />
                        <Text type="secondary">{siteText("site.628c4df02a8369a5")}</Text>
                      </Card>
                    )}

                    {img.trajectory ? (
                      <Card size="small" title={siteText("site.60bb4c6a80e4ece5")}>
                        <img src={img.trajectory} alt={siteText("site.f79b9916b9561c3e")} style={{ width: '100%', borderRadius: 6 }} />
                      </Card>
                    ) : <Alert type="info" message={siteText("site.d1d047b130ed152f")} />}

                    {img.telemetry && (
                      <Card size="small" title={siteText("site.250ba1739133cf19")}>
                        <img src={img.telemetry} alt={siteText("site.69e754877f2c9e6c")} style={{ width: '100%', borderRadius: 6 }} />
                      </Card>
                    )}
                  </Space>
                )
              }
            </Card>
          )}
        </Col>

        {/* 右侧：试飞记录 */}
        <Col xs={24} lg={9}>
          <Card
            title={<Space><RocketOutlined /> {isStudent ? siteText("site.b5dfc4ecdd5d613c") : siteText("site.c587b4773ecc638f")}</Space>}
            extra={<Button size="small" onClick={loadHistory}>{siteText("site.c7bb63774c80fdc7")}</Button>}
          >
            {historyError && <Alert type="error" showIcon title={historyError} />}
            {loadingHistory ? <Spin /> : (
              history.length === 0 ? <Empty description={isStudent ? siteText("site.12c609982556dac6") : siteText("site.0f78bf8fc5463412")} /> : (
                <List
                  size="small"
                  dataSource={history}
                  renderItem={(item) => {
                    const m = stateMeta(item.state);
                    return (
                      <List.Item
                        onClick={() => openRecord(item.id)}
                        style={{ cursor: 'pointer', borderRadius: 6 }}
                      >
                        <List.Item.Meta
                          title={<Space>
                            <span>#{item.id}</span>
                            <Tag color={item.status === 'running' ? 'processing' : item.status === 'error' ? 'error' : m.color}>
                              {item.status === 'running' ? siteText("site.0fd29d1697388bae") : item.status === 'error' ? siteText("site.7ea4a9372bf8e2d9") : m.label}
                            </Tag>
                          </Space>}
                          description={
                            <Space wrap size={[4, 0]}>
                              <Text type="secondary">{siteText("site.9e50f808d0e56c5d")}{item.dihedral_deg}°</Text>
                              <Text type="secondary">{siteText("site.267cfee298fda338")}{item.cg_x > 0 ? '+' : ''}{item.cg_x} m</Text>
                              <Text type="secondary">{siteText("site.82c9050090b84186")}{item.speed} m/s</Text>
                              {item.wing_area != null && item.wing_area !== 17.5 && (
                                <Text type="secondary">{siteText("site.c2778d97f9e62972")}{item.wing_area} m²</Text>
                              )}
                              {item.mass != null && item.mass !== 420 && (
                                <Text type="secondary">{siteText("site.a73be7f47a0fda2d")}{item.mass} kg</Text>
                              )}
                              {item.elevator_deg ? <Text type="secondary">{siteText("site.48ea978c84421f9e")}{item.elevator_deg}°</Text> : null}
                              {item.rudder_deg ? <Text type="secondary">{siteText("site.845d34e8645f8dbf")}{item.rudder_deg}°</Text> : null}
                              {item.glide_time_s != null && <Text type="secondary">· {item.glide_time_s}s</Text>}
                            </Space>
                          }
                        />
                        <Text type="secondary" style={{ fontSize: 12 }}>{formatBeijingTime(item.created_at)}</Text>
                      </List.Item>
                    );
                  }}
                />
              )
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
