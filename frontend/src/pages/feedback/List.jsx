import {copyText as siteText} from "../../content/copy";
import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Pagination, Table } from 'antd';
import { feedbackAPI } from '../../api';
import FeedbackFilters from '../../components/feedback/FeedbackFilters';
import FeedbackStatusTag from '../../components/feedback/FeedbackStatusTag';
import { feedbackTypes } from '../../constants/feedback';
import { useAuth } from '../../store/AuthContext';
import { formatBeijingTime } from '../../utils/date';
import useRemoteResource from '../../hooks/useRemoteResource';
import { ServicePage, ServicePanel, ReadState } from '../../components/ServiceUI';

function Results({ filters, setFilters, student }) {
  const navigate = useNavigate();
  const read = useCallback(async () => (await feedbackAPI.mine(filters)).data, [filters]);
  const resource = useRemoteResource(read);
  const items = resource.data?.items || [], pagination = resource.data?.pagination;
  const change = (page, pageSize) => setFilters((current) => ({ ...current, page, pageSize }));
  const columns = [
    { title: siteText("site.1e58cfc31d36fd3d"), dataIndex: 'feedback_no', render: (value, row) => <Button type="link" onClick={() => navigate(`/feedback/${row.id}`)}>{value}</Button> },
    { title: siteText("site.bc5f22e52a89c7c2"), dataIndex: 'title' }, { title: siteText("site.9c9f54790f8315ae"), dataIndex: 'type', render: (value) => feedbackTypes[value] || value },
    { title: siteText("site.88a91eb059a19a7b"), dataIndex: 'status', render: (value) => <FeedbackStatusTag status={value} /> },
    { title: siteText("site.79a729d421ebb3a6"), dataIndex: 'updated_at', render: formatBeijingTime },
  ];
  return <ReadState {...resource} object={siteText("site.cfd5c362774f7e7e")} empty={!items.length} emptyText={filters.status || filters.type ? siteText("site.d9a23a1768483e13") : siteText("site.b6b646cba74cb640")}>
    {student ? <><div className="feedback-list">{items.map((item) => <Link key={item.id} to={`/feedback/${item.id}`} className="feedback-row">
      <div><span className="feedback-number">{item.feedback_no}</span><FeedbackStatusTag status={item.status} /><span>{feedbackTypes[item.type] || item.type}</span></div>
      <h3>{item.title}</h3><footer><time>{formatBeijingTime(item.updated_at)}{siteText("site.d532f6b4886336cd")}</time><span>{siteText("site.4508ca2f6b09cb49")}</span></footer>
    </Link>)}</div>{pagination && <Pagination className="service-pagination" current={pagination.page} pageSize={pagination.pageSize} total={pagination.total} showSizeChanger showTotal={(total) => `共 ${total} 条`} onChange={change} />}</>
      : <Table rowKey="id" columns={columns} dataSource={items} pagination={pagination ? { current: pagination.page, pageSize: pagination.pageSize, total: pagination.total, onChange: change } : false} />}
  </ReadState>;
}
export default function FeedbackList() {
  const { user } = useAuth(), navigate = useNavigate();
  const [filters, setFilters] = useState({ page: 1, pageSize: 20 });
  return <ServicePage title={siteText("site.ec2398340a414418")} eyebrow={siteText("site.913582da835e185b")} description={siteText("site.dcbb20b6e9158a18")} actions={<Button type="primary" onClick={() => navigate('/feedback/new')}>{siteText("site.13d421ce44459ac3")}</Button>}>
    <ServicePanel><FeedbackFilters value={filters} onChange={setFilters} /><Results key={`${user.id}:${JSON.stringify(filters)}`} filters={filters} setFilters={setFilters} student={user.role === 'student'} /></ServicePanel>
  </ServicePage>;
}
