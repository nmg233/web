import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Descriptions, Empty, Space, Tag, Typography, message } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { courseAPI, workAPI } from '../../api';

const { Title, Text } = Typography;

const REVIEW_STATUS = {
  pending: { label: '待批改', color: 'orange' },
  rejected: { label: '需修改', color: 'red' },
  approved: { label: '已通过', color: 'green' },
};

// 课程回顾页：面向线下课程的课后回顾（摘要/回放/资料/任务/我的提交）。
// 不再提供手动进度标记；视频播放进度由播放器原生提供。
export default function Learning() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [replays, setReplays] = useState([]);
  const [replayUrl, setReplayUrl] = useState(null);
  const [works, setWorks] = useState([]);

  const load = async () => {
    try {
      const res = await courseAPI.detail(id);
      setData(res);
      courseAPI.listReplays(id).then((r) => setReplays(r.replays || [])).catch(() => {});
      workAPI.list({ course_id: id }).then((r) => setWorks(r.works || [])).catch(() => {});
    } catch {
      message.error('加载学习内容失败');
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  if (!data) return null;
  const { course, tasks, resources } = data;

  const playReplay = async (replayId) => {
    try {
      const res = await courseAPI.streamUrl(replayId);
      setReplayUrl(res.url);
    } catch { /* handled */ }
  };

  const downloadResource = async (r) => {
    try {
      const blob = await courseAPI.downloadResource(r.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = r.title || '课程资源';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch { /* handled */ }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/courses/${id}`)}>返回课程</Button>
        <Title level={4} style={{ margin: 0 }}>课程回顾：{course.title}</Title>
      </Space>

      {/* ① 课程摘要 */}
      <Card title="📖 课程摘要" style={{ marginBottom: 16 }}>
        <Descriptions column={1} size="small">
          {course.driving_question && (
            <Descriptions.Item label="驱动问题">{course.driving_question}</Descriptions.Item>
          )}
          <Descriptions.Item label="课程简介">
            {course.description || '暂无简介，请结合课堂内容与资料学习。'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* ② 课程回放 */}
      <Card title="🎬 课程回放" style={{ marginBottom: 16 }}>
        {replayUrl && <video controls src={replayUrl} style={{ width: '100%', maxHeight: 420, marginBottom: 16, background: '#000' }} />}
        {replays.length === 0 ? (
          <Empty description="暂无课程回放" />
        ) : (
          replays.map((replay) => (
            <Card key={replay.id} size="small" style={{ marginBottom: 8 }}>
              <Space>
                <PlayCircleOutlined />
                <span>{replay.title}</span>
                {replay.recording_date && <Tag>{replay.recording_date}</Tag>}
                {replay.duration_seconds && <Tag>{Math.round(replay.duration_seconds / 60)} 分钟</Tag>}
                <Button size="small" type="link" onClick={() => playReplay(replay.id)}>播放</Button>
              </Space>
            </Card>
          ))
        )}
      </Card>

      {/* ③ 课堂资料 */}
      <Card title="📁 课堂资料" style={{ marginBottom: 16 }}>
        {resources.length === 0 ? (
          <Empty description="暂无课堂资料" />
        ) : (
          resources.map((r) => (
            <Card key={r.id} size="small" style={{ marginBottom: 8 }}>
              <Space>
                <Tag>{r.resource_type}</Tag>
                <span>{r.title}</span>
                {r.has_file && (
                  <Button size="small" type="link" icon={<DownloadOutlined />} onClick={() => downloadResource(r)}>下载</Button>
                )}
              </Space>
            </Card>
          ))
        )}
      </Card>

      {/* ④ 课后任务 */}
      <Card title="✅ 课后任务" style={{ marginBottom: 16 }}>
        {tasks.length === 0 ? (
          <Empty description="暂无课后任务" />
        ) : (
          tasks.map((task) => (
            <Card key={task.id} size="small" style={{ marginBottom: 8 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space wrap>
                  <Text strong>{task.title}</Text>
                  {task.deadline && <Tag>截止 {task.deadline}</Tag>}
                </Space>
                {task.lesson_title && <Text type="secondary">所属课时：{task.lesson_title}</Text>}
                <Button size="small" type="link" onClick={() => navigate(`/tasks/${task.id}`)}>查看任务详情</Button>
              </Space>
            </Card>
          ))
        )}
      </Card>

      {/* ⑤ 我的提交 */}
      <Card title="📤 我的提交" style={{ marginBottom: 16 }}>
        {works.length === 0 ? (
          <Empty description="本课程还没有提交记录" />
        ) : (
          works.map((w) => (
            <Card key={w.id} size="small" style={{ marginBottom: 8 }}>
              <Space>
                <span>{w.title}</span>
                <Tag>第 {w.version || 1} 版</Tag>
                <Tag color={(REVIEW_STATUS[w.review_status] || {}).color}>
                  {(REVIEW_STATUS[w.review_status] || {}).label || w.review_status}
                </Tag>
                <Button size="small" type="link" onClick={() => navigate(`/works/${w.id}`)}>查看</Button>
              </Space>
            </Card>
          ))
        )}
      </Card>
    </div>
  );
}
