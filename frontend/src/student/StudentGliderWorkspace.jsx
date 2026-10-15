import ConfigCopyText from '../content/ConfigText';
import StudentCopyText from '../content/ManagedText';
import FlightReplay3D from '../pages/glider/FlightReplay3D';
import {copyTemplate as siteTemplate} from "../content/copy";
import Alert from '../student/visual/StudentAlert';
import Sentence from '../content/Sentence';
import {copyText} from '../content/copy';
import CopyBlock from '../content/CopyBlock';
import { useRef, useState } from 'react';
import { Collapse, Empty, Form, InputNumber, Select, Spin, Tag, Image, message } from 'antd';
import { flightParameters, initialFlightParameters, flightMetrics, stateMeta, STATE_TIPS } from '../pages/glider/gliderModel';
import { useGliderFile } from '../pages/glider/useGliderRecords';
import { formatBeijingTime } from '../utils/date';
import { PixelButton, PixelPanel, PixelTag } from './visual/PixelUI';
import { StudyHeader, StudySection } from './visual/StudyUI';
import PixelIcon from './visual/PixelIcon';
import './visual/pixel-lab.css';

function ResultFile({ record, revision, name, title }) {
  const file = useGliderFile(record.id, name, revision);
  const [preview, setPreview] = useState(false);
  return <figure className="flight-file" data-file={name}>
    <figcaption>{title}</figcaption>
    {file.status === 'loading' ? <div className="flight-file-placeholder"><Spin size="small" />{<StudentCopyText id={'system.flight.001'}/>}{title}…</div>
      : file.status === 'error' ? <Alert type="warning" showIcon title={siteTemplate("site.0b532c8bb84a670b", {slot0: (title)})}
        description={copyText('system.flight.002')}
        action={<PixelButton onClick={file.retry}>{<StudentCopyText id={'system.flight.003'}/>}{title}</PixelButton>}  data-copy-bindings={JSON.stringify(["site.0b532c8bb84a670b",'system.flight.002'])}/>
        : name === 'video' ? <video src={file.url} controls playsInline preload="metadata" onError={file.fail} aria-label={copyText('system.flight.004')}  data-copy-bindings={JSON.stringify(['system.flight.004'])}/>
          : <><Image src={file.url} alt={title} onError={file.fail} preview={{ open: preview, onOpenChange: setPreview }} /><PixelButton className="flight-zoom" size="small" onClick={() => setPreview(true)}>{<StudentCopyText id={'system.flight.005'}/>}{title}</PixelButton></>}
  </figure>;
}

