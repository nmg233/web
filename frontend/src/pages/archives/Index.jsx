import { useState, useEffect } from 'react';
import { Card, Tree, Button, Typography, Spin, Descriptions, Tag, List, Space, Progress, Modal, Input, message } from 'antd';
import { UserOutlined, FileTextOutlined } from '@ant-design/icons';
import { archiveAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';

const { Title, Text } = Typography;

export default function ArchiveIndex() {
  const { user } = useAuth();
  const [treeData, setTreeData] = useState([]);
  const [archive, setArchive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [record, setRecord] = useState('');

  useEffect(() => {
    if (user?.role === 'student') {
      return;
    }
    archiveAPI.getTree().then((res) => {
      const tree = res.tree || res;
      if (tree.schools) {
        setTreeData(tree.schools.map((school) => ({
          title: `🏫 ${school.name}`,
          key: `school-${school.id}`,
          children: (school.classes || []).map((cls) => ({
            title: `📚 ${cls.grade ? `${cls.grade} - ` : ''}${cls.name}`,
            key: `class-${cls.id}`,
            children: [
              ...(cls.roles?.student || []).map((s) => ({
                title: s.real_name,
                key: `user-${s.id}`, icon: <UserOutlined />, isLeaf: true,
              })),
            ],
          })),
        })));
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user?.role]);

  const handleSelect = async (keys) => {
    if (!keys.length) return;
    const key = keys[0];
    if (!key.startsWith('user-')) return;
    const studentId = key.replace('user-', '');
    setSelectedStudentId(studentId);
    setDetailLoading(true);
    try {
      const res = await archiveAPI.generate(studentId);
      setArchive(res);
    } catch { /* handled */ }
    finally { setDetailLoading(false); }
  };

  // Student view: show own archive
  if (user?.role === 'student') {
    return (
      <div>
        <Title level={4}>📂 我的成长档案</Title>
        {detailLoading ? <Spin /> : archive ? (
          <ArchiveDetail archive={archive} />
        ) : (
          <Card>
            <Button type="primary" onClick={async () => {
              setDetailLoading(true);
              try { const res = await archiveAPI.generate(user.id); setArchive(res); } catch { /* handled */ }
              finally { setDetailLoading(false); }
            }}>查看我的档案</Button>
          </Card>
        )}
      </div>
    );
  }

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  return (
    <div>
      <Title level={4}>📂 成长档案</Title>
      <div style={{ display: 'flex', gap: 16 }}>
        <Card title="学生列表" style={{ width: 320, maxHeight: '70vh', overflow: 'auto' }}>
          <Tree treeData={treeData} onSelect={handleSelect} showIcon defaultExpandAll={false} />
        </Card>
        <Card title="档案详情" style={{ flex: 1 }}>
          {detailLoading ? <Spin /> : archive ? <><Space style={{ marginBottom: 16 }}><Button onClick={() => window.print()}>导出 PDF</Button><Button type="primary" onClick={() => setRecordOpen(true)}>添加成长记录</Button></Space><ArchiveDetail archive={archive} /></> : <Text type="secondary">请从左侧选择学生查看档案</Text>}
        </Card>
      </div>
      <Modal title="添加成长记录" open={recordOpen} onCancel={() => setRecordOpen(false)} onOk={async () => { if (!record.trim()) return; await archiveAPI.addGrowthRecord({ student_id: selectedStudentId, description: record }); message.success('成长记录已添加'); setRecord(''); setRecordOpen(false); handleSelect([`user-${selectedStudentId}`]); }}><Input.TextArea rows={4} value={record} onChange={(e) => setRecord(e.target.value)} /></Modal>
    </div>
  );
}

function ArchiveDetail({ archive }) {
  if (!archive) return null;
  return (
    <div>
      <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="姓名">{archive.student?.real_name}</Descriptions.Item>
        <Descriptions.Item label="学校">{archive.student?.school_name}</Descriptions.Item>
        <Descriptions.Item label="班级">{archive.student?.class_name}</Descriptions.Item>
        <Descriptions.Item label="生成时间">{archive.generatedAt}</Descriptions.Item>
      </Descriptions>

      <Title level={5}>能力评分</Title>
      <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>{[['problem_discovery','问题发现'],['solution_design','方案设计'],['hands_on','动手操作'],['data_analysis','数据分析'],['presentation','表达展示']].map(([key,label]) => <div key={key}><Text>{label}：{archive.ability?.[key] || 0} / 5</Text><Progress percent={(archive.ability?.[key] || 0) * 20} showInfo={false} /></div>)}</Space>

      <Title level={5}>成长轨迹</Title>
      <List dataSource={archive.growthRecords || []} locale={{ emptyText: '暂无成长记录' }} renderItem={(item) => <List.Item><List.Item.Meta title={<Space><span>{item.description}</span><Tag color={item.event_type === 'teacher' ? 'blue' : 'default'}>{item.event_type === 'teacher' ? '教师标记' : '系统记录'}</Tag></Space>} description={item.created_at} /></List.Item>} />

      <Title level={5}>参与课程</Title>
      <List dataSource={archive.courses || []} renderItem={(c) => (
        <List.Item><Tag>{c.difficulty}</Tag> {c.title}</List.Item>
      )} />

      <Title level={5}>提交作品</Title>
      <List dataSource={archive.works || []} renderItem={(w) => (
        <List.Item><FileTextOutlined style={{ marginRight: 8 }} />{w.title}</List.Item>
      )} />

      <Title level={5}>反思日志</Title>
      <List dataSource={archive.reflections || []} renderItem={(r) => (
        <List.Item>
          <List.Item.Meta
            title={r.lesson_title || '—'}
            description={
              <Space direction="vertical" size={0}>
                {r.difficulty && <Text>困难：{r.difficulty}</Text>}
                {r.solution && <Text>解决方式：{r.solution}</Text>}
                {r.improvement && <Text>改进收获：{r.improvement}</Text>}
                {r.new_question && <Text>新问题：{r.new_question}</Text>}
              </Space>
            }
          />
        </List.Item>
      )} />

      {archive.evaluations?.length > 0 && (
        <>
          <Title level={5}>教师评价</Title>
          <List dataSource={archive.evaluations} renderItem={(ev) => (
            <List.Item>
              <List.Item.Meta
                title={`${ev.evaluator_name} 的评价`}
                description={`${ev.eval_type ? `${ev.eval_type} · ` : ''}${ev.score != null ? `得分 ${ev.score}` : ''}${ev.comment ? `：${ev.comment}` : ''}`}
              />
            </List.Item>
          )} />
        </>
      )}
    </div>
  );
}
