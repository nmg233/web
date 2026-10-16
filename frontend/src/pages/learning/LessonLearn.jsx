import StudentCopyText from '../../content/ManagedText';
import {initialExerciseAnswer,hasExerciseAnswer,resourceDownloadName,versionedReportDraftKey} from '../../student/learningIntegration';
import ExerciseView from '../../student/space/ExerciseView';
import LessonLearningView from '../../student/space/LessonLearningView';
import {reportFields as getReportFields} from '../../student/reportFields';
import {copyText} from '../../content/copy';
import {COIN_LEARNING_CHANGED} from '../../student/useRealCoins';
import {useCourseApis} from '../../student/useCourseApis';
import { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  App, Checkbox, Empty, Form, Input, Radio, Space,
} from 'antd';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../student/visual/StudentPageState';
import { useAuth } from '../../store/AuthContext';
import {openReflectionDraft} from '../../student/reflectionModel';
import { draftKey } from '../../student/model';
import LessonWorks from '../../student/LessonWorks';
import AssociatedExperiments from '../../student/AssociatedExperiments';
import { availableCardIndex, learningStage } from '../../student/experimentContext';
import { PixelButton as Button } from '../../student/visual/PixelUI';
import LessonTemplate from '../../student/space/LessonTemplate';
import {isCopyPreview} from '../../copy-review/previewMode';


function Exercise({ exercise, index, onDone,readOnly=false }) {
 const { learningAPI }=useCourseApis();
  const [answer, setAnswer] = useState(()=>initialExerciseAnswer(exercise));
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const hasAnswer=hasExerciseAnswer(answer),pending=useRef(false);
  const submit = async () => {
    if(readOnly||pending.current||exercise.attempted||result||!hasAnswer)return;pending.current=true;
    setSubmitting(true); setError('');
    try {
      const next = await learningAPI.submitExercise(exercise.id, answer);
      setResult(next);
      await onDone();
    } catch (err) { setError(err.response?.data?.error || copyText('system.learning.003')); }
    finally { pending.current=false;setSubmitting(false); }
  };
  const options = (exercise.options || []).map((item, index) => typeof item === 'object'
    ? { label: item.label ?? item.text, value: item.value ?? item.key ?? String(index) }
    : { label: item, value: item });
  let input = <Input.TextArea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={2} placeholder={copyText('system.learning.004')}  data-copy-bindings={JSON.stringify(['system.learning.004'])}/>;
  if (exercise.question_type === 'single_choice') input = <Radio.Group options={options} value={answer} onChange={(event) => setAnswer(event.target.value)} />;
  if (exercise.question_type === 'multiple_choice') input = <Checkbox.Group options={options} value={answer} onChange={setAnswer} />;
  if (exercise.question_type === 'true_false') input = <Radio.Group options={[{ label: copyText('system.learning.005'), value: true }, { label: copyText('system.learning.006'), value: false }]} value={answer} onChange={(event) => setAnswer(event.target.value)}  data-copy-bindings={JSON.stringify(['system.learning.005','system.learning.006'])}/>;
  if(exercise.question_type==='fill_blank'&&exercise.blank_count)input=<Space orientation="vertical">{Array.from({length:exercise.blank_count},(_,i)=><Input key={i} placeholder={`第 ${i+1} 空`} value={Array.isArray(answer)?answer[i]:answer} onChange={event=>{const values=Array.isArray(answer)?[...answer]:Array(exercise.blank_count).fill('');values[i]=event.target.value;setAnswer(values);}}/>)}</Space>;
  return <ExerciseView {...{exercise,index,input,submitting,result,error,hasAnswer:hasAnswer&&!readOnly,submit}} readonly={readOnly}/>;
}

