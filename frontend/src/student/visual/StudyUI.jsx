import { Typography } from 'antd';
import { PixelPanel } from './PixelUI';
import './pixel-study.css';
import {useLocation} from 'react-router-dom';
import {useCourseId} from '../useCourseApis';
import {useCoursePresentation} from '../space/CoursePresentation';
import SceneArt from '../space/SceneArt';
import Sentence from '../../content/Sentence';

export function StudyHeader({ eyebrow, title, description, children }) {
  const look=useCoursePresentation(),routeId=useCourseId(),id=routeId||look.id,{pathname}=useLocation(),voyage=id&&look.theme==='voyage';
  const scene=/\/(lab|glider)$/.test(pathname)?'observatory':/\/(archives|reflection)(?:\/|$)/.test(pathname)?'planet-base':'bridge';
  return <header className={'study-header'+(id?' course-page-header':'')}>
    {id&&<SceneArt name={voyage?scene:'campus'} className="course-page-scene" priority/>}
    <div className={id?'course-page-heading':undefined}>
    <div className="study-header-context">{eyebrow}</div>
    <div className="study-header-main"><div><Typography.Title level={2}>{title}</Typography.Title>{description && <Sentence>{description}</Sentence>}</div><div className="study-header-actions">{children}</div></div>
    </div>
  </header>;
}

export function StudySection({ number, title, description, children, className = '', ...props }) {
  return <PixelPanel className={`study-section ${className}`} {...props}>
    <header className="study-section-heading"><span className="study-section-number" aria-hidden="true">{number}</span><div><Typography.Title level={3}>{title}</Typography.Title>{description && <Sentence>{description}</Sentence>}</div></header>
    {children}
  </PixelPanel>;
}
