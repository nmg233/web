import {copyText as siteText} from "../content/copy";
import { useEffect, useRef } from 'react';
import { Spin } from 'antd';
import { PixelPanel } from '../student/visual/PixelUI';
import './PageStatus.css';

// 身份确认之前保持中性，不展示任何账号内容；不接管请求或重试逻辑。
export function PageLoading({ children = siteText("site.ccf62e20016289fa") }) {
  return <div className="page-loading" role="status" aria-live="polite">
    <span aria-hidden="true"><Spin /></span><p>{children}</p>
  </div>;
}

export function StudentPageStatus({ title, description, code, children }) {
  const heading = useRef(null);
  // 只在阻断页面出现/切换时聚焦；后台警告仍由原 Alert 呈现，不抢表单焦点。
  useEffect(() => { heading.current?.focus(); }, [title]);
  return <div className="student-page-status">
    <PixelPanel aria-labelledby="student-status-title">
      {code && <span className="student-status-code" aria-hidden="true">{code}</span>}
      <h1 id="student-status-title" ref={heading} tabIndex={-1}>{title}</h1>
      <p>{description}</p>
      <div className="student-status-actions">{children}</div>
    </PixelPanel>
  </div>;
}