export default function LessonLearn(){const{user}=useAuth();const{courseId,lessonId}=useParams();return <LessonLearnEditor key={user.id+':'+courseId+':'+lessonId}/>;}
function LessonLearnEditor() {
 const { courseAPI,learningAPI }=useCourseApis();
  const { message, modal } = App.useApp();
  const { courseId, lessonId } = useParams();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [draftState, setDraftState] = useState(copyText('system.learning.027'));
  const [draftFailed, setDraftFailed] = useState(false);
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeStage, setActiveStage] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [replayUrl, setReplayUrl] = useState('');
  const [replayAttempt, setReplayAttempt] = useState(0);
  const [activeReplayId, setActiveReplayId] = useState(null);
  const [resourceError, setResourceError] = useState('');
  const [replayError, setReplayError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [reportError, setReportError] = useState('');
  const [reflectionOpen, setReflectionOpen] = useState([]);
  const [form] = Form.useForm();
  const location=useLocation(),page=location.pathname+location.search;
  const previewPage=useRef(page);
  useEffect(()=>{previewPage.current=page;},[page]);
  const alive=useRef(false),requests=useRef({load:0,play:0}),reportDialog=useRef(null),mutating=useRef(false),video=useRef(null),resume=useRef({position:0,playing:false});
  const onPage=()=>alive.current&&page===(isCopyPreview()?previewPage.current:window.location.pathname+window.location.search);
  const reportIdentity=useRef(null);
  useEffect(()=>{alive.current=true;const state=requests.current;return()=>{alive.current=false;state.load++;state.play++;reportDialog.current?.destroy();};},[]);
  const legacyBackupBlocked=useRef(false);
  const originalDraftKey=draftKey(user.id,courseId,lessonId);
  const reportDraftKey=()=>versionedReportDraftKey(originalDraftKey,reportIdentity.current);
  const saveDraft = (_, values) => {
    if(isCopyPreview())return;
    try {
      if(legacyBackupBlocked.current)throw new Error('Legacy backup unavailable');
      localStorage.setItem(reportDraftKey(), JSON.stringify(values));
      setDraftState(copyText('system.learning.028'));
      setDraftFailed(false);
    } catch { setDraftFailed(true); setDraftState(copyText('system.learning.029')); }
  };

  const playReplay=async(replayId,refresh=false)=>{
    if(!onPage())return;const ticket=++requests.current.play;
    resume.current=refresh?{position:video.current?.currentTime||0,playing:video.current?!video.current.paused:false}:{position:0,playing:false};
    setActiveReplayId(replayId);setReplayError('');
    try{const result=await courseAPI.streamUrl(replayId);if(onPage()&&ticket===requests.current.play){setReplayUrl(result.url);setReplayAttempt(n=>n+1);}}
    catch{if(onPage()&&ticket===requests.current.play){setReplayUrl('');setReplayError(copyText('system.learning.030'));}}
  };

  const load = async ({ restorePosition = false } = {}) => {
    if(!onPage())return;const ticket=++requests.current.load,current=()=>onPage()&&ticket===requests.current.load;
    setLoading(true); setError('');
    try {
      const payload = await learningAPI.lesson(lessonId);
      if(!current())return;reportIdentity.current=payload.report?.id??null;
      if (String(payload.course.id) !== String(courseId)) throw new Error(copyText('system.learning.031'));
      setData(payload);
      if(!payload.preview)window.dispatchEvent(new Event(COIN_LEARNING_CHANGED));
      const requestedStage = Number(searchParams.get('stage'));
      // 已有报告可从原评审页回看；资料调整后的学习阶段不能吞掉档案的只读跳转。
      // 报告表单仍按 progress.report_unlocked 禁用，提交规则没有改变。
      const savedReportStage = payload.report && (requestedStage === 2 || requestedStage === 3);
      const stage = restorePosition && searchParams.has('stage') && Number.isInteger(requestedStage) && requestedStage >= 0 && (requestedStage <= learningStage(payload) || savedReportStage) ? requestedStage : learningStage(payload);
      const requestedCard = restorePosition ? searchParams.get('cardId') : null;
      if (requestedCard) {
        const index = availableCardIndex(payload.cards || [], requestedCard, payload.progress);
        if (index < 0 || stage !== 1) {
          navigate(`/courses/${courseId}`, { replace: true, state: { experimentNotice: copyText('system.learning.032') } });
          return;
        }
        setCardIndex(index);
      } else setCardIndex((current) => Math.min(current, Math.max(0, payload.cards.length - 1)));
      setActiveStage(stage);
      if (!activeReplayId && payload.replays?.length) await playReplay(payload.replays[0].id);
      if(!current())return;
      if (!payload.preview && (!payload.report || payload.report.status === 'rejected')) {
        let savedDraft = null;
        try {
          savedDraft = JSON.parse(localStorage.getItem(reportDraftKey())??localStorage.getItem(originalDraftKey));
          if (savedDraft) setDraftState(copyText('system.learning.033'));
        } catch { savedDraft = null; setDraftFailed(true); setDraftState(copyText('system.learning.034')); }
        const restored=savedDraft || (payload.report?.status === 'rejected' ? {...payload.report,reflection:payload.reflection||{}} : {});
        try { if(savedDraft?.reflection && savedDraft.reflection.reflection_version!==2 && !localStorage.getItem(reportDraftKey()+':legacy-v1')) localStorage.setItem(reportDraftKey()+':legacy-v1',JSON.stringify(savedDraft)); } catch {legacyBackupBlocked.current=true;setDraftFailed(true);setDraftState(copyText('next2.reflection.draftFailed')); }
        form.setFieldsValue({...restored,reflection:openReflectionDraft(restored.reflection,copyText)});
      }
    } catch (err) {
      if(!current())return;
      setData(null);
      if (restorePosition && searchParams.has('cardId') && [403, 404].includes(err?.response?.status)) {
        let target = '/explore';
        try { await courseAPI.detail(courseId); target = `/courses/${courseId}`; } catch { /* no accessible course to return to */ }
        const notice = target === '/explore' ? copyText('system.learning.035') : copyText('system.learning.036');
        message.warning(notice);
        navigate(target, { replace: true, state: { experimentNotice: notice } });
        return;
      }
      setError(err?.response?.data?.error || copyText('system.learning.037'));
    } finally { if(current())setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load({ restorePosition: true }); }, [courseId, lessonId, searchParams]);

  useEffect(()=>{if(!activeReplayId)return;const timer=setInterval(()=>void playReplay(activeReplayId,true),480000);return()=>clearInterval(timer);},[activeReplayId,page]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishReview = async () => {
    if(data?.read_only||mutating.current||!onPage())return;mutating.current=true;
    setSubmitting(true); setActionError('');
    try {
      await learningAPI.completeReview(lessonId);
      if(!onPage())return;
      message.success(copyText('system.learning.038'));
      await load();
    } catch (err) { setActionError(err.response?.data?.error || copyText('system.learning.039')); }
    finally { mutating.current=false;if(onPage())setSubmitting(false); }
  };

  const finishCard = async (card) => {
    if(data?.read_only||mutating.current||!onPage())return;mutating.current=true;
    setSubmitting(true); setActionError('');
    try {
      await learningAPI.completeCard(card.id);
      if(!onPage())return;
      const isLast = cardIndex === data.cards.length - 1;
      if (!isLast) setCardIndex(cardIndex + 1);
      message.success(isLast ? copyText('system.learning.040') : copyText('system.learning.041'));
      await load();
    } catch (err) { setActionError(err.response?.data?.error || copyText('system.learning.042')); }
    finally { mutating.current=false;if(onPage())setSubmitting(false); }
  };

  const onReplayLoaded=()=>{if(video.current&&resume.current.position)video.current.currentTime=resume.current.position;if(video.current&&resume.current.playing)video.current.play().catch(()=>{});};
  const downloadResource = async (resource) => {
    setResourceError('');
    try {
      const blob = await courseAPI.downloadResource(resource.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = resourceDownloadName(resource,copyText('system.learning.043')); anchor.click();
      URL.revokeObjectURL(url);
    } catch { setResourceError(`“${resource.title || copyText('system.learning.044')}”下载失败，文件可能已移除或网络中断。请重试或联系导师，当前学习和草稿不受影响。`); }
  };

  const submitReport = (values) => {
    if(data?.read_only)return;
    reportDialog.current=modal.confirm({
      title: copyText('system.learning.045'),
      content: copyText('system.learning.046'),
      onOk: async () => {
        if(!onPage()||mutating.current)throw new Error('页面已切换或正在保存，请重新确认');mutating.current=true;
        setSubmitting(true); setReportError('');
        try {
          await learningAPI.submitReport(lessonId, { report: values, reflection: values.reflection,base_report_id:data.report?.id??null });
          if(!onPage())return;
          message.success(copyText('system.learning.047'));
          try { localStorage.removeItem(reportDraftKey());localStorage.removeItem(originalDraftKey); } catch { message.warning(copyText('system.learning.048')); }
          form.resetFields(); await load();
        } catch (err) { setReportError(err.response?.data?.error || copyText('system.learning.049')); }
        finally { mutating.current=false;if(onPage())setSubmitting(false); }
      },
    });
  };

  if (!data || data.lesson.id!==Number(lessonId)) return <PageContainer title={copyText('system.learning.050')} extra={<Button onClick={() => navigate('/tasks')}>{<StudentCopyText id={'system.learning.051'}/>}</Button>} data-copy-bindings={JSON.stringify(['system.learning.050'])}><AsyncPageState loading={loading} error={error} onRetry={load}><Empty /></AsyncPageState></PageContainer>;

  const { lesson, cards = [], progress = {}, report } = data;
  const currentStep = learningStage(data);
  const activeCard=cards[Math.min(Math.max(cardIndex,0),Math.max(0,cards.length-1))];
  const cardExercisesDone = activeCard?.exercises?.every((exercise) => exercise.attempted) ?? false;
  if(data.lesson.presentation_type==='visit'||data.lesson.content_state==='preparing')return <LessonTemplate data={data}/>;
  const stageDone = [progress.review_completed, progress.cards_done, report && report.status !== 'rejected', report?.status === 'approved'];
  const stageReasons = ['', copyText('system.learning.052'), copyText('system.learning.053'), copyText('system.learning.054')];
  const reportFields = getReportFields();
  const validationFailed = ({ errorFields }) => {
    if (errorFields.some(({ name }) => name[0] === 'reflection')) setReflectionOpen(['reflection']);
    const name = errorFields[0]?.name;
    if (name) requestAnimationFrame(() => requestAnimationFrame(() => form.scrollToField(name, { block: 'center', behavior: 'instant', focus: true })));
  };
  const reportTone = report?.status === 'approved' ? 'success' : report?.status === 'rejected' ? 'warning' : 'info';

  return <LessonLearningView region={data.preview?(field,children)=><span data-teaching-field={field} data-lesson-id={lesson.id} data-course-id={courseId}>{children}{field==='article'&&<button type="button">编辑课堂文章</button>}</span>:undefined} {...{data,lesson,cards,progress,report,activeStage,courseId,lessonId,reportFields,stageDone,currentStep,stageReasons,navigate,setActiveStage,actionError,replayError,activeReplayId,playReplay,replayUrl,replayAttempt,video,onReplayLoaded,setReplayError,resourceError,downloadResource,submitting,finishReview,cardIndex,setCardIndex,activeCard,cardExercisesDone,finishCard,reportTone,form,submitReport,validationFailed,saveDraft,draftFailed,draftState,reflectionOpen,setReflectionOpen,reportError}} maintenance={Boolean(data.read_only)} renderExercise={(exercise,index)=><Exercise key={exercise.id} index={index} exercise={exercise} readOnly={Boolean(data.read_only)} onDone={load}/>} experiment={(stage,cardId)=><AssociatedExperiments variant="study" courseId={courseId} lessonId={lessonId} stage={stage} cardId={cardId}/>} works={<LessonWorks courseId={courseId} lessonId={lessonId}/>}/>;
}