function RecordResults({ records }) {
  const { viewingId, viewing, waitSec, pollFailed, pollTimedOut, openRecord, revision } = records;
  const meta = stateMeta(viewing?.state);
  return <>
    <div className="flight-record-heading"><PixelTag tone={viewing?.status === 'success' ? 'success' : 'neutral'}>{viewingId ? <StudentCopyText id={"site.bb7a90ecdb798198"} values={{slot0: (viewingId)}}/> : <StudentCopyText id={'system.flight.006'}/>}</PixelTag>
      {viewing && <time>{formatBeijingTime(viewing.created_at)}</time>}
      {viewingId && <PixelButton size="small" onClick={() => openRecord(viewingId)}>{<StudentCopyText id={'system.flight.007'}/>}</PixelButton>}
    </div>
    {viewing && <Collapse className="flight-snapshot" items={[{ key: 'snapshot', label: siteTemplate("site.e90d5b2c5e3bce72", {slot0: (viewing.id)}), children: <><CopyBlock id="system.flight.008" as="p" className="flight-note"/><dl className="flight-snapshot-grid">{flightParameters.map((parameter) => <div key={parameter.field}><dt><ConfigCopyText object={parameter} field="title" value={parameter.title}/></dt><dd>{viewing[parameter.field] ?? '—'} {parameter.unit}</dd></div>)}</dl></> }]}  data-copy-bindings={JSON.stringify(["site.e90d5b2c5e3bce72"])}/>}
    {!viewingId ? <div className="flight-ready"><PixelIcon name="lab" size={56} /><h4>{<StudentCopyText id={'system.flight.009'}/>}</h4><Sentence>{<StudentCopyText id={'system.flight.010'}/>}<br />{<StudentCopyText id={'system.flight.011'}/>}</Sentence><span>{<StudentCopyText id={'system.flight.012'}/>}</span></div>
      : pollTimedOut ? <Alert type="warning" showIcon title={copyText('system.flight.013')} description={copyText('system.flight.014')} action={<PixelButton onClick={() => openRecord(viewingId)}>{<StudentCopyText id={'system.flight.015'}/>}</PixelButton>}  data-copy-bindings={JSON.stringify(['system.flight.013','system.flight.014'])}/>
        : pollFailed ? <Alert type="warning" showIcon title={copyText('system.flight.016')} description={copyText('system.flight.017')} action={<PixelButton onClick={() => openRecord(viewingId)}>{<StudentCopyText id={'system.flight.018'}/>}</PixelButton>}  data-copy-bindings={JSON.stringify(['system.flight.016','system.flight.017'])}/>
          : !viewing ? <div className="flight-running" role="status"><Spin /><h4>{<StudentCopyText id={'system.flight.019'}/>}</h4><Sentence>{<StudentCopyText id={'system.flight.020'}/>}{viewingId}</Sentence></div>
            : viewing.status === 'running' ? <div className="flight-running" role="status"><Spin /><PixelTag>{<StudentCopyText id={'system.flight.021'}/>}</PixelTag><h4>{<StudentCopyText id={'system.flight.022'}/>}</h4><Sentence>{<StudentCopyText id={'system.flight.023'}/>}{waitSec}{<StudentCopyText id={'system.flight.024'}/>}</Sentence><CopyBlock id="system.flight.025" as="p" /></div>
              : viewing.status === 'error' ? <Alert type="error" showIcon title={copyText('system.flight.026')} description={viewing.error || copyText('system.flight.027')}  data-copy-bindings={JSON.stringify(['system.flight.026','system.flight.027'])}/>
                : <>
                  <div className="flight-outcome"><span className="flight-computed"><PixelIcon name="check" size={20} />{<StudentCopyText id={'system.flight.028'}/>}</span><h4>{<StudentCopyText id={'system.flight.029'}/>}<ConfigCopyText object={meta} field="label" value={meta.label}/></h4><Sentence>{STATE_TIPS[viewing.state] || <StudentCopyText id={'system.flight.030'}/>}</Sentence></div>
                  <FlightReplay3D key={viewing.id} simId={viewing.id}/><dl className="flight-metrics">{flightMetrics(viewing).map(({ label, value, unit }) => <div key={label}><dt>{label}</dt><dd>{value}<small>{unit}</small></dd></div>)}</dl>
                  <CopyBlock id="system.flight.031" as="p" className="flight-note"/>
                  <ResultFile key={`trajectory-${viewing.id}`} record={viewing} revision={revision} name="trajectory3d.png" title={copyText('system.flight.032')}  data-copy-bindings={JSON.stringify(['system.flight.032'])}/>
                  <ResultFile key={`telemetry-${viewing.id}`} record={viewing} revision={revision} name="flight_telemetry.png" title={copyText('system.flight.033')}  data-copy-bindings={JSON.stringify(['system.flight.033'])}/>
                  {viewing.result?.files?.video && <ResultFile key={`video-${viewing.id}`} record={viewing} revision={revision} name="video" title={copyText('system.flight.034')}  data-copy-bindings={JSON.stringify(['system.flight.034'])}/>}
                </>}

  </>;
}

