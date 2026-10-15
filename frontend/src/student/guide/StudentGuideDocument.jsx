import ConfigCopyText from '../../content/ConfigText';
import Sentence from '../../content/Sentence';
import './student-guide.css';

// 指南正文由 guideContent.js 提供；弹窗与 /guide 页面共用本渲染器。
export default function StudentGuideDocument({ document }) {
  return <article className="guide-document" data-testid="student-guide-document">
    {document.sections.map((section, index) => <section key={section.id} className="guide-section" aria-labelledby={`guide-${section.id}`}>
      <h2 id={`guide-${section.id}`} data-copy-id={section.titleCopyId}><span className="guide-section-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><ConfigCopyText object={section} field="title" value={section.title}/></h2>
      {section.summary && <Sentence className="guide-summary" data-copy-id={section.summaryCopyId}><ConfigCopyText sentence object={section} field="summary" value={section.summary}/></Sentence>}
      {!!section.steps?.length && <ol className="guide-steps">{section.steps.map((text,i) => <Sentence as="li" key={text} data-copy-id={section.stepsCopyIds?.[i]}>{text}</Sentence>)}</ol>}
      {!!section.points?.length && <ul className="guide-points">{section.points.map((text,i) => <Sentence as="li" key={text} data-copy-id={section.pointsCopyIds?.[i]}>{text}</Sentence>)}</ul>}
      {section.notice && <Sentence as="p" className="guide-notice" data-copy-id={section.noticeCopyId} role="note"><ConfigCopyText sentence object={section} field="notice" value={section.notice}/></Sentence>}
    </section>)}
  </article>;
}
