import {copyText as siteText} from "../../content/copy";
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, Space, Table, Tag } from 'antd';
import { observerAPI } from '../../api';
import PageContainer from '../../components/common/PageContainer';
import AsyncPageState from '../../components/common/AsyncPageState';

export default function ObserverStudentList() {
  const navigate = useNavigate(); const [search, setSearch] = useState(''); const [data, setData] = useState({ items: [], pagination: {} }); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = async (page = 1) => { setLoading(true); setError(''); try { setData(await observerAPI.students({ page, page_size: 20, search })); } catch (err) { setError(err?.response?.data?.error || siteText("site.4c37c3be2daffa44")); } finally { setLoading(false); } };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);
  const columns = [{ title: siteText("site.9fc868217f0590d3"), render: (_, r) => <Space direction="vertical" size={0}><strong>{r.real_name}</strong><span>{r.username}</span></Space> }, { title: siteText("site.8ce095f64901863f"), render: (_, r) => `${r.school_name || '-'} / ${r.class_name || '-'}` }, { title: siteText("site.79de0b21260f7ce5"), dataIndex: 'completed_30d' }, { title: siteText("site.59daa04bd1aa9ce3"), dataIndex: 'pending_lessons' }, { title: siteText("site.9ee46bbe64d5d1a7"), dataIndex: 'risk_tags', render: (tags) => tags.map((tag) => <Tag color="orange" key={tag}>{tag}</Tag>) }, { title: siteText("site.232c4f4f56a776c3"), render: (_, r) => <Button type="link" onClick={() => navigate(`/observer/students/${r.id}`)}>{siteText("site.be8df684b70e2a2c")}</Button> }];
  return <PageContainer title={siteText("site.a41d8a39eaf5b8e3")} description={siteText("site.0095104785fe3910")} extra={<Input.Search style={{ width: 320, maxWidth: '100%' }} value={search} onChange={(e) => setSearch(e.target.value)} onSearch={() => load()} placeholder={siteText("site.fb7e59d25e7f0fd7")} allowClear />}><Card className="content-card"><AsyncPageState loading={loading} error={error} onRetry={() => load()} empty={!data.items.length} emptyText={siteText("site.8991cd4954294d86")}><Table rowKey="id" columns={columns} dataSource={data.items} scroll={{ x: 800 }} pagination={{ current: data.pagination.page, total: data.pagination.total, pageSize: 20, onChange: load }} /></AsyncPageState></Card></PageContainer>;
}