export default function StudentGliderWorkspace({ form, records, startSim, submitting, submitError, engineChecking, engineReady,
  canSubmit, blockedReason, retryEngine, sourceCourse, sourceLesson, courses, lessons, courseId, lessonId,
  handleCourseChange, setLessonId, returning, contextPending, contextError, returnsToCourse, returnToSource, returnToLab }) {
  const [advanced, setAdvanced] = useState([]);
  const resultRef = useRef(null);
  const course = courses.find((item) => String(item.id) === String(sourceCourse));
  const lesson = lessons.find((item) => String(item.id) === String(sourceLesson));
  const openRecord = (id) => { records.openRecord(id); resultRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); };
  const finishFailed = ({ errorFields }) => {
    const field = errorFields?.[0];
    if (flightParameters.slice(4).some((parameter) => parameter.name === field?.name?.[0])) setAdvanced(['advanced']);
    message.error(siteTemplate("site.ebad53955e500a57", {slot0: (field?.errors?.[0] || copyText('system.flight.035'))}));
    if (field) setTimeout(() => form.scrollToField(field.name, { focus: true, block: 'center' }), 0);
  };
  const parameterInput = (parameter) => <Form.Item key={parameter.name} name={parameter.name} label={parameter.label}
    extra={<span className="flight-range">{<StudentCopyText id={'system.flight.036'}/>}{parameter.min}–{parameter.max} {parameter.unit}{<StudentCopyText id={'system.flight.037'}/>}{parameter.step}</span>}
    rules={[{ required: !!parameter.required, type: 'number', min: parameter.min, max: parameter.max, message: siteTemplate("site.99b8017af6c4b84a", {slot0: (parameter.title), slot1: (parameter.min), slot2: (parameter.max), slot3: (parameter.unit)}) }]}>
    <InputNumber min={parameter.min} max={parameter.max} step={parameter.step} style={{ width: '100%' }} suffix={parameter.unit} />
  </Form.Item>;
  return <div className="study-workspace lab-workspace">
    <StudyHeader eyebrow={<><PixelIcon name="lab" size={20} />{<StudentCopyText id={'system.flight.038'}/>}</>} title={copyText('system.flight.039')} description={copyText('system.flight.040')} data-copy-bindings={JSON.stringify(['system.flight.039','system.flight.040'])}>
      <PixelButton icon={<PixelIcon name="back" />} loading={returning} disabled={contextPending} onClick={returnToSource}>{returnsToCourse ? <StudentCopyText id={'flight.return.source'}/> : <StudentCopyText id={'system.flight.041'}/>}</PixelButton>
      {sourceCourse && returnsToCourse && <PixelButton onClick={returnToLab}>{<StudentCopyText id={'system.flight.042'}/>}</PixelButton>}
    </StudyHeader>
    <div className="flight-context"><PixelTag>{sourceCourse ? <StudentCopyText id={'system.flight.043'}/> : <StudentCopyText id={'system.flight.044'}/>}</PixelTag><span>{sourceCourse ? contextError ? <StudentCopyText id={'system.flight.045'}/> : <><span>{course?.title || <StudentCopyText id={'system.flight.046'}/>}</span>{lesson && <><span aria-hidden="true"> / </span><span><ConfigCopyText object={lesson} field="title" value={lesson.title}/></span></>}</> : <StudentCopyText id={'system.flight.047'}/>}</span></div>
    <CopyBlock id="system.flight.048" as="p" className="flight-boundary"/>
    <div className="flight-layout">
      <StudySection number="01" title={copyText('system.flight.049')} description={copyText('system.flight.050')} className="flight-parameters" data-copy-bindings={JSON.stringify(['system.flight.049','system.flight.050'])}>
        <div className={`flight-engine ${engineReady && !blockedReason ? 'flight-engine--ready' : ''}`} role="status"><span>{engineChecking ? <Spin size="small" /> : <PixelIcon name={engineReady && !blockedReason ? 'check' : 'clock'} size={20} />}{blockedReason || <StudentCopyText id={'system.flight.051'}/>}</span>{!engineChecking && !engineReady && <PixelButton size="small" onClick={retryEngine}>{<StudentCopyText id={'system.flight.052'}/>}</PixelButton>}</div>
        <Form form={form} layout="vertical" initialValues={initialFlightParameters} onFinish={startSim} onFinishFailed={finishFailed}>
          {flightParameters.slice(0, 4).map(parameterInput)}
          <Collapse activeKey={advanced} onChange={setAdvanced} items={[{ key: 'advanced', label: copyText('system.flight.053'), forceRender: true, children: flightParameters.slice(4).map(parameterInput) ,__copyIds:{"label":"system.flight.053"}}]}  data-copy-bindings={JSON.stringify(['system.flight.053'])}/>
          <Collapse className="flight-association" items={[{ key: 'association', label: sourceCourse ? copyText('system.flight.054') : copyText('system.flight.055'), forceRender: true, children: <>
            <Form.Item name="course_id" label={copyText('system.flight.056')} extra={sourceCourse ? copyText('system.flight.057') : copyText('system.flight.058')} data-copy-bindings={JSON.stringify(['system.flight.056','system.flight.057','system.flight.058'])}><Select placeholder={copyText('system.flight.059')} allowClear disabled={!!sourceCourse} value={courseId} onChange={handleCourseChange} options={courses.map((item) => ({ value: item.id, label: item.title }))}  data-copy-bindings={JSON.stringify(['system.flight.059'])}/></Form.Item>
            <Form.Item name="lesson_id" label={copyText('system.flight.060')} data-copy-bindings={JSON.stringify(['system.flight.060'])}><Select placeholder={copyText('system.flight.061')} allowClear value={lessonId} onChange={setLessonId} disabled={!courseId || !!sourceCourse} options={lessons.map((item) => ({ value: item.id, label: item.title }))}  data-copy-bindings={JSON.stringify(['system.flight.061'])}/></Form.Item>
          </> }]}  data-copy-bindings={JSON.stringify(['system.flight.054','system.flight.055'])}/>
          <div className="flight-submit">{submitError && <Alert role="alert" type="error" showIcon title={copyText('system.flight.062')} description={submitError}  data-copy-bindings={JSON.stringify(['system.flight.062'])}/>}<PixelButton type="primary" htmlType="submit" icon={<PixelIcon name="continue" />} loading={submitting} disabled={!canSubmit} block>{submitting ? <StudentCopyText id={'system.flight.063'}/> : engineChecking ? <StudentCopyText id={'system.flight.064'}/> : <StudentCopyText id={'system.flight.065'}/>}</PixelButton><CopyBlock id="system.flight.066" as="p" /></div>
        </Form>
      </StudySection>
      <div ref={resultRef} className="flight-result-anchor" tabIndex={-1}><StudySection number="02" title={copyText('system.flight.067')} description={copyText('system.flight.068')} className="flight-results" data-copy-bindings={JSON.stringify(['system.flight.067','system.flight.068'])}><RecordResults records={records} /></StudySection></div>
    </div>
    <PixelPanel className="flight-history" aria-label={copyText('system.flight.069')} data-copy-bindings={JSON.stringify(['system.flight.069'])}>
      <header><div><span className="flight-kicker">FLIGHT LOG</span><h3>{<StudentCopyText id={'system.flight.070'}/>}</h3><CopyBlock id="system.flight.071" as="p" /></div><PixelButton onClick={records.loadHistory} loading={records.loadingHistory}>{<StudentCopyText id={'system.flight.072'}/>}</PixelButton></header>
      {records.historyError ? <Alert type="error" showIcon title={records.historyError} action={<PixelButton onClick={records.loadHistory}>{<StudentCopyText id={'system.flight.073'}/>}</PixelButton>} />
        : records.loadingHistory ? <Spin description={copyText('system.flight.074')} data-copy-bindings={JSON.stringify(['system.flight.074'])}><div className="flight-history-loading" /></Spin>
          : !records.history.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={copyText('system.flight.075')}  data-copy-bindings={JSON.stringify(['system.flight.075'])}/>
            : <ul>{records.history.map((item) => <li key={item.id}><button type="button" className="flight-history-entry" aria-pressed={records.viewingId === item.id} onClick={() => openRecord(item.id)}>
              <span className="flight-history-id">#{item.id}<Tag color={item.status === 'running' ? 'processing' : item.status === 'error' ? 'error' : stateMeta(item.state).color}>{item.status === 'running' ? <StudentCopyText id={'system.flight.076'}/> : item.status === 'error' ? <StudentCopyText id={'system.flight.077'}/> : stateMeta(item.state).label}</Tag></span>
              <span className="flight-history-params">{<StudentCopyText id={'system.flight.078'}/>}{item.dihedral_deg ?? '—'}{<StudentCopyText id={'system.flight.079'}/>}{item.cg_x > 0 ? '+' : ''}{item.cg_x ?? '—'}{<StudentCopyText id={'system.flight.080'}/>}{item.speed ?? '—'} m/s{` · ${copyText('site.c2778d97f9e62972')} ${item.wing_area ?? '—'} m²`}{` · ${copyText('site.a73be7f47a0fda2d')} ${item.mass ?? '—'} kg`}{` · ${copyText('site.48ea978c84421f9e')} ${item.elevator_deg ?? '—'}°`}{` · ${copyText('site.845d34e8645f8dbf')} ${item.rudder_deg ?? '—'}°`}</span>
              <time>{formatBeijingTime(item.created_at)}</time><span className="flight-history-open">{records.viewingId === item.id ? <StudentCopyText id={'system.flight.081'}/> : <StudentCopyText id={'system.flight.082'}/>} <PixelIcon name="continue" size={16} /></span>
            </button></li>)}</ul>}
    </PixelPanel>
  </div>;
}
