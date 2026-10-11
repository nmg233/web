import {copyText as siteText, copyTemplate as siteTemplate} from "../../content/copy";
import { useState, useEffect, useRef } from 'react';
import { Card, Tree, Button, Typography, Spin, Descriptions, Tag, List, Space, Progress, Modal, Input, message, Row, Col, Statistic, Timeline } from 'antd';
import { UserOutlined, FileTextOutlined } from '@ant-design/icons';
import { archiveAPI } from '../../api';
import { useAuth } from '../../store/AuthContext';
import { formatBeijingTime } from '../../utils/date';
import StudentArchive from '../../student/StudentArchive';

import {ReflectionFields} from '../../student/ArchiveRecords';

const { Title, Text } = Typography;

export default function ArchiveIndex() {
  const { user } = useAuth();
  return user?.role === 'student' ? <StudentArchive /> : <StaffArchive key={user?.id} />;
}

function StaffArchive() {
  const { user } = useAuth();
  const [treeData, setTreeData] = useState([]);
  const [archive, setArchive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [record,setRecord]=useState(''),[detailError,setDetailError]=useState('');
  const requestSequence=useRef(0);
  // A request counter, invalidated on unmount.
  useEffect(()=>()=>{requestSequence.current++;},[]);

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
    const ticket=++requestSequence.current;setDetailError('');setSelectedStudentId(studentId);
    setArchive(null);
    setDetailLoading(true);
    try {
      const res = await archiveAPI.generate(studentId);
      if(ticket===requestSequence.current)setArchive(res);
    } catch(e) {if(ticket===requestSequence.current)setDetailError(e.response?.data?.error||siteText("site.8b6efdf05e5bb8c1"));}
    finally {if(ticket===requestSequence.current)setDetailLoading(false);}
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  return (
    <div>
      <Title level={4}>{siteText("site.5330d00929bd9bd3")}</Title>{detailError&&<p role="alert">{detailError}<Button onClick={()=>handleSelect(['user-'+selectedStudentId])}>{siteText("site.c1fda00380fb315b")}</Button></p>}
      {user?.role === 'academic_mentor' && <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>{siteText("site.4e0d8d6dd08d4d48")}</Text>}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Card title={siteText("site.eaeca9de1adec4d2")} style={{ width: 320, flex: '0 0 320px', maxWidth: '100%', maxHeight: '70vh', overflow: 'auto' }}>
          {treeData.length ? <Tree treeData={treeData} onSelect={handleSelect} showIcon defaultExpandAll={false} /> : <Text type="secondary">{siteText("site.4184c59ba4eb038a")}</Text>}
        </Card>
        <Card title={siteText("site.1775f3b4867300f1")} style={{ flex: 1, minWidth: 320 }}>
          {detailLoading ? <Spin /> : archive ? <><Space style={{ marginBottom: 16 }}><Button onClick={() => window.print()}>{siteText("site.000aeaa34ca2d479")}</Button>{['admin', 'academic_mentor'].includes(user?.role) && <Button type="primary" onClick={() => setRecordOpen(true)}>{siteText("site.a7663d2129e84ba0")}</Button>}</Space><ArchiveDetail archive={archive} /></> : <Text type="secondary">{siteText("site.603d5764cc2d68c1")}</Text>}
        </Card>
      </div>
      <Modal title={siteText("site.60652218f102109a")} open={recordOpen} onCancel={() => setRecordOpen(false)} onOk={async () => { if (!record.trim()) return; await archiveAPI.addGrowthRecord({ student_id: selectedStudentId, description: record }); message.success(siteText("site.6cdae16cb5483a96")); setRecord(''); setRecordOpen(false); handleSelect([`user-${selectedStudentId}`]); }}><Input.TextArea rows={4} value={record} onChange={(e) => setRecord(e.target.value)} /></Modal>
    </div>
  );
}

function ArchiveDetail({ archive }) {
  if (!archive) return null;
  // 概览统计：参与课程 / 项目作品（版本根去重） / 作品迭代（版本数） / 反思 / 评价
  const overview = [
    { label: siteText("site.2773c15ed88ef987"), value: archive.courses?.length ?? 0 },
    { label: siteText("site.3295aa700d615d88"), value: new Set((archive.works || []).map((w) => w.parent_work_id || w.id)).size },
    { label: siteText("site.b171dbd2f01adf98"), value: (archive.works || []).filter((w) => w.parent_work_id).length },
    { label: siteText("site.2a611bfb54c353e9"), value: archive.reflections?.length ?? 0 },
    { label: siteText("site.44c9c020c5bbd655"), value: archive.evaluations?.length ?? 0 },
  ];
  // 时间轴：成长记录为唯一事件源；作品仅在无对应成长记录时兜底合成（按 work_id 匹配，遗留数据按标题+时间完全匹配）
  const timeline = [
    ...(archive.growthRecords || []).map((g) => ({ at: g.created_at, text: g.description, kind: g.event_type })),
    ...(archive.works || [])
      .filter((w) => !(archive.growthRecords || []).some((g) => g.work_id === w.id
        || (g.work_id == null && g.created_at === w.created_at && g.description === `提交作品《${w.title}》`)))
      .map((w) => ({ at: w.created_at, text: siteTemplate("site.b805e9ffcfd8bf7d", {slot0: (w.title)}), kind: 'work' })),
    ...(archive.reflections || []).map((r) => ({ at: r.created_at, text: siteTemplate("site.1a93d354c5ecf81f", {slot0: (r.lesson_title || '课程反思')}), kind: 'reflection' })),
  ].filter((t) => t.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const kindColor = (kind) => (kind === 'work' ? 'blue' : kind === 'reflection' ? 'green' : 'gray');
  return (
    <div>
      <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label={siteText("site.da1a8366bd7004fd")}>{archive.student?.real_name}</Descriptions.Item>
        <Descriptions.Item label={siteText("site.fb6dc8df5c3062a9")}>{archive.student?.school_name}</Descriptions.Item>
        <Descriptions.Item label={siteText("site.942c771c6aa04b96")}>{archive.student?.class_name}</Descriptions.Item>
        <Descriptions.Item label={siteText("site.0ec6d2832e01ab07")}>{archive.generatedAt}</Descriptions.Item>
      </Descriptions>

      {/* 概览统计 */}
      <Title level={5}>{siteText("site.4b67dde2fcced3e5")}</Title>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {overview.map((o) => (
          <Col xs={12} sm={6} key={o.label}><Card size="small"><Statistic title={o.label} value={o.value} /></Card></Col>
        ))}
      </Row>

      <Title level={5}>{siteText("site.5af9f5975fc10d8f")}</Title>
      <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>{[['problem_discovery','问题发现'],['solution_design','方案设计'],['hands_on','动手操作'],['data_analysis','数据分析'],['presentation','表达展示']].map(([key,label]) => <div key={key}><Text>{label}：{archive.ability?.[key] || 0} / 5</Text><Progress percent={(archive.ability?.[key] || 0) * 20} showInfo={false} /></div>)}</Space>

      {/* 成长时间轴 */}
      <Title level={5}>{siteText("site.73a28b4ada50cad4")}</Title>
      {timeline.length > 0 ? (
        <Timeline style={{ marginBottom: 16 }}
          items={timeline.map((t) => ({
            color: kindColor(t.kind),
            children: (
              <div>
                <Text>{t.text}</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>{formatBeijingTime(t.at)}</Text>
              </div>
            ),
          }))}
        />
      ) : (
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>{siteText("site.66186b9b0ca8de79")}</Text>
      )}

      <Title level={5}>{siteText("site.4a4584ef52775150")}</Title>
      <List dataSource={archive.courses || []} renderItem={(c) => (
        <List.Item><Tag>{c.difficulty}</Tag> {c.title}</List.Item>
      )} />

      <Title level={5}>{siteText("site.b05b178d73339e7e")}</Title>
      <List dataSource={archive.works || []} renderItem={(w) => (
        <List.Item><FileTextOutlined style={{ marginRight: 8 }} />{w.title}</List.Item>
      )} />

      <Title level={5}>{siteText("site.87a6be2a4246bd37")}</Title>
      <List dataSource={archive.reflections || []} renderItem={(r) => (
        <List.Item>
          <List.Item.Meta
            title={r.lesson_title || '—'}
            description={
              <ReflectionFields reflection={r}/>
            }
          />
        </List.Item>
      )} />

      {archive.evaluations?.length > 0 && (
        <>
          <Title level={5}>{siteText("site.192e66010be3ebf5")}</Title>
          <List dataSource={archive.evaluations} renderItem={(ev) => (
            <List.Item>
              <List.Item.Meta
                title={siteTemplate("site.a74e19dea1afc5ed", {slot0: (ev.evaluator_name)})}
                description={`${ev.eval_type ? `${ev.eval_type} · ` : ''}${ev.score != null ? `得分 ${ev.score}` : ''}${ev.comment ? `：${ev.comment}` : ''}`}
              />
            </List.Item>
          )} />
        </>
      )}
    </div>
  );
}
