import {copyText as siteText} from "../content/copy";
import Alert from '../student/visual/StudentAlert';
import {useCourseApis} from './useCourseApis';
import { useCallback, useEffect, useRef, useState } from 'react';

import { requestError } from '../utils/requestError';
import { STUDENT_COURSES_CHANGED } from './accessPolicy';
import { PixelButton } from './visual/PixelUI';

// 每项下载独立；附件错误不清除已核验的页面。下载后再次核验课程再触发浏览器保存。
export default function CourseResourceDownload({ resource, courseId }) {
 const { courseAPI }=useCourseApis();
  const live = useRef(false), busy = useRef(false), generation = useRef(0), urls = useRef(new Set());
  const [state, setState] = useState({ loading: false, error: null });
  const invalidate = useCallback(() => { generation.current++; live.current = false; }, []);
  useEffect(() => {
    live.current = true;
    const changed = ({ detail }) => {
      if (detail.removedCourseIds.map(String).includes(String(courseId))) { generation.current++; live.current = false; }
    };
    const pendingUrls = urls.current;
    window.addEventListener(STUDENT_COURSES_CHANGED, changed);
    return () => { invalidate(); pendingUrls.forEach(URL.revokeObjectURL); pendingUrls.clear(); window.removeEventListener(STUDENT_COURSES_CHANGED, changed); };
  }, [courseId, resource.id, invalidate]);
  const download = async () => {
    if (busy.current || !live.current) return;
    busy.current = true;
    const ticket = ++generation.current;
    setState({ loading: true, error: null });
    let url;
    try {
      const blob = await courseAPI.downloadResource(resource.id);
      if (!live.current || ticket !== generation.current) return;
      await courseAPI.detail(courseId);
      if (!live.current || ticket !== generation.current) return;
      url = URL.createObjectURL(blob); urls.current.add(url);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = resource.title || siteText("site.785cfd66e3482f36");
      document.body.append(anchor); anchor.click(); anchor.remove();
    } catch (error) { if (live.current && ticket === generation.current) setState({ loading: false, error }); }
    finally {
      if (url) { URL.revokeObjectURL(url); urls.current.delete(url); }
      if (live.current && ticket === generation.current) { busy.current = false; setState(s => ({ ...s, loading: false })); }
    }
  };
  return <div className="compat-download"><PixelButton size="small" loading={state.loading} onClick={download} aria-label={`${state.error ? siteText("site.75c74751c4b15e03") : siteText("site.6c87cdefe32538b6")}：${resource.title || siteText("site.785cfd66e3482f36")}`}>{state.error ? siteText("site.3e8c2bc118d18995") : siteText("site.b0e3d658df80071e")}</PixelButton>
    {state.error && <Alert role="alert" type="warning" title={siteText("site.02249dfd912308ed")} description={requestError(state.error, { action: siteText("site.bba34fc827153819") })} />}</div>;
}
