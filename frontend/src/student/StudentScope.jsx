import {copyText as siteText} from "../content/copy";
import Alert from '../student/visual/StudentAlert';
import { useEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import { Link, useLocation } from 'react-router-dom';
import { PageLoading, StudentPageStatus } from '../components/PageStatus';
import { authAPI, courseAPI } from '../api';
import client from '../api/client';
import { useAuth } from '../store/AuthContext';
import { currentAccessTarget, removedCourseIds, STUDENT_ACCESS_CHECK, STUDENT_COURSES_CHANGED } from './accessPolicy';
import CourseExperience from './space/CourseExperience';
import CoursePresentationProvider from './space/CoursePresentation';

// 后端负责最终授权。这里只清除已确认失效的页面，并保留与错误无关的输入。
export default function StudentScope({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const route = useRef(location);
  const checkRef = useRef(null);
  const [state, setState] = useState({ userId: user.id, ready: false, warning: '', courses: null, blocked: null, archiveRevision: 0 });

  useEffect(() => {
    route.current = location;
    checkRef.current?.();
  }, [location]); // 阶段/卡片 URL 变化只重验，不重建页面。

  useEffect(() => {
    let alive = true;
    let running = false;
    let queuedObjectCheck = false;
    let knownCourses;
    const check = async (verifyObject = false) => {
      if (running) { queuedObjectCheck ||= verifyObject; return; }
      running = true;
      const target = currentAccessTarget(route.current.pathname, route.current.search);
      try {
        const [account, payload] = await Promise.all([authAPI.me(), courseAPI.list()]);
        if (!alive) return;
        if (String(account.user.id) !== String(user.id) || account.user.role !== 'student') {
          window.location.assign('/'); return;
        }
        if (account.user.force_reset_password) { window.location.assign('/change-password'); return; }
        const courses = payload.courses || [];
        const removed = knownCourses ? removedCourseIds(knownCourses, courses) : [];
        const previousIds = knownCourses?.map((course) => String(course.id)).sort().join(',');
        const nextIds = courses.map((course) => String(course.id)).sort().join(',');
        if (knownCourses && previousIds !== nextIds) {
          window.dispatchEvent(new CustomEvent(STUDENT_COURSES_CHANGED, { detail: { removedCourseIds: removed, courses } }));
        }
        knownCourses = courses;
        setState((previous) => ({ ...previous, userId: user.id, ready: true, warning: '', courses,
          blocked: previous.userId === user.id ? previous.blocked : null,
          archiveRevision: previous.userId === user.id ? previous.archiveRevision + (removed.length ? 1 : 0) : 0 }));

        // 附件错误无法证明课程撤回。只对当前课程/作品/任务读接口做一次核验，
        // 成功时不重新装载其数据，更不会重置正在填写的表单。
        if (target.endpoint && (verifyObject || removed.length)) {
          try {
            await client.get(target.endpoint, { studentAccessProbe: true, silent: true });
            if (alive) setState((previous) => ({ ...previous,
              blocked: previous.blocked?.key === target.key ? null : previous.blocked }));
          } catch (error) {
            if (!alive) return;
            if ([403, 404].includes(error.response?.status)
              || (error.response?.status === 400 && error.response?.data?.error === '作品不存在')) {
              setState((previous) => ({ ...previous, blocked: { key: target.key,
                reason: error.response?.data?.error || siteText("site.a862330b931c8c9d") } }));
            } else {
              setState((previous) => ({ ...previous, warning: siteText("site.79411935202f6cc3") }));
            }
          }
        }
      } catch (error) {
        if (alive) setState((previous) => ({ ...previous, warning: error.response?.data?.error
          || siteText("site.27da8f7fb86fb089") }));
      } finally {
        running = false;
        if (alive && queuedObjectCheck) { queuedObjectCheck = false; check(true); }
      }
    };
    checkRef.current = check;
    const focus = () => { if (!document.hidden) check(); };
    const verify = () => check(true);
    check();
    const timer = setInterval(focus, 30000);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    window.addEventListener(STUDENT_ACCESS_CHECK, verify);
    return () => {
      alive = false; checkRef.current = null; clearInterval(timer);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
      window.removeEventListener(STUDENT_ACCESS_CHECK, verify);
    };
  }, [user.id]);

  if (state.userId !== user.id) return <PageLoading>{siteText("site.74068fd8305fe78e")}</PageLoading>;
  const target = currentAccessTarget(location.pathname, location.search);
  const missingCourse = target.courseId && state.courses && !state.courses.some((course) => String(course.id) === target.courseId);
  const blocked = state.blocked?.key === target.key ? state.blocked : null;
  const retry = <Button onClick={() => checkRef.current?.(true)}>{siteText("site.fc5aff20bb11078a")}</Button>;
  if (missingCourse || blocked) return <StudentPageStatus title={siteText("site.8854b62a379e0474")}
    description={<>{missingCourse ? siteText("site.cd57694981c3d228") : blocked.reason}
      {state.warning && <><br /><span role="status">{state.warning}</span></>}</>}>
    <Link to="/explore" className="student-status-return">{siteText("site.f8c8b469fb2c223d")}</Link>
    {retry}
  </StudentPageStatus>;
  if (!state.ready) return state.warning
    ? <StudentPageStatus title={siteText("site.2fa825f21dd7d02a")} description={siteText("site.c5b063b2ada193b5")}>{retry}</StudentPageStatus>
    : <PageLoading>{siteText("site.74068fd8305fe78e")}</PageLoading>;
  return <CoursePresentationProvider><CourseExperience>
    {state.warning && <Alert type="warning" showIcon title={siteText("site.56a5ad14c3c707a9")} description={state.warning} action={retry} style={{ margin: 16 }} />}
    <div key={`${user.id}:${location.pathname}:${/\/archives$/.test(location.pathname) ? state.archiveRevision : 0}`}>{children}</div>
  </CourseExperience></CoursePresentationProvider>;
}
