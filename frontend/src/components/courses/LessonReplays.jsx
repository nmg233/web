import { Button, Popconfirm, Space, Typography } from 'antd';
import { UploadOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import SignedReplayPlayer from '../common/SignedReplayPlayer';

export default function LessonReplays({ lesson, replays, canEdit, playing, onUpload, onEdit, onDelete, onPlay }) {
  const bound = replays.filter((replay) => Number(replay.lesson_id) === Number(lesson.id));
  const formal=['legacy','published'].includes(lesson.publication_state);
  const writable = canEdit && lesson.status !== 'cancelled' && !formal;
  return (
    <section aria-label={`${lesson.title}的课时视频`} style={{ marginTop: 12 }}>
      <Space wrap>
        <Typography.Text strong>本课时视频（{bound.length}）</Typography.Text>
        {canEdit&&formal&&<Typography.Text type="secondary">正式课时需先在内容维护中“关闭并编辑”，再上传或修改视频。</Typography.Text>}
        {writable && <Button size="small" icon={<UploadOutlined />} onClick={() => onUpload(lesson)}>上传本课时视频</Button>}
      </Space>
      {!bound.length && <div><Typography.Text type="secondary">暂无绑定到本课时的视频；课程共享回放不替代本课时视频。</Typography.Text></div>}
      {bound.map((replay) => <div key={replay.id} style={{ marginTop: 8 }}>
        <Space wrap>
          <Typography.Text>{replay.title}</Typography.Text>
          <Button size="small" type="link" onClick={() => onPlay(replay.id)}>播放</Button>
          {writable && <>
            <Button size="small" type="link" icon={<EditOutlined />} onClick={() => onEdit(replay)}>编辑视频信息</Button>
            <Popconfirm title="确定删除该回放？已有学习快照引用的视频不能删除。" okText="删除" cancelText="取消" onConfirm={() => onDelete(replay.id)}>
              <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          </>}
        </Space>
        {replay.description && <div><Typography.Text type="secondary">{replay.description}</Typography.Text></div>}
        {playing?.id === replay.id && <SignedReplayPlayer key={replay.id} replayId={replay.id} initialUrl={playing.url} />}
      </div>)}
    </section>
  );
}
