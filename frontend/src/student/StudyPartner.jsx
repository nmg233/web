import {copyText as siteText} from "../content/copy";
import Sentence from '../content/Sentence';
import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PixelButton, PixelImage } from './visual/PixelUI';
import PixelIcon from './visual/PixelIcon';
import { pixelImageProps } from './visual/pixelAssets';

export default function StudyPartner() {
  const [collapsed, setCollapsed] = useState(true);
  const dock = useRef(null);
  const toggle = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const courseId = location.pathname.match(/^\/courses\/(\d+)/)?.[1];
  useLayoutEffect(() => {
    const element = dock.current;
    const shell = element.closest('.student-shell');
    // Reserve the actual dock height, including narrow-screen wrapping and safe areas.
    // The dock stays below notification/menu/modal layers and never grows over the last form action.
    let previousHeight = element.getBoundingClientRect().height;
    const reserve = () => {
      const height = element.getBoundingClientRect().height;
      shell.style.setProperty('--student-partner-space', `${height}px`);
      // Opening the dock must also keep the formerly visible lower controls above it.
      if (height > previousHeight) window.scrollBy({ top: height - previousHeight, behavior: 'instant' });
      previousHeight = height;
    };
    reserve();
    const observer = new ResizeObserver(reserve);
    observer.observe(element);
    return () => {
      observer.disconnect();
      shell.style.setProperty('--student-partner-space', '0px');
    };
  }, []);
  const close = () => { setCollapsed(true); toggle.current?.focus(); };
  return <aside ref={dock} className={`student-partner${collapsed ? ' student-partner--collapsed' : ''}`} aria-label={siteText("site.06b77d3d99ae4f63")} data-testid="study-partner"
    onKeyDown={(event) => { if (event.key === 'Escape' && !collapsed) { event.preventDefault(); close(); } }}>
    <div className="student-partner-bar">
      <button ref={toggle} type="button" className="student-partner-toggle" aria-label={collapsed ? siteText("site.dd73858ab12cc099") : siteText("site.646e8619b4edc66e")}
        aria-expanded={!collapsed} aria-controls={collapsed ? undefined : 'student-partner-actions'} onClick={() => setCollapsed((value) => !value)}>
        {collapsed ? <PixelImage className="student-partner-image student-partner-image--compact" {...pixelImageProps('companion-cat', '32px')} alt="" fallback={<PixelIcon name="cat" size={32} />} /> : <PixelIcon name="close" size={16} />}
        <span>{collapsed ? siteText("site.dd73858ab12cc099") : siteText("site.646e8619b4edc66e")}</span>
      </button>
      {!collapsed && <div className="student-partner-expanded" id="student-partner-actions">
        <div className="student-partner-intro">
          <PixelImage className="student-partner-image" {...pixelImageProps('companion-cat', '48px')} alt="" fallback={<PixelIcon name="cat" size={48} />} />
          <div><strong>{siteText("site.5d62c0bd614a81c5")}</strong><Sentence>{siteText("site.83c57a01a5cee346")}</Sentence></div>
        </div>
        <PixelButton aria-label={siteText("site.bfc47dd43decdb91")} onClick={() => navigate(`/dashboard/ai${courseId ? `?course_id=${courseId}` : ''}`)}>{siteText("site.84b1cf9b0efc27d6")}</PixelButton>
      </div>}
    </div>
  </aside>;
}
