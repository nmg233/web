import {copyText as siteText, copyTemplate as siteTemplate} from "../../content/copy";
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Collapse, Descriptions, Empty, List, Progress, Space, Tag, Timeline, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { observerAPI } from '../../api';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';

import {ReflectionFields} from '../../student/ArchiveRecords';
export default function ObserverStudentDetail(){const{studentId}=useParams();return <ObserverStudentView key={studentId}/>;}
function ObserverStudentView() {
  const { studentId } = useParams(); const navigate = useNavigate(); const [data, setData] = useState(null); const [error, setError] = useState('');
  const load = () => { setError('');setData(null); observerAPI.student(studentId).then(setData).catch((err) => setError(err?.response?.data?.error || siteText("site.97c8fe502eb8f1f2"))); };
  useEffect(load, [studentId]); // eslint-disable-line react-hooks/set-state-in-effect
  if (!data) return <PageContainer title={siteText("site.67a8d3d9162a3388")}><AsyncPageState loading={!error} error={error} onRetry={load}><span /></AsyncPageState></PageContainer>;
  const { student } = data;
  return <PageContainer title={student.real_name} description={siteTemplate("site.430b4136c1f53f80", {slot0: (student.school_name || '-'), slot1: (student.class_name || '-')})} extra={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/observer/students')}>{siteText("site.a5c341df10bc6c32")}</Button>}>
    <Card className="content-card" style={{ marginBottom: 16 }}><Descriptions><Descriptions.Item label={siteText("site.b75d63159e320b4e")}>{student.username}</Descriptions.Item><Descriptions.Item label={siteText("site.40e9c4d3de0d365c")}>{student.grade || '-'}</Descriptions.Item><Descriptions.Item label={siteText("site.b9c78a60219ad681")}>{student.class_name || '-'}</Descriptions.Item></Descriptions></Card>
    <Card className="content-card" title={siteText("site.8dec1f309cfd81f1")} style={{ marginBottom: 16 }}><List dataSource={data.courses} locale={{ emptyText: <Empty description={siteText("site.1371f5ea9b012380")} /> }} renderItem={(c) => <List.Item><List.Item.Meta title={c.title} description={siteTemplate("site.18400437c533818b", {slot0: (c.completed_lessons), slot1: (c.lesson_count)})} /><Progress style={{ maxWidth: 240 }} percent={c.lesson_count ? Math.round(c.completed_lessons / c.lesson_count * 100) : 0} /></List.Item>} /></Card>
    <div className="learning-shell"><Card className="content-card" title={siteText("site.aeca63b7c92fc139")}><List dataSource={data.lessons} locale={{ emptyText: siteText("site.313949c7af90da1d") }} renderItem={(l) => <List.Item><List.Item.Meta title={`${l.course_title} · ${l.lesson_title}`} description={<Space direction="vertical"><Progress percent={l.progress || 0} size="small" /><Typography.Text>{l.summary || siteText("site.0410ea15f5b3366d")}</Typography.Text>{l.report_id&&<Collapse items={[{key:String(l.report_id),label:siteText("site.7b7ecaa8c7a9b6ad")+l.report_version+siteText("site.3926f66cf1e8ba35"),children:<>{['key_points','application','difficulties','next_plan'].map(k=>l[k]&&<p key={k}>{l[k]}</p>)}<p>{siteText("site.a06a0025582ad27d")}{l.score??siteText("site.22b114eec6b8485d")}</p></>}]}/>} {l.review_comment && <Typography.Text type="secondary">{siteText("site.64f9e5ba843ae390")}{l.review_comment}</Typography.Text>}</Space>} /><Tag>{l.report_status || siteText("site.838ab021b151fafb")}</Tag></List.Item>} /></Card>
      <Card className="content-card" title={siteText("site.49f5f7580884415c")}><Timeline items={data.timeline.map((event) => ({ children: <><Typography.Text>{event.description}</Typography.Text><br /><Typography.Text type="secondary">{event.created_at}</Typography.Text></> }))} /></Card></div>
    <Card className="content-card" title={siteText("site.a98523e7de62930b")} style={{marginTop:16}}><List dataSource={data.reflections||[]} renderItem={r=><List.Item><List.Item.Meta title={r.lesson_title||siteText("site.2e47fe4c0f706c7f")} description={<ReflectionFields reflection={r}/>}/></List.Item>}/></Card><Card className="content-card" title={siteText("site.d240054388e844fa")} style={{ marginTop: 16 }}><List dataSource={data.approved_works} locale={{ emptyText: siteText("site.0a98a2d113c16162") }} renderItem={(work) => <List.Item><List.Item.Meta title={work.title} description={`${work.course_title || ''} · ${work.task_title || ''}`} /><Tag color="green">{siteText("site.45c7a0fa7a8bf639")}</Tag></List.Item>} /></Card>
  </PageContainer>;
}
