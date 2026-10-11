import { useEffect } from 'react';
import useRemoteResource from '../hooks/useRemoteResource';
import { STUDENT_COURSES_CHANGED } from './accessPolicy';

// 只在课程集合变化时重读。身份由页面的稳定账号／对象 key 隔离，token 轮换不参与依赖。
export default function useCourseResource(read, courseId) {
  const state = useRemoteResource(read);
  const { reload } = state;
  useEffect(() => {
    const changed = ({ detail }) => { if (courseId == null || detail.removedCourseIds.map(String).includes(String(courseId))) void reload(); };
    window.addEventListener(STUDENT_COURSES_CHANGED, changed);
    return () => window.removeEventListener(STUDENT_COURSES_CHANGED, changed);
  }, [reload, courseId]);
  return state;
}
