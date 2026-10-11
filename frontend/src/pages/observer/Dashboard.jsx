import {copyText as siteText} from "../../content/copy";
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, List, Space, Statistic, Tag, Typography } from 'antd';
import { observerAPI } from '../../api';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';

export default function ObserverDashboard() {
  const navigate = useNavigate(); const [data, setData] = useState(null); const [error, setError] = useState('');
  const load = () => { setError(''); observerAPI.dashboard().then(setData).catch((err) => setError(err?.response?.data?.error || siteText("site.ce2a7a7fea26cf33"))); };
  useEffect(load, []); // eslint-disable-line react-hooks/set-state-in-effect
  if (!data) return <PageContainer title={siteText("site.334ccdaf6214677e")}><AsyncPageState loading={!error} error={error} onRetry={load}><span /></AsyncPageState></PageContainer>;
  const s = data.stats;
  return <PageContainer title={siteText("site.334ccdaf6214677e")} description={siteText("site.ae4836766c5c25fe")} extra={<Button type="primary" onClick={() => navigate('/observer/students')}>{siteText("site.1c71ab270b4a6165")}</Button>}>
    <div className="metric-grid" style={{ marginBottom: 20 }}><Card><Statistic title={siteText("site.126f535626f02738")} value={s.assigned_students} /></Card><Card><Statistic title={siteText("site.4780f002d7474b72")} value={s.weekly_completed} /></Card><Card><Statistic title={siteText("site.3c62079ab7ac8676")} value={s.pending_students} /></Card><Card><Statistic title={siteText("site.4a58ac53942687bf")} value={s.risk_students} /></Card></div>
    <div className="learning-shell"><Card className="content-card" title={siteText("site.4a58ac53942687bf")}><List dataSource={data.risk_students} locale={{ emptyText: siteText("site.648d64c3bb5570d9") }} renderItem={(item) => <List.Item actions={[<Button key="view" type="link" onClick={() => navigate(`/observer/students/${item.id}`)}>{siteText("site.e4c2185b04f39571")}</Button>]}><List.Item.Meta title={item.real_name} description={<Space wrap>{item.school_name} · {item.class_name}{item.risk_tags.map((tag) => <Tag color="orange" key={tag}>{tag}</Tag>)}</Space>} /></List.Item>} /></Card>
      <Card className="content-card" title={siteText("site.a912125f4e064bf7")}><List dataSource={data.recent_reports} locale={{ emptyText: siteText("site.7d91698a869bea84") }} renderItem={(item) => <List.Item><List.Item.Meta title={`${item.student_name} · ${item.lesson_title}`} description={<Space><Typography.Text type="secondary">{item.course_title}</Typography.Text><Tag>{item.status}</Tag></Space>} /></List.Item>} /></Card></div>
  </PageContainer>;
}
