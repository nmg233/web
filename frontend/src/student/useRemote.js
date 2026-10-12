import {copyText as siteText} from "../content/systemText.js";
import { useCallback, useEffect, useState } from 'react';
import {COIN_LEARNING_CHANGED} from './useRealCoins';
import { shouldRefreshCourses, STUDENT_COURSES_CHANGED } from './accessPolicy';

export default function useRemote(fetcher, { courseSensitive = false, courseId, retainDataOnRetry = false } = {}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    if (!courseSensitive) return;
    const update = (event) => { if (shouldRefreshCourses(event.detail, courseId)) {setState(s=>({...s,data:null}));retry();} };
    window.addEventListener(STUDENT_COURSES_CHANGED, update);
    return () => window.removeEventListener(STUDENT_COURSES_CHANGED, update);
  }, [courseSensitive, courseId, retry]);
  useEffect(() => {
    let active = true;
    // 清空旧数据：错误状态下不退回显示上次成功结果。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(previous=>({ loading: true, data: retainDataOnRetry?previous.data:null, error: '' }));
    fetcher().then((data) => { if (active) {setState({ loading: false, data, error: '' });if(courseSensitive)window.dispatchEvent(new Event(COIN_LEARNING_CHANGED));} })
      .catch((error) => { if (active) setState(previous=>({ loading: false, data: retainDataOnRetry&&![403,404].includes(error.response?.status)?previous.data:null,
        error: error.response?.data?.error || error.message || siteText("site.3e68874ac03a1fe3") })); });
    return () => { active = false; };
  }, [fetcher, attempt, retainDataOnRetry, courseSensitive]);
  return { ...state, retry };
}
