import Sentence from '../../content/Sentence';
import './student-guide.css';

// 指南正文由 guideContent.js 提供；弹窗与 /guide 页面共用本渲染器。
export default function StudentGuideDocument({ document }) {
  return <article className="guide-document" data-testid="student-guide-document">
    {document.sections.map((section, index) => <section key={section.id} className="guide-section" aria-labelledby={`guide-${section.id}`}>
      <h2 id={`guide-${section.id}`}><span className="guide-section-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{section.title}</h2>
      {section.summary && <Sentence className="guide-summary">{section.summary}</Sentence>}
      {!!section.steps?.length && <ol className="guide-steps">{section.steps.map(text => <Sentence as="li" key={text}>{text}</Sentence>)}</ol>}
      {!!section.points?.length && <ul className="guide-points">{section.points.map(text => <Sentence as="li" key={text}>{text}</Sentence>)}</ul>}
      {section.notice && <Sentence as="p" className="guide-notice" role="note">{section.notice}</Sentence>}
    </section>)}
  </article>;
}
