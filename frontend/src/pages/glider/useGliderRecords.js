import {copyText as siteText} from "../../content/systemText.js";
import { useCourseApis } from '../../student/useCourseApis';
import { useCallback, useEffect, useRef, useState } from 'react';

// A new revision deliberately rereads even the same record. Every request belongs
// to one effect lifetime, so late responses cannot replace a newly opened record.
export default function useGliderRecords() {
  const { gliderAPI } = useCourseApis();
  const [selection, setSelection] = useState({ id: null, revision: 0 });
  const [viewing, setViewing] = useState(null);
  const [waitSec, setWaitSec] = useState(0);
  const [pollFailed, setPollFailed] = useState(false);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const historyRequest = useRef(0);
  const loadHistory = useCallback(async () => {
    const request = ++historyRequest.current;
    setLoadingHistory(true); setHistoryError('');
    try {
      const result = await gliderAPI.list();
      if (request === historyRequest.current) setHistory(result.items || []);
    } catch {
      if (request === historyRequest.current) { setHistory([]); setHistoryError(siteText("site.fdae589dadb8340e")); }
    } finally { if (request === historyRequest.current) setLoadingHistory(false); }
  }, [gliderAPI]);
  useEffect(() => {
    const timer = setTimeout(loadHistory, 0);
    return () => { clearTimeout(timer); historyRequest.current += 1; };
  }, [loadHistory]);
  const openRecord = useCallback((id) => {
    setViewing(null); setWaitSec(0); setPollFailed(false); setPollTimedOut(false);
    setSelection((previous) => ({ id, revision: previous.revision + 1 }));
  }, []);
  useEffect(() => {
    if (!selection.id) return undefined;
    let active = true, inFlight = false, failures = 0;
    const started = Date.now();
    const stop = () => { active = false; clearInterval(interval); clearTimeout(first); clearTimeout(deadline); };
    const tick = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        const record = await gliderAPI.detail(selection.id);
        if (!active) return;
        failures = 0; setViewing(record);
        setWaitSec(Math.floor((Date.now() - started) / 1000));
        if (record.status !== 'running') { stop(); setWaitSec(0); loadHistory(); }
      } catch {
        if (active && ++failures >= 3) { stop(); setPollFailed(true); }
      } finally { inFlight = false; }
    };
    const interval = setInterval(tick, 2000);
    const first = setTimeout(tick, 0);
    const deadline = setTimeout(() => { if (active) { stop(); setPollTimedOut(true); setWaitSec(300); loadHistory(); } }, 300000);
    return stop;
  }, [selection, loadHistory,gliderAPI]);
  return { history, loadingHistory, historyError, loadHistory, viewingId: selection.id,
    viewing, waitSec, pollFailed, pollTimedOut, openRecord, revision: selection.revision };
}

// Each file has its own loading/error/retry lifecycle. URLs are revoked on retry,
// record switch and unmount; a late response never creates an orphaned blob URL.
export function useGliderFile(id, name, revision = 0) {
  const { gliderAPI } = useCourseApis();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ key: '', status: 'loading', url: null });
  const key = JSON.stringify([id, name, revision, attempt]);
  useEffect(() => {
    if (!id) return undefined;
    let active = true, objectUrl;
    (async () => {
      try {
        const result = name === 'video' ? await gliderAPI.streamUrl(id) : await gliderAPI.file(id, name);
        if (!active) return;
        const url = name === 'video' ? result.url : (objectUrl = URL.createObjectURL(new Blob([result], { type: 'image/png' })));
        if (!url) throw new Error('Missing file');
        setState({ key, status: 'ready', url });
      } catch { if (active) setState({ key, status: 'error', url: null }); }
    })();
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, name, key,gliderAPI]);
  return { ...(state.key === key ? state : { status: 'loading', url: null }),
    retry: () => setAttempt((value) => value + 1),
    fail: () => setState({ key, status: 'error', url: null }) };
}
