import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { courseAPI } from '../../api';

export default function SignedReplayPlayer({ replayId, initialUrl }) {
  const video = useRef(null);
  const [url, setUrl] = useState(initialUrl || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const resume = useRef({position:0, playing:false});
  const refresh = async () => {
    const request = ++sequence.current;
    resume.current = {position:video.current?.currentTime || 0, playing:video.current ? !video.current.paused : false};
    setLoading(true); setError('');
    try {
      const result = await courseAPI.streamUrl(replayId);
      if(request === sequence.current) setUrl(result.url);
    } catch { if(request === sequence.current) setError('无法获取播放地址，请检查网络或重新加载。'); }
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
    return () => { cursor.current++; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
    // 播放对象由父级 key 锁定；每次续期前记录位置和播放状态。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayId]);
  return <div style={{width:'100%',marginTop:8}}>
    {loading && <Spin size="small" />}
    {url && <video ref={video} key={url} controls src={url} aria-label="课堂回放播放器" style={{width:'100%',maxHeight:420,background:'#000'}}
      onLoadedMetadata={() => {
        if(video.current && resume.current.position > 0) video.current.currentTime = Math.min(resume.current.position, Number.isFinite(video.current.duration) ? Math.max(0,video.current.duration - 0.1) : resume.current.position);
        if(resume.current.playing) video.current?.play().catch(() => {});
      }} onError={() => setError('视频加载失败或地址已过期，重新获取后会保留播放位置。')} />}
    {error && <Alert type="warning" showIcon message={error} action={<Button loading={loading} onClick={refresh}>重新获取播放地址</Button>} />}
  </div>;
}
