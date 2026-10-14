import {copyText,copyTemplate} from '../../content/copy';
import Sentence from '../../content/Sentence';
import {StudyHeader} from '../visual/StudyUI';
import {PixelPanel} from '../visual/PixelUI';
import StudentGuideDocument from './StudentGuideDocument';
import {studentGuideDocument} from './guideContent';
import './student-guide.css';

export default function StudentGuide() {
  return <div className="guide-page" data-testid="student-guide-page">
    <StudyHeader eyebrow={copyText('guide.eyebrow')} title={copyText('guide.title')} description={copyText('guide.intro')} />
    <PixelPanel className="guide-page-panel">
      <StudentGuideDocument document={studentGuideDocument} />
    </PixelPanel>
    <Sentence as="p" className="guide-page-footnote">{copyTemplate('guide.updatedAt',{slot0:studentGuideDocument.updatedAt})}。{studentGuideDocument.footnote}</Sentence>
  </div>;
}
