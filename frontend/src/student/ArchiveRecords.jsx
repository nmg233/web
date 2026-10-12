import Sentence from '../content/Sentence';
import {reflectionFields} from './reflectionModel';
import {copyText,copyFragment} from '../content/copy';
import { Empty, Pagination } from 'antd';
import Link from './space/SpaceLink';

import { useState } from 'react';
import { formatBeijingTime } from '../utils/date';
import { workStatus } from './archiveModel';
import { PixelTag } from './visual/PixelUI';
import PixelIcon from './visual/PixelIcon';

export function WorkRecords({ works, compact = false }) {
  const [page, setPage] = useState(1);
  if (!works.length) return <Empty description={copyText('system.records.001')} />;
  const current = Math.min(page, Math.ceil(works.length / 8));
  const visible = compact ? works.slice(0, 5) : works.slice((current - 1) * 8, current * 8);
  return <><ul className="archive-work-list" aria-label={copyText('system.records.002')}>{visible.map((work) => {
    const status = workStatus(work);
    return <li key={work.id} className="archive-work-row">
      <span className="archive-file-icon" aria-hidden="true"><PixelIcon name="book" /></span>
      <div className="archive-work-main"><Link className="archive-record-title" to={`/works/${work.id}`}>{work.title}</Link><Sentence>{work.course_title || copyText('system.records.003')}{work.task_title ? ` · ${work.task_title}` : ''}</Sentence><Sentence>{copyFragment('system.records.004')}{work.version || 1}{copyFragment('system.records.005')}{formatBeijingTime(work.created_at)}</Sentence></div>
      <PixelTag tone={status.tone}>{status.label}</PixelTag>
      <Link className="archive-record-action" to={`/works/${work.id}`}>{status.revisable ? copyText('system.records.006') : copyText('system.records.007')}</Link>
    </li>;
  })}</ul>{!compact && works.length > 8 && <Pagination current={current} pageSize={8} total={works.length} onChange={setPage} showSizeChanger={false} />}</>;
}

export function ReflectionFields({ reflection }) {
  return <dl className="archive-reflection-fields">{reflectionFields(reflection).map(([field, id]) => <div key={field}><dt>{copyText(id)}</dt><Sentence as="dd">{reflection[field] || copyText('system.records.012')}</Sentence></div>)}</dl>;
}
