import {runtimeText as runtimeCopyText} from '../../content/runtimeCopy';
import StudentCopyText from '../../content/ManagedText';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { courseAPI } from '../../api';

export default function SignedReplayPlayer({ replayId, initialUrl, streamUrl = courseAPI.streamUrl, onAccessError, className }) {
  const video = useRef(null);
  const [url, setUrl] = useState(initialUrl || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  const resume = useRef({position:0, playing:false});
  const refresh = async () => {
    const request = ++sequence.current;
    resume.current = {position:video.current?.currentTime || 0, playing:video.current ? !video.current.paused : false};
    setLoading(true); setError('');
    try {
      const result = await streamUrl(replayId);
      const target = new URL(result.url, window.location.origin);
      if(target.origin !== window.location.origin || target.pathname !== `/api/courses/replays/${replayId}/stream`) throw new Error('播放地址不合法');
      if(request === sequence.current) { setUrl(target.href); setRevision(value => value + 1); }
    } catch { if(request === sequence.current) { setError('无法获取播放地址，请检查网络或重新加载。'); onAccessError?.(); } }
    finally { if(request === sequence.current) setLoading(false); }
  };
  useEffect(() => {
    const cursor = sequence;
    // 首次加载播放签名，需要展示加载状态。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if(!initialUrl) refresh();
    const timer = setInterval(refresh, 480000);
    const visible = () => { if(document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', visible);
    const player = video;
    return () => { cursor.current++; player.current?.pause(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
    // 播放对象由父级 key 锁定；每次续期前记录位置和播放状态。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayId]);
  return <div style={{width:'100%',marginTop:8}}>
    {loading && <Spin size="small" />}
    {url && <video ref={video} key={`${url}:${revision}`} className={className} controls preload="metadata" src={url} aria-label={runtimeCopyText("student26.a63f98863fa6f3ff")} style={{width:'100%',maxHeight:420,background:'#000'}}
      onLoadedMetadata={() => {
        if(video.current && resume.current.position > 0) video.current.currentTime = Math.min(resume.current.position, Number.isFinite(video.current.duration) ? Math.max(0,video.current.duration - 0.1) : resume.current.position);
        if(resume.current.playing) video.current?.play().catch(() => {});
      }} onError={() => { setError('视频加载失败或地址已过期，重新获取后会保留播放位置。'); onAccessError?.(); }}  data-copy-bindings={JSON.stringify(["student26.a63f98863fa6f3ff"])}/>}
    {error && <Alert type="warning" showIcon message={error} action={<Button loading={loading} onClick={refresh}><StudentCopyText id="student26.5f8b57f5086cee96"/></Button>} />}
  </div>;
}
