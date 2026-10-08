import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Button, Card, Checkbox, Collapse, Descriptions, Empty, Form, Grid, Input, Modal,
  Progress, Radio, Space, Steps, Tag, Typography, message,
} from 'antd';
import {
  ArrowLeftOutlined, CheckCircleOutlined, DownloadOutlined,
  LeftOutlined, PlayCircleOutlined, RightOutlined,
} from '@ant-design/icons';
import { courseAPI, learningAPI } from '../../api';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';
import { LEARNING_STEPS, REPORT_STATUS } from '../../constants/status';
import { useAuth } from '../../store/AuthContext';
import MarkdownContent from '../../components/common/MarkdownContent';
import ReplaySummary from '../../components/common/ReplaySummary';
import ExerciseFeedback from '../../components/learning/ExerciseFeedback';
import { clearReportDraft, reportDraftKey, restoreReportDraft, saveReportDraft } from '../../utils/reportDraft';

const { Paragraph, Text, Title } = Typography;

function nextStage(data) {
  if (!data?.progress?.review_completed) return 0;
  if (!data.progress.cards_done) return 1;
  if (!data.report || data.report.status === 'rejected') return 2;
  return 3;
}

function Exercise({ exercise, onDone }) {
  const [answer, setAnswer] = useState(exercise.student_answer ?? (exercise.question_type === 'multiple_choice' ? [] : exercise.question_type === 'fill_blank' && exercise.blank_count ? Array(exercise.blank_count).fill('') : ''));
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const hasAnswer = Array.isArray(answer) ? answer.length > 0 && answer.every((value) => String(value).trim().length > 0) : typeof answer === 'string' ? answer.trim().length > 0 : answer !== null && answer !== undefined;
  const locked = exercise.attempted || Boolean(result) || submitting;
  const submit = async () => {
    if (locked || !hasAnswer) return;
    setSubmitting(true);
    try {
      const next = await learningAPI.submitExercise(exercise.id, answer);
      setResult(next);
      await onDone();
    } catch { /* handled by the request client */ }
    finally { setSubmitting(false); }
  };
  const options = (exercise.options || []).map((item, index) => typeof item === 'object'
    ? { label: item.label ?? item.text, value: item.value ?? item.key ?? String(index) }
    : { label: item, value: item });
  let input = <Input.TextArea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={2} disabled={locked} placeholder="填写答案" />;
  if (exercise.question_type === 'single_choice') input = <Radio.Group options={options} disabled={locked} value={answer} onChange={(event) => setAnswer(event.target.value)} />;
  if (exercise.question_type === 'multiple_choice') input = <Checkbox.Group disabled={locked} options={options} value={answer} onChange={setAnswer} />;
  if (exercise.question_type === 'true_false') input = <Radio.Group disabled={locked} options={[{ label: '正确', value: true }, { label: '错误', value: false }]} value={answer} onChange={(event) => setAnswer(event.target.value)} />;
  if (exercise.question_type === 'fill_blank' && exercise.blank_count) {
    input = <Space direction="vertical">{Array.from({ length: exercise.blank_count }, (_, i) => <Input key={i} disabled={locked} placeholder={`第 ${i + 1} 空`} value={Array.isArray(answer) ? answer[i] : answer} onChange={(event) => {
      const values = Array.isArray(answer) ? [...answer] : Array(exercise.blank_count).fill(''); values[i] = event.target.value; setAnswer(values);
    }} />)}</Space>;
  }
  return <Card size="small" style={{ marginTop: 12 }}>
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space><Text strong>{exercise.prompt}</Text><Tag>{exercise.points} 分</Tag></Space>
      {!exercise.attempted && <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, width: '100%' }}>{input}</fieldset>}
      {!exercise.attempted && !result && <Alert type="info" showIcon message="本题只有一次作答机会，提交后不能修改" />}
      {!exercise.attempted && !result && <Button type="primary" size="small" onClick={submit} loading={submitting} disabled={locked || !hasAnswer}>提交答案</Button>}
      <ExerciseFeedback exercise={exercise} result={result} />
    </Space>
  </Card>;
}

export default function LessonLearn() {
  const {courseId,lessonId}=useParams();
  const {user}=useAuth();
  return <LessonLearnContent key={`${user?.id}:${courseId}:${lessonId}`} />;
}

