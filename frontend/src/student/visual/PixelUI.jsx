import {copyText as siteText} from "../../content/copy";
import { useState } from 'react';
import { Button } from 'antd';
import PixelIcon from './PixelIcon';

export function PixelButton({ className = '', children, 'aria-label': ariaLabel, ...props }) {
  // 加载图标属于装饰，不能让原按钮的可访问名称在请求前后变化。
  return <Button className={`pixel-button ${className}`} aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)} {...props}>{children}</Button>;
}

export function PixelPanel({ children, className = '', as: Element = 'section', ...props }) {
  return <Element className={`pixel-panel ${className}`} {...props}>{children}</Element>;
}

export function PixelTag({ children, tone = 'neutral', className = '', ...props }) {
  return <span className={`pixel-tag pixel-tag--${tone} ${className}`} {...props}>{children}</span>;
}

export function PixelProgress({ value = 0, label = siteText("site.3e8981486e3d8653"), className = '' }) {
  const percent = Math.min(100, Math.max(0, Number(value) || 0));
  return <div className={`pixel-progress ${className}`}>
    <div className="pixel-progress-track" role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${percent}%` }} />
    </div>
    <span className="pixel-progress-value">{Math.round(percent)}%</span>
  </div>;
}

export function PixelImage({ src, alt = '', width, height, fallback, className = '', style, imageClassName = '', imageStyle, onLoad, onError, ...props }) {
  const [image, setImage] = useState({ src, status: 'loading' });
  const state = image.src === src ? image.status : 'loading';
  return <span className={`pixel-image pixel-image--${state} ${className}`} style={{ aspectRatio: width && height ? `${width} / ${height}` : undefined, ...style }}>
    {state !== 'error' && <img {...props} src={src} alt={alt} width={width} height={height} className={imageClassName} style={imageStyle}
      onLoad={(event) => { setImage({ src, status: 'ready' }); onLoad?.(event); }}
      onError={(event) => { setImage({ src, status: 'error' }); onError?.(event); }} />}
    {state === 'error' && <span className="pixel-image-fallback" role={alt ? 'img' : undefined} aria-label={alt || undefined}>{fallback || <PixelIcon name="map" size={48} />}</span>}
  </span>;
}
