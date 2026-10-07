import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './MarkdownContent.css';

// ReactMarkdown 不执行原始 HTML，并过滤 javascript 等危险链接。
export default function MarkdownContent({ children }) {
  return <div className="markdown-content"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{children || ''}</ReactMarkdown></div>;
}
