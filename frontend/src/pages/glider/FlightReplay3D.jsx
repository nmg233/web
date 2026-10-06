import { useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Card, Segmented, Select, Space, Spin, Typography,
} from 'antd';
import { PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { gliderAPI } from '../../api/glider';
// 渲染器位于 frontend 之外（simulation/glider/web_renderer/），由 Vite 直接打包；
// 数据契约见 simulation/glider/RENDER_API.md
import { GliderRenderer3D } from '../../../../simulation/glider/web_renderer/renderer_3.js';

const { Text } = Typography;

const CAMERA_OPTIONS = [
  { label: '全景', value: 'fixed' },
  { label: '追逐', value: 'chase' },
  { label: '跟随取景', value: 'follow' },
];
const SPEED_OPTIONS = [
  { label: '0.5×', value: 0.5 },
  { label: '1×', value: 1 },
  { label: '2×', value: 2 },
  { label: '4×', value: 4 },
];

const fmt = (t) => {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * 3D 飞行回放：拉取逐帧轨迹（GET /api/glider/simulations/:id/trace，ftrc 二进制），
 * 用 three.js 延迟渲染器前端实时渲染，替代旧版后端 MP4。
 */
export default function FlightReplay3D({ simId }) {
  const canvasRef = useRef(null);
  const rRef = useRef(null);
  const playingRef = useRef(false);    // setPlaying 去重：结束时 onFrame 每帧都报 playing=false
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [camera, setCamera] = useState('fixed');
  const [light, setLight] = useState('default');
  const [lights, setLights] = useState([]);

  // 记录切换由父级 <FlightReplay3D key={simId}> 重建组件完成状态重置，
  // 因此这里只负责加载数据；setState 一律发生在异步回调里（不在 effect 体内同步调用）
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // client 响应拦截器已剥壳（resolve 即 data）：bin 请求的返回值就是 ArrayBuffer
        const traceBuf = await gliderAPI.trace(simId, 'bin');
        if (!alive) return;
        const r = new GliderRenderer3D(canvasRef.current, traceBuf, {
          modelUrl: '/glider/airplane.glb',   // frontend/public/glider/
          assetBase: '/glider/',              // 后处理贴图（skyview.jpg）URL 前缀
          camera: 'fixed',
          autoplay: false,
          hud: false,                         // 状态由下方 React 控制条展示
        });
        if (!alive) { r.dispose(); return; }
        rRef.current = r;
        setDuration(r.getDuration());
        setLights(r.listLightModes());
        // onFrame 每帧回调：按 0.1s 步进节流同步进度（进度条仅支持点击定位，无拖动，
        // 不存在与受控值互相触发 setState 的更新风暴）
        r.onFrame(({ t, playing: p }) => {
          setTime((prev) => (Math.abs(t - prev) >= 0.1 ? t : prev));
          if (playingRef.current !== p) { playingRef.current = p; setPlaying(p); }
        });
        r.play();
        playingRef.current = true;
        setPlaying(true);
        setLoading(false);
      } catch (err) {
        if (!alive) return;
        const status = err?.response?.status;
        setError(status === 404
          ? '该记录没有逐帧轨迹数据（可能来自旧版本试飞，可查看下方静态航迹图）'
          : (err?.response?.data?.error || err?.message || '轨迹数据加载失败'));
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
      try { rRef.current?.dispose(); } catch { /* 忽略卸载竞争 */ }
      rRef.current = null;
    };
  }, [simId]);

  const togglePlay = () => {
    const r = rRef.current;
    if (!r) return;
    r.toggle();
    playingRef.current = r.isPlaying();
    setPlaying(playingRef.current);
  };

  const onSeek = (v) => {
    const r = rRef.current;
    if (!r) return;
    r.seek(v);
    setTime(v);
  };

  // 进度条仅支持单次点按定位：无拖动、无移动事件，一次点击只 seek 一次
  const handleSeekClick = (e) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  const changeSpeed = (v) => {
    setSpeed(v);
    rRef.current?.setSpeed(v);
  };

  const changeCamera = (v) => {
    setCamera(v);
    rRef.current?.setCamera(v);
  };

  const changeLight = (v) => {
    setLight(v);
    rRef.current?.setLightMode(v);
  };

  // 播放到末尾：seek(0) 前需要用户手动点击播放（play() 内部会回到 0）
  const atEnd = duration > 0 && time >= duration - 0.15;
  const pct = duration > 0 ? Math.min(100, Math.max(0, (time / duration) * 100)) : 0;

  return (
    <Card size="small" title="✈️ 飞行过程回放（3D 实时渲染）" style={{ marginBottom: 16 }}>
      <div style={{ position: 'relative', background: '#000', borderRadius: 6, overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          style={{ display: error ? 'none' : 'block', width: '100%', aspectRatio: '16 / 9' }}
        />
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Spin size="large" />
            <Text type="secondary">正在加载逐帧轨迹数据…</Text>
          </div>
        )}
      </div>

      {error ? (
        <Alert type="warning" showIcon message={error} style={{ marginTop: 8 }} />
      ) : (
        <>
          <Space style={{ width: '100%', justifyContent: 'space-between', marginTop: 8 }} wrap>
            <Space>
              <Button
                type="text"
                size="large"
                icon={playing && !atEnd ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={togglePlay}
              />
              <Text type="secondary">{fmt(time)} / {fmt(duration)}</Text>
            </Space>
            <Space wrap>
              <Segmented size="small" value={speed} options={SPEED_OPTIONS} onChange={changeSpeed} />
              <Segmented size="small" value={camera} options={CAMERA_OPTIONS} onChange={changeCamera} />
              <Select
                size="small"
                value={light}
                onChange={changeLight}
                style={{ minWidth: 110 }}
                options={lights.map((p) => ({ value: p.id, label: p.label }))}
              />
            </Space>
          </Space>
          {/* 点击定位进度条（无拖动）：单击任意位置跳转到对应时刻 */}
          <div
            role="slider"
            aria-label="回放进度"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)}
            onClick={handleSeekClick}
            style={{
              position: 'relative', height: 8, margin: '12px 0',
              borderRadius: 4, background: 'rgba(0,0,0,0.06)', cursor: 'pointer',
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, background: '#1677ff', borderRadius: 4 }} />
            <div style={{
              position: 'absolute', top: '50%', left: `${pct}%`, width: 14, height: 14,
              borderRadius: '50%', background: '#fff', border: '2px solid #1677ff',
              transform: 'translate(-50%, -50%)', boxShadow: '0 1px 3px rgba(0,0,0,.2)', pointerEvents: 'none',
            }}
            />
          </div>
          <Text type="secondary">
            前端基于逐帧轨迹数据实时渲染（three.js）：点击进度条回看任意时刻，可切换机位与光照效果。
          </Text>
        </>
      )}
    </Card>
  );
}
