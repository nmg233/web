import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Row, Col, Card, Form, InputNumber, Button, Tag, Space, Spin, message,
  Statistic, Alert, List, Typography, Empty, Result,
} from 'antd';
import { ArrowLeftOutlined, RocketOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { gliderAPI } from '../../api/glider';
import { formatBeijingTime } from '../../utils/date';

const { Title, Text } = Typography;

const STATE_META = {
  ok: { color: 'green', label: '正常滑翔' },
  landed: { color: 'blue', label: '成功着陆' },
  'crashed(roll)': { color: 'red', label: '横滚失控坠毁' },
  'stalled/slow': { color: 'orange', label: '失速下坠' },
  timedout: { color: 'default', label: '超时结束' },
};

const STATE_TIPS = {
  ok: '滑翔机在设定时间内稳定飞行，气动布局比较合适，可以试试更高更远的目标。',
  landed: '飞机平稳落地，这是一次成功的试飞！',
  'crashed(roll)': '飞机发生了横滚失控。试试增大机翼上反角、把重心往前移，或适当提高投放速度。',
  'stalled/slow': '飞机失速下坠了。试试把重心往前移一些，或提高一点投放速度。',
  timedout: '在设定时间内飞行稳定、没有落地。',
};

function stateMeta(state) {
  return STATE_META[state] || { color: 'default', label: state || '—' };
}

export default function GliderSimulator() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [viewingId, setViewingId] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [img, setImg] = useState({ trajectory: null, telemetry: null, video: null });
  const [submitting, setSubmitting] = useState(false);
  const [waitSec, setWaitSec] = useState(0);
  const [pollFailed, setPollFailed] = useState(false);
  const [pollTimedOut, setPollTimedOut] = useState(false);

  const loadHistory = async () => {
    try {
      const res = await gliderAPI.list();
      setHistory(res.items || []);
    } catch { message.error('加载试飞记录失败'); }
  };

  // 进入页面加载我的试飞记录（延迟一拍再发起，避免在 effect 内同步 setState）
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      gliderAPI.list()
        .then((res) => { if (alive) setHistory(res.items || []); })
        .catch(() => { if (alive) message.error('加载试飞记录失败'); })
        .finally(() => { if (alive) setLoadingHistory(false); });
    }, 0);
    return () => { alive = false; clearTimeout(t); };
  }, []);

  // 轮询：记录处于 running 时每 2s 刷新，直到 success / error；完成后刷新右侧历史列表
  // 总等待上限 300s：超过则视为任务卡住，停止轮询并提示刷新记录，避免无限转圈
  useEffect(() => {
    if (!viewingId) return undefined;
    let alive = true;
    let timer;
    let fail = 0;
    let waited = 0;
    const tick = () => {
      gliderAPI.detail(viewingId)
        .then((d) => {
          if (!alive) return;
          fail = 0;
          setPollFailed(false);
          setViewing(d);
          if (d.status !== 'running') {
            clearInterval(timer);
            setWaitSec(0);
            setPollTimedOut(false);
            loadHistory(); // 同步右侧历史列表状态（不再停在“运行中”）
          } else {
            waited += 2;
            setWaitSec(waited);
            if (waited >= 300) {
              clearInterval(timer);
              setPollTimedOut(true);
              setWaitSec(0);
              loadHistory();
            }
          }
        })
        .catch(() => {
          if (!alive) return;
          fail += 1;
          if (fail >= 3) {
            clearInterval(timer);
            setPollFailed(true);
            setWaitSec(0);
          }
        });
    };
    timer = setInterval(tick, 2000);
    const first = setTimeout(tick, 0);
    return () => { alive = false; clearInterval(timer); clearTimeout(first); };
  }, [viewingId]);

  // 模拟成功后加载结果图与飞行回放视频
  useEffect(() => {
    if (!viewing) return undefined;
    if (viewing.status !== 'success') {
      const t = setTimeout(() => setImg({ trajectory: null, telemetry: null, video: null }), 0);
      return () => clearTimeout(t);
    }
    let alive = true;
    const mimeOf = (name) => (name.endsWith('.mp4') ? 'video/mp4' : name.endsWith('.png') ? 'image/png' : 'application/octet-stream');
    const load = async (name) => {
      try {
        const res = await gliderAPI.file(viewing.id, name);
        if (!alive) return null;
        const blob = new Blob([res], { type: mimeOf(name) });
        return URL.createObjectURL(blob);
      } catch { return null; }
    };
    const hasVideo = !!viewing.result?.files?.video;
    (async () => {
      const [trajectory, telemetry, video] = await Promise.all([
        load('trajectory3d.png'),
        load('flight_telemetry.png'),
        hasVideo ? load('flight_replay.mp4') : Promise.resolve(null),
      ]);
      if (alive) setImg({ trajectory, telemetry, video });
    })();
    return () => { alive = false; };
  }, [viewing]);

  const startSim = async (values) => {
    setSubmitting(true);
    try {
      const r = await gliderAPI.simulate({
        dihedral_deg: values.dihedral,
        cg_x: values.cg,
        speed: values.speed,
      });
      setViewingId(r.id);
      setViewing(null);
      setPollFailed(false);
      setWaitSec(0);
      message.success('模拟已开始，正在计算…');
      loadHistory();
    } catch (err) {
      message.error(err?.response?.data?.error || '启动模拟失败');
    } finally {
      setSubmitting(false);
    }
  };

  const openRecord = (id) => {
    setViewingId(id);
    setViewing(null);
    setPollFailed(false);
    setWaitSec(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const meta = useMemo(() => stateMeta(viewing?.state), [viewing]);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')}>返回工作台</Button>
        <Title level={4} style={{ margin: 0 }}>🛩️ 滑翔机模拟实验室</Title>
      </Space>

      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="设定你的滑翔机参数，让物理引擎帮你试飞"
        description="输入机翼上反角、重心位置和初始投放速度，后台将运行真实气动仿真。滑翔时间越长、水平距离越远，说明你的设计越出色。"
      />

      <Row gutter={16}>
        {/* 左侧：参数表单 + 结果 */}
        <Col xs={24} lg={15}>
          <Card title={<Space><RocketOutlined /> 试飞参数设计</Space>} style={{ marginBottom: 16 }}>
            <Form
              form={form}
              layout="vertical"
              initialValues={{ dihedral: 5, cg: 0, speed: 36 }}
              onFinish={startSim}
            >
              <Form.Item
                name="dihedral"
                label="机翼上反角（°）"
                extra="两翼尖向上翘起的角度。上反角越大，横滚方向越稳定，飞机越不容易侧翻。"
                rules={[{ required: true, message: '请设置上反角' }]}
              >
                <InputNumber min={0} max={15} step={0.5} style={{ width: '100%' }} addonAfter="度" />
              </Form.Item>
              <Form.Item
                name="cg"
                label="重心位置（m，沿机头方向前移量）"
                extra="重心越靠前，飞机越“头重”、越稳定，但滑翔性能下降；重心太靠后则容易失速翻滚。"
                rules={[{ required: true, message: '请设置重心位置' }]}
              >
                <InputNumber min={-1.5} max={1.5} step={0.1} style={{ width: '100%' }} addonAfter="米" />
              </Form.Item>
              <Form.Item
                name="speed"
                label="初始投放速度（m/s）"
                extra="从 150 米高空投放时的初始空速。速度太低可能失速，太高则阻力增加。"
                rules={[{ required: true, message: '请设置初始速度' }]}
              >
                <InputNumber min={15} max={60} step={1} style={{ width: '100%' }} addonAfter="米/秒" />
              </Form.Item>
              <Button type="primary" htmlType="submit" icon={<ThunderboltOutlined />} loading={submitting} block>
                开始试飞
              </Button>
            </Form>
          </Card>

          {/* 模拟结果 */}
          {viewingId && (
            <Card
              title={`试飞 #${viewingId}`}
              style={{ marginBottom: 16 }}
              extra={viewing?.status === 'running' ? <Tag color="processing">模拟运行中…</Tag> : undefined}
            >
              {pollTimedOut ? (
                <Result status="warning" title="模拟疑似卡住"
                  subTitle="已等待超过 5 分钟仍未完成。请点击右侧“刷新记录”查看最新状态，或稍后重新提交。" />
              ) : pollFailed ? (
                <Result status="warning" title="暂时读不到模拟状态"
                  subTitle="后端可能仍在计算或已停止。请稍候点击右侧“刷新记录”，或直接刷新页面重试。" />
              ) : !viewing ? (
                <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
                  <Spin size="large" />
                  <Text type="secondary">已提交，正在读取模拟状态…</Text>
                </Space>
              ) : viewing.status === 'running' ? (
                  <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
                    <Spin size="large" />
                    <Text type="secondary">物理引擎正在计算并渲染全程回放（真 NovaPhy 通常约 1~3 分钟），已等待约 {waitSec} 秒…</Text>
                  </Space>
                ) : viewing.status === 'error' ? (
                  <Result status="error" title="本次试飞失败" subTitle={viewing.error || '模拟引擎异常'} />
                ) : (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Alert
                      type={meta.color === 'red' ? 'error' : meta.color === 'orange' ? 'warning' : 'success'}
                      showIcon
                      message={<Text strong>结果：{meta.label}</Text>}
                      description={STATE_TIPS[viewing.state] || '模拟完成。'}
                    />
                    <Row gutter={[8, 8]}>
                      <Col xs={12} sm={8}><Statistic title="滑翔时长" value={viewing.glide_time_s} suffix="s" /></Col>
                      <Col xs={12} sm={8}><Statistic title="水平距离" value={viewing.result?.distance_m ?? '—'} suffix="m" /></Col>
                      <Col xs={12} sm={8}><Statistic title="升阻比 L/D" value={viewing.result?.glide_ratio ?? '—'} /></Col>
                      <Col xs={12} sm={8}><Statistic title="平均下沉率" value={viewing.result?.mean_sink_mps ?? '—'} suffix="m/s" /></Col>
                      <Col xs={12} sm={8}><Statistic title="平均空速" value={viewing.result?.mean_speed_mps ?? '—'} suffix="m/s" /></Col>
                      <Col xs={12} sm={8}><Statistic title="落地高度" value={viewing.result?.alt_end ?? '—'} suffix="m" /></Col>
                    </Row>

                    {img.video && (
                      <Card size="small" title="✈️ 飞行过程回放（视频）" style={{ marginBottom: 16 }}>
                        <video src={img.video} type="video/mp4" controls autoPlay loop muted playsInline
                          style={{ width: '100%', borderRadius: 6, background: '#000' }} />
                        <Text type="secondary">3D 追逐视角回放：从投放到降落的完整飞行过程。</Text>
                      </Card>
                    )}

                    {img.trajectory ? (
                      <Card size="small" title="3D 飞行航迹（世界视角）">
                        <img src={img.trajectory} alt="3D 飞行航迹" style={{ width: '100%', borderRadius: 6 }} />
                      </Card>
                    ) : <Spin />}

                    {img.telemetry && (
                      <Card size="small" title="飞行遥测（高度 / 空速 / 迎角 / 下沉率 / L/D）">
                        <img src={img.telemetry} alt="飞行遥测" style={{ width: '100%', borderRadius: 6 }} />
                      </Card>
                    )}
                  </Space>
                )
              }
            </Card>
          )}
        </Col>

        {/* 右侧：试飞记录 */}
        <Col xs={24} lg={9}>
          <Card
            title={<Space><RocketOutlined /> 我的试飞记录</Space>}
            extra={<Button size="small" onClick={loadHistory}>刷新记录</Button>}
          >
            {loadingHistory ? <Spin /> : (
              history.length === 0 ? <Empty description="还没有试飞记录，先设计一架试试吧" /> : (
                <List
                  size="small"
                  dataSource={history}
                  renderItem={(item) => {
                    const m = stateMeta(item.state);
                    return (
                      <List.Item
                        onClick={() => openRecord(item.id)}
                        style={{ cursor: 'pointer', borderRadius: 6 }}
                      >
                        <List.Item.Meta
                          title={<Space>
                            <span>#{item.id}</span>
                            <Tag color={item.status === 'running' ? 'processing' : item.status === 'error' ? 'error' : m.color}>
                              {item.status === 'running' ? '运行中' : item.status === 'error' ? '失败' : m.label}
                            </Tag>
                          </Space>}
                          description={
                            <Space wrap size={[4, 0]}>
                              <Text type="secondary">上反角 {item.dihedral_deg}°</Text>
                              <Text type="secondary">重心 {item.cg_x > 0 ? '+' : ''}{item.cg_x} m</Text>
                              <Text type="secondary">速度 {item.speed} m/s</Text>
                              {item.glide_time_s != null && <Text type="secondary">· {item.glide_time_s}s</Text>}
                            </Space>
                          }
                        />
                        <Text type="secondary" style={{ fontSize: 12 }}>{formatBeijingTime(item.created_at)}</Text>
                      </List.Item>
                    );
                  }}
                />
              )
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
