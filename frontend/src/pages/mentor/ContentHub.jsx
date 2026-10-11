import {copyText as siteText} from "../../content/copy";
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, Progress, Space, Table, Tag, Typography } from 'antd';
import { EditOutlined, SearchOutlined } from '@ant-design/icons';
import { learningManageAPI } from '../../api';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';
import {maintenanceText as c} from '../courses/maintenanceCopy';

export default function ContentHub() {
  const navigate = useNavigate();
  const [lessons, setLessons] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try { setLessons((await learningManageAPI.lessons()).lessons || []); }
    catch (err) { setError(err?.response?.data?.error || siteText("site.f353b5f323abc198")); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);
  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return keyword ? lessons.filter((item) => `${item.course_title} ${item.title}`.toLowerCase().includes(keyword)) : lessons;
  }, [lessons, search]);
  const columns = [
    { title: siteText("site.ab6426ed102628ab"), dataIndex: 'course_title', render: (value, row) => <Space direction="vertical" size={0}><Typography.Text strong>{value}</Typography.Text><Tag>{row.course_status === 'published' ? siteText("site.39e7ec4eb9f87e10") : row.course_status === 'draft' ? siteText("site.486dd903076cdd6a") : siteText("site.960fd7c87920ac09")}</Tag></Space> },
    { title: siteText("site.6d4dd9aac8f24b67"), dataIndex: 'title' },
    { title: siteText("site.61abb262a2c65267"), render: (_, row) => <div style={{ minWidth: 160 }}><Progress percent={row.card_count ? Math.round(row.published_card_count / row.card_count * 100) : 0} size="small" /><Typography.Text type="secondary">{row.published_card_count}/{row.card_count}{siteText("site.e764f19b6a8f2858")}</Typography.Text></div> },
    { title: siteText("site.1a6054e363156ca0"), dataIndex: 'exercise_count', render: (value) => `${value || 0} 题` },
    { title: siteText("site.2f1f89571f9a3b2b"), render: (_, row) => <Space wrap><Button onClick={()=>navigate(`/courses/${row.course_id}?tab=maintenance`)}>{c('title')}</Button><Button type="primary" icon={<EditOutlined />} disabled={row.course_status === 'archived'} onClick={() => navigate(`/courses/${row.course_id}/lessons/${row.id}/content`)}>{row.course_status === 'archived' ? siteText("site.41b2b33d0751a5ab") : siteText("site.5e6784584c45972d")}</Button></Space> },
  ];
  return <PageContainer title={siteText("site.ad43f3be71e882c9")} description={siteText("site.b1468f121be8cc32")} extra={<Input allowClear prefix={<SearchOutlined />} placeholder={siteText("site.2b428847bff57103")} value={search} onChange={(e) => setSearch(e.target.value)} />}>
    <Card className="content-card"><AsyncPageState loading={loading} error={error} onRetry={load} empty={!visible.length} emptyText={siteText("site.e842fcae65f18285")}><Table rowKey="id" columns={columns} dataSource={visible} pagination={{ pageSize: 12 }} scroll={{ x: 760 }} /></AsyncPageState></Card>
  </PageContainer>;
}