function LessonLearnContent() {
  const { courseId, lessonId } = useParams();
  const { user } = useAuth();
  const location=useLocation();
  const page=location.pathname+location.search;
  const onPage=()=>page===window.location.pathname+window.location.search;
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeStage, setActiveStage] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [replayUrl, setReplayUrl] = useState('');
  const [activeReplayId, setActiveReplayId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  const [reflectionExpanded, setReflectionExpanded] = useState(['reflection']);
  const [form] = Form.useForm();
  const reportDialog = useRef(null);
  const requests = useRef({ route: String(lessonId), load: 0, play: 0, epoch:0 });
  const video = useRef(null);
  const resume = useRef({ position: 0, playing: false });
  const [videoError, setVideoError] = useState('');
  const draftKey = reportDraftKey(user?.id, lessonId, data?.report?.id);

  const playReplay = async (replayId, refresh = false) => {
    const state = requests.current;
    if (state.route !== String(lessonId) || !onPage()) return;
    const sequence = ++state.play;
    resume.current = refresh ? { position: video.current?.currentTime || 0, playing: video.current ? !video.current.paused : false } : { position: 0, playing: false };
    setActiveReplayId(replayId); setVideoError('');
    try {
      const result = await courseAPI.streamUrl(replayId);
      if (state.route === String(lessonId) && sequence === state.play && onPage()) setReplayUrl(result.url);
    } catch {
      if (state.route === String(lessonId) && sequence === state.play && onPage()) { setReplayUrl(''); setVideoError('视频无法播放，请重新获取播放地址或联系导师。'); }
    }
  };

  const load = async ({ resetReplay = false } = {}) => {
    const state = requests.current;
    if (state.route !== String(lessonId) || !onPage()) return;
    const sequence = ++state.load;
    const current = () => state.route === String(lessonId) && sequence === state.load && onPage();
    setLoading(true); setError('');
    if (resetReplay) { setData(null); setReplayUrl(''); setActiveReplayId(null); setDraftSaveFailed(false); }
    try {
      const payload = await learningAPI.lesson(lessonId);
      if (!current()) return;
      setData(payload); setActiveStage(nextStage(payload));
      setCardIndex((index) => resetReplay ? Math.max(0, payload.cards.findIndex((c) => !c.completed)) : Math.min(index, Math.max(0, payload.cards.length - 1)));
      if ((resetReplay || !activeReplayId) && payload.replays?.length) await playReplay(payload.replays[0].id);
      if (!current()) return;
      if (!payload.report || payload.report.status === 'rejected') {
        form.resetFields();
        form.setFieldsValue(restoreReportDraft(localStorage, reportDraftKey(user?.id, lessonId, payload.report?.id), payload.report, payload.reflection));
      }
    } catch (err) {
      if (!current()) return;
      setData(null); setError(err?.response?.data?.error || '无法加载本课时，请检查报名和发布状态。');
    } finally { if (current()) setLoading(false); }
  };

  useEffect(() => {
    const state = requests.current;
    state.route = String(lessonId);
    state.epoch++;
    // 路由切换必须同步清空上一课时，以免展示或操作错误的对象。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load({ resetReplay: true });
    return () => {
      state.route = null; state.load++; state.play++; state.epoch++;
      reportDialog.current?.destroy(); reportDialog.current=null;
    };
  }, [lessonId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeReplayId) return undefined;
    const timer = setInterval(() => playReplay(activeReplayId, true), 480000);
    return () => clearInterval(timer);
  }, [activeReplayId, lessonId]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishReview = async () => {
    const state=requests.current,epoch=state.epoch;
    const current=()=>state.route===String(lessonId) && state.epoch===epoch && onPage();
    setSubmitting(true);
    try {
      await learningAPI.completeReview(lessonId);
      if(!current()) return;
      message.success('课堂回顾已完成，继续学习知识卡片');
      await load();
    } finally { if(current()) setSubmitting(false); }
  };

  const finishCard = async (card) => {
    const state=requests.current,epoch=state.epoch;
    const current=()=>state.route===String(lessonId) && state.epoch===epoch && onPage();
    setSubmitting(true);
    try {
      await learningAPI.completeCard(card.id);
      if(!current()) return;
      const isLast = cardIndex === data.cards.length - 1;
      if (!isLast) setCardIndex(cardIndex + 1);
      message.success(isLast ? '全部知识卡片已完成' : '本卡片已完成，继续下一张');
      await load();
    } finally { if(current()) setSubmitting(false); }
  };

  const downloadResource = async (resource) => {
    try {
      const blob = await courseAPI.downloadResource(resource.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const extension = resource.download_name?.match(/\.[^.]+$/)?.[0] || '';
      const title = resource.title || '课堂资料';
      anchor.href = url; anchor.download = extension && !title.toLowerCase().endsWith(extension.toLowerCase()) ? title + extension : title; anchor.click();
      URL.revokeObjectURL(url);
    } catch { /* handled by the request client */ }
  };

  const submitReport = (values) => {
    const state=requests.current,epoch=state.epoch;
    const current=()=>state.route===String(lessonId) && state.epoch===epoch && onPage();
    reportDialog.current = Modal.confirm({
      title: '确认提交学习报告？',
      content: '提交后进入导师评审；若导师退回，可根据意见提交新版本。',
      onOk: async () => {
        if (!current()) throw new Error('页面已切换，请重新确认');
        setSubmitting(true);
        try {
          await learningAPI.submitReport(lessonId, { report: values, reflection: values.reflection, base_report_id: data.report?.id ?? null });
          if(!current()) return;
          message.success('学习报告已提交，等待执行导师评审');
          clearReportDraft(localStorage, draftKey);
          form.resetFields(); await load();
        } finally { if(current()) setSubmitting(false); }
      },
    });
  };

  if (!data || data.lesson.id !== Number(lessonId)) return <PageContainer title="课后学习" extra={<Button onClick={() => navigate('/tasks')}>返回课后任务</Button>}><AsyncPageState loading={loading} error={error} onRetry={load}><Empty /></AsyncPageState></PageContainer>;

  const { lesson, cards = [], progress = {}, report } = data;
  const currentStep = nextStage(data);
  const activeCard = cards[Math.min(Math.max(cardIndex,0),Math.max(cards.length-1,0))];
  const cardExercisesDone = activeCard?.exercises?.every((exercise) => exercise.attempted) ?? false;
  const stageItems = LEARNING_STEPS.map((title, index) => ({ title, status: index < currentStep ? 'finish' : index === currentStep ? 'process' : 'wait', disabled: index > currentStep }));

  return <PageContainer title={lesson.title} description={`${data.course.title} · 按顺序完成三阶段课后学习并等待导师评审`} extra={<Space><Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tasks')}>返回课后任务</Button><Button onClick={() => navigate(`/courses/${courseId}`)}>课程详情</Button></Space>}>
    <div className="learning-workbench">
      <Card className="learning-sticky content-card" title="学习流程"><Steps direction={screens.md ? 'vertical' : 'horizontal'} size="small" current={currentStep} onChange={setActiveStage} items={stageItems} /></Card>
      <div>
        {report?.resubmission_required && <Alert type="warning" showIcon message="历史内容已补齐，请先完成新增学习，再提交新版报告" description="旧报告保留在历史中，不再进行评审；已有作答和成绩不变。" style={{marginBottom:16}} />}
        {data.content_version?.legacy_compat && <Alert type="warning" showIcon message="此课时使用兼容快照；部分历史题目可能无法完整还原，原作答与成绩已保留。" description={data.content_version?.repair ? `管理员已补齐缺失内容：${data.content_version.repair.reason}。已有作答与次数保持不变。` : null} style={{ marginBottom: 16 }} />}
        {activeStage === 0 && <Card className="content-card">
          <Title level={4}>第一阶段：课堂回顾</Title>
          <Paragraph type="secondary">观看课堂回放、回顾本课内容，并按需下载配套资料。完成后请在页面底部确认。</Paragraph>
          <Card size="small" title="课堂回放" style={{ marginBottom: 16 }}>
            {replayUrl ? <video ref={video} key={replayUrl} controls src={replayUrl} onLoadedMetadata={() => {
              if (video.current && resume.current.position) video.current.currentTime = resume.current.position;
              if (video.current && resume.current.playing) video.current.play().catch(() => {});
            }} onError={() => setVideoError('播放中断或链接已过期，请刷新播放地址继续观看。')} style={{ width: '100%', maxHeight: 460, marginBottom: 16, background: '#000', borderRadius: 8 }} /> : <Empty description="本课时暂无课堂回放" />}
            <Space wrap>{data.replays.map((replay) => <Button key={replay.id} type={activeReplayId === replay.id ? 'primary' : 'default'} icon={<PlayCircleOutlined />} onClick={() => playReplay(replay.id)}>{replay.title}</Button>)}</Space>
            {videoError && <Alert type="warning" message={videoError} action={<Button onClick={() => playReplay(activeReplayId, true)}>刷新播放地址</Button>} />}
            {data.replays.find((r) => r.id === activeReplayId)?.description && <Paragraph>{data.replays.find((r) => r.id === activeReplayId).description}</Paragraph>}
            <ReplaySummary replay={data.replays.find((replay) => replay.id === activeReplayId)} />
          </Card>
          <Card size="small" title="配套资料" style={{ marginBottom: 24 }}>
            {data.resources.length === 0 ? <Empty description="本课时暂无配套资料" /> : data.resources.map((resource) => <Card key={resource.id} size="small" style={{ marginBottom: 8 }}><Space wrap style={{ justifyContent: 'space-between', width: '100%' }}><span><Text strong>{resource.title}</Text>{resource.description && <Text type="secondary"> · {resource.description}</Text>}</span>{resource.has_file && <Button icon={<DownloadOutlined />} onClick={() => downloadResource(resource)}>下载资料</Button>}</Space></Card>)}
          </Card>
          {progress.review_completed ? <Alert type="success" showIcon message="课堂回顾已完成" action={<Button onClick={() => setActiveStage(1)}>继续知识卡片</Button>} /> : <Button type="primary" size="large" block loading={submitting} onClick={finishReview}>我已完成课堂回顾</Button>}
        </Card>}

        {activeStage === 1 && <><Title level={4}>第二阶段：知识卡片与配套练习</Title>
          {!progress.review_completed && <Alert type="warning" showIcon message="请先完成课堂回顾" />}
          {cards.length === 0 ? <Alert type="warning" showIcon message="管理员尚未发布知识卡片" description="本阶段不会自动完成。请联系管理员发布本课时的知识卡片后再继续。" /> : <>
            <Card size="small" style={{ marginBottom: 12 }}><Space wrap>{cards.map((card, index) => <Button key={card.id} type={index === cardIndex ? 'primary' : 'default'} icon={card.completed ? <CheckCircleOutlined /> : null} onClick={() => setCardIndex(index)} disabled={index > 0 && !cards[index - 1].completed}>{index + 1}. {card.title}</Button>)}</Space></Card>
            <Card className="content-card" title={<Space>{activeCard.completed && <CheckCircleOutlined style={{ color: '#52c41a' }} />}{activeCard.title}<Tag color="blue">{cardIndex + 1}/{cards.length}</Tag></Space>}>
              {activeCard.summary && <Paragraph type="secondary">{activeCard.summary}</Paragraph>}
              <MarkdownContent>{activeCard.content}</MarkdownContent>
              {activeCard.key_points && <Alert type="info" message="关键要点" description={activeCard.key_points} style={{ marginBottom: 12 }} />}
              {activeCard.common_mistakes && <Alert type="warning" message="常见误区" description={activeCard.common_mistakes} style={{ marginBottom: 12 }} />}
              {(activeCard.exercises || []).map((exercise) => <Exercise key={exercise.id} exercise={exercise} onDone={load} />)}
              {!cardExercisesDone && <Alert type="info" showIcon message="作答全部配套练习后可结束本卡片；每题只有一次机会" style={{ marginTop: 16 }} />}
              <Space style={{ marginTop: 20, justifyContent: 'space-between', width: '100%' }}><Button icon={<LeftOutlined />} disabled={cardIndex === 0} onClick={() => setCardIndex(cardIndex - 1)}>上一张</Button>{activeCard.completed ? <Button type="primary" icon={<RightOutlined />} disabled={cardIndex === cards.length - 1} onClick={() => setCardIndex(cardIndex + 1)}>下一张</Button> : <Button type="primary" loading={submitting} disabled={!cardExercisesDone} onClick={() => finishCard(activeCard)}>我已学完本卡片</Button>}</Space>
            </Card>
            {progress.cards_done && <Button type="primary" size="large" block style={{ marginTop: 16 }} onClick={() => setActiveStage(2)}>下一步：学习报告与反思</Button>}
          </>}
        </>}

        {activeStage === 2 && <><Title level={4}>第三阶段：学习报告与反思</Title><Card className="content-card">
          {report && <Alert type={report.status === 'rejected' ? 'warning' : 'success'} showIcon message={`第 ${report.version} 版：${REPORT_STATUS[report.status]?.label || report.status}${Number.isInteger(report.score) ? ` · ${report.score} 分` : ''}`} description={report.review_comment} style={{ marginBottom: 16 }} />}
          {(!report || report.status === 'rejected') && <Form form={form} layout="vertical" onFinish={submitReport} onFinishFailed={() => setReflectionExpanded(['reflection'])} disabled={!progress.report_unlocked || submitting} onValuesChange={(_, values) => setDraftSaveFailed(!saveReportDraft(localStorage, draftKey, values))}>
            <Alert type="info" showIcon message="填写内容会自动保存在当前浏览器，提交成功后自动清除草稿。" style={{ marginBottom: 16 }} />
            {draftSaveFailed && <Alert type="warning" showIcon message="浏览器无法保存草稿，请保持页面打开并提交，避免丢失修改。" style={{ marginBottom: 16 }} />}
            <Form.Item name="summary" label="学习总结" rules={[{ required: true, whitespace: true, message: '请填写学习总结' }]}><Input.TextArea rows={4} maxLength={5000} /></Form.Item>
            <Form.Item name="key_points" label="关键收获"><Input.TextArea rows={2} maxLength={5000} /></Form.Item><Form.Item name="application" label="应用设想"><Input.TextArea rows={2} maxLength={5000} /></Form.Item><Form.Item name="difficulties" label="困难与疑问"><Input.TextArea rows={2} maxLength={5000} /></Form.Item><Form.Item name="next_plan" label="下一步计划"><Input.TextArea rows={2} maxLength={5000} /></Form.Item>
            <Collapse activeKey={reflectionExpanded} onChange={setReflectionExpanded} items={[{ key: 'reflection', label: '结构化反思（必填）', forceRender: true, children: <><Form.Item name={['reflection', 'difficulty']} label="遇到的困难" rules={[{ required: true, whitespace: true, message: '请填写遇到的困难' }]}><Input.TextArea maxLength={2000} /></Form.Item><Form.Item name={['reflection', 'solution']} label="解决方式"><Input.TextArea maxLength={2000} /></Form.Item><Form.Item name={['reflection', 'improvement']} label="可以改进之处"><Input.TextArea maxLength={2000} /></Form.Item><Form.Item name={['reflection', 'new_question']} label="新的问题"><Input.TextArea maxLength={2000} /></Form.Item></> }]} style={{ marginBottom: 16 }} />
            {!progress.report_unlocked && <Alert type="warning" message="完成课堂回顾、全部知识卡片与配套练习后才能提交报告" style={{ marginBottom: 12 }} />}
            <Button type="primary" size="large" htmlType="submit" loading={submitting}>{report?.status === 'rejected' ? `重新提交第 ${report.version + 1} 版报告与反思` : '提交学习报告与反思'}</Button>
          </Form>}
          {report && report.status !== 'rejected' && <Button type="primary" style={{ marginTop: 16 }} onClick={() => setActiveStage(3)}>查看导师评审状态</Button>}
        </Card></>}

        {activeStage === 3 && <Card className="content-card" title="导师评审"><Alert type={report?.status === 'approved' ? 'success' : report?.status === 'rejected' ? 'warning' : 'info'} showIcon message={report ? `第 ${report.version} 版 · ${REPORT_STATUS[report.status]?.label}${Number.isInteger(report.score) ? ` · ${report.score} 分` : ''}` : '尚未提交学习报告'} description={report?.review_comment || (report?.status === 'submitted' ? '第三阶段已完成，报告正在等待执行导师评审。' : '完成前三个阶段后进入导师评审。')} />{report?.status === 'rejected' && <Button type="primary" style={{ marginTop: 16 }} onClick={() => setActiveStage(2)}>返回第三阶段修改</Button>}
          {report && <Descriptions title="本次提交内容" column={1} bordered size="small" style={{ marginTop: 16, whiteSpace: 'pre-wrap' }} items={[
            { key: 'summary', label: '学习总结', children: report.summary },
            { key: 'key_points', label: '关键收获', children: report.key_points || '-' },
            { key: 'application', label: '应用设想', children: report.application || '-' },
            { key: 'difficulties', label: '困难与疑问', children: report.difficulties || '-' },
            { key: 'next_plan', label: '下一步计划', children: report.next_plan || '-' },
            { key: 'difficulty', label: '遇到的困难', children: data.reflection?.difficulty || '-' },
            { key: 'solution', label: '解决方式', children: data.reflection?.solution || '-' },
            { key: 'improvement', label: '可以改进之处', children: data.reflection?.improvement || '-' },
            { key: 'new_question', label: '新的问题', children: data.reflection?.new_question || '-' },
          ]} />}
        </Card>}
      </div>
      <Card className="learning-sticky content-card" title="本课时进度"><Progress type="circle" percent={progress.percent || 0} /><Paragraph style={{ marginTop: 16 }}>课堂回顾 25% · 知识卡片 35% · 报告反思 25% · 导师评审 15%</Paragraph><Space direction="vertical"><Tag color={progress.review_completed ? 'green' : 'default'}>课堂回顾</Tag><Tag color={progress.cards_done ? 'green' : 'default'}>知识卡片与练习</Tag><Tag color={report && report.status !== 'rejected' ? 'green' : 'default'}>学习报告与反思</Tag><Tag color={report?.status === 'approved' ? 'green' : report?.status === 'rejected' ? 'red' : 'default'}>导师评审</Tag></Space></Card>
    </div>
  </PageContainer>;
}
