import {copyTemplate as siteTemplate} from "../content/copy";
import Alert from '../student/visual/StudentAlert';
import Sentence from '../content/Sentence';
import {copyText} from '../content/copy';
import CopyBlock from '../content/CopyBlock';
import {useCourseApis} from './useCourseApis';
import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import {useCourseNavigate as useNavigate} from './useCourseApis';

import { Select } from 'antd';
import { useAuth } from '../store/AuthContext';
import { formatBeijingTime } from '../utils/date';
import PageContainer from '../components/common/PageContainer';
import AsyncPageState from '../student/visual/StudentPageState';
import useRemote from './useRemote';
import { PixelButton, PixelTag } from './visual/PixelUI';
import { StudyHeader, StudySection } from './visual/StudyUI';
import PixelIcon from './visual/PixelIcon';

const dimensions = [['problem_discovery', copyText('system.workDetail.001')], ['solution_design', copyText('system.workDetail.002')], ['hands_on', copyText('system.workDetail.003')], ['data_analysis', copyText('system.workDetail.004')], ['presentation', copyText('system.workDetail.005')]];
const fileSize = (bytes) => bytes == null ? copyText('system.workDetail.006') : bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

export default function StudentWorkDetail() {
 const { courseAPI,workAPI }=useCourseApis();
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fetcher = useCallback(async () => {
    const payload = await workAPI.detail(id);
    // 服务端已核验本人及课程有效性；这里再读取课程摘要用于当前页面与返回路径。
    if (!payload.work.course_id) throw new Error(copyText('system.workDetail.007'));
    try { await courseAPI.detail(payload.work.course_id); }
    catch (error) {
      if ([403, 404].includes(error.response?.status)) throw new Error(copyText('system.workDetail.008'), { cause: error });
      throw error;
    }
    return payload;
  }, [id,courseAPI,workAPI]);
  const { data, loading, error, retry } = useRemote(fetcher, { courseSensitive: true });
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const work = data?.work;
  const review = data?.review;
  const versions = data?.versions || [];
  const revised = work?.review_status === 'rejected' && Boolean(work.has_newer_version);
  const status = revised ? copyText('system.workDetail.009') : work?.review_status === 'approved' ? copyText('system.workDetail.010') : work?.review_status === 'rejected' ? copyText('system.workDetail.011') : copyText('system.workDetail.012');
  const canRevise = work && String(work.student_id) === String(user.id) && work.review_status === 'rejected' && !work.has_newer_version;
  const download = async () => {
    setDownloading(true); setDownloadError('');
    try {
      const blob = await workAPI.download(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = work.file_name || copyText('system.workDetail.013'); link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setDownloadError(err.response?.status === 404 ? copyText('system.workDetail.014') : copyText('system.workDetail.015'));
    } finally { setDownloading(false); }
  };
  return <PageContainer><div className="study-workspace">
    <StudyHeader eyebrow={<><PixelIcon name="archive" />{work?.course_title || copyText('system.workDetail.016')}</>} title={work?.title || copyText('system.workDetail.017')} description={work?.task_title}>
      <PixelButton icon={<PixelIcon name="back" />} onClick={() => navigate('/works')}>{copyText('system.workDetail.018')}</PixelButton>
      {work?.course_id && <PixelButton onClick={() => navigate(`/courses/${work.course_id}`)}>{copyText('system.workDetail.019')}</PixelButton>}
    </StudyHeader>
    <AsyncPageState loading={loading} error={error === 'Network Error' ? copyText('system.workDetail.020') : error} onRetry={retry}>
      {work && <div className="study-detail-layout"><div>
        <StudySection number="W" title={copyText('system.workDetail.021')} description={copyText('system.workDetail.022')}>
          <PixelTag tone={work.review_status === 'approved' ? 'success' : work.review_status === 'rejected' && !revised ? 'warning' : 'current'}>{status}</PixelTag>
          <div className="study-detail-meta"><span>{copyText('system.workDetail.025')}{work.version || 1}{copyText('system.workDetail.026')}</span><span>{copyText('system.workDetail.027')}{formatBeijingTime(work.created_at)}</span><span>{work.student_name}</span></div>
          {revised && <Alert type="info" showIcon title={copyText('system.workDetail.028')} description={copyText('system.workDetail.029')} />}
          <Sentence className="study-prose">{work.description || copyText('system.workDetail.030')}</Sentence>
          <section className="study-subsection" aria-label={copyText('system.workDetail.031')}><h4>{copyText('system.workDetail.032')}</h4>
            {work.has_file ? <><Sentence className="study-prose">{work.file_name || copyText('system.workDetail.033')}</Sentence><div className="study-attachment-info"><span>{copyText('system.workDetail.034')}{work.file_name?.includes('.') ? work.file_name.split('.').pop().toUpperCase() : work.file_type || copyText('system.workDetail.035')}</span><span>{copyText('system.workDetail.036')}{fileSize(work.file_size)}</span></div>
              {downloadError && <Alert type="warning" showIcon title={copyText('system.workDetail.037')} description={downloadError} style={{ marginTop: 12 }} />}
              <PixelButton type="primary" loading={downloading} onClick={download} style={{ marginTop: 16 }}>{copyText('system.workDetail.038')}</PixelButton>
            </> : <CopyBlock id="system.workDetail.039" as="p" className="study-help"/>}
          </section>
        </StudySection>
        <StudySection number="F" title={copyText('system.workDetail.040')} description={siteTemplate("site.79700c3a50e50835", {slot0: (work.version || 1)})}>
          {review || work.reject_reason ? <div className={`study-feedback${work.review_status === 'rejected' ? ' study-feedback--rejected' : ''}`}>
            {review?.reviewer_name && <Sentence className="study-help">{copyText('system.workDetail.041')}{review.reviewer_name}</Sentence>}
            {(review?.updated_at || review?.created_at) && <Sentence className="study-help">{copyText('system.workDetail.042')}{formatBeijingTime(review.updated_at || review.created_at)}</Sentence>}
            <h4>{copyText('system.workDetail.043')}</h4><Sentence className="study-prose">{review?.comment || copyText('system.workDetail.044')}</Sentence>
            <h4>{copyText('system.workDetail.045')}</h4><Sentence className="study-prose">{review?.suggestion || work.reject_reason || copyText('system.workDetail.046')}</Sentence>
            {review && work.review_status === 'approved' && <ul className="study-scores">{dimensions.map(([key, label]) => <li key={key}><span>{label}</span><strong>{review[key] == null ? copyText('system.workDetail.047') : siteTemplate("site.1a54fb1b3e22dbf3", {slot0: (review[key])})}</strong></li>)}</ul>}
          </div> : <Alert showIcon type="info" title={work.review_status === 'pending' ? copyText('system.workDetail.048') : copyText('system.workDetail.049')} description={copyText('system.workDetail.050')} />}
          {canRevise && <div className="study-actions"><PixelButton type="primary" onClick={() => navigate(`/works/upload?parent_work_id=${work.id}&task_id=${work.task_id || ''}&enrollment_id=${work.enrollment_id || ''}`)}>{copyText('system.workDetail.051')}</PixelButton></div>}
        </StudySection>
      </div><aside className="study-context" aria-label={copyText('system.workDetail.052')}><h3>{copyText('system.workDetail.053')}</h3>
        <div className="study-version-control"><label htmlFor="student-work-version">{copyText('system.workDetail.054')}</label><Select id="student-work-version" value={Number(id)} onChange={(value) => navigate(`/works/${value}`)} options={versions.map((version) => ({ value: version.id, label: siteTemplate("site.366d4f786e8e4959", {slot0: (version.version || 1)}) }))} /></div>
        <dl><dt>{copyText('system.workDetail.055')}</dt><dd>{work.course_title || copyText('system.workDetail.056')}</dd><dt>{copyText('system.workDetail.057')}</dt><dd>{work.task_title || copyText('system.workDetail.058')}</dd><dt>{copyText('system.workDetail.059')}</dt><dd>{status}</dd></dl>
        <CopyBlock id="system.workDetail.060" as="p" />
      </aside></div>}
    </AsyncPageState>
  </div></PageContainer>;
}
