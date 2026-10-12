import {copyText as siteText} from "../content/copy";
import Sentence from '../content/Sentence';
import {useCoursePresentation} from './space/CoursePresentation';
import { Button, Space, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { associatedExperiments } from './experimentConfig';
import { associatedExperimentLink } from './experimentContext';
import { PixelButton } from './visual/PixelUI';
import PixelIcon from './visual/PixelIcon';

export default function AssociatedExperiments({ courseId, lessonId, stage, cardId, variant = 'inline' }) {
  const navigate = useNavigate();
  const context = { courseId, lessonId, stage, cardId };
  const items = associatedExperiments(context, useCoursePresentation().experiments);
  if (!items.length) return null;
  if (variant === 'study') return <aside className="study-experiment" aria-label={siteText("site.75c0acdc159d58e6")}>
    <div className="study-experiment-heading"><PixelIcon name="lab" />{siteText("site.53d0f08c6a155792")}</div>
    <Space wrap>{items.map((item) => <PixelButton key={item.id} onClick={() => navigate(associatedExperimentLink(context, item.experiment))}>{item.label}</PixelButton>)}</Space>
    <Sentence className="study-help">{siteText("site.e0d1c9a6dbc958cb")}</Sentence>
  </aside>;
  return <Space wrap style={{ marginBottom: 16 }}>
    {items.map((item) => <Button key={item.id} onClick={() => navigate(associatedExperimentLink(context, item.experiment))}>{item.label}</Button>)}
    <Typography.Text type="secondary">{siteText("site.e0d1c9a6dbc958cb")}</Typography.Text>
  </Space>;
}
