import Alert from '../../student/visual/StudentAlert';
import Sentence from '../../content/Sentence';
import { useState } from 'react';

import { PixelButton, PixelImage, PixelPanel, PixelProgress, PixelTag } from './PixelUI';
import PixelIcon from './PixelIcon';
import { pixelImageProps } from './pixelAssets';

const icons = ['map', 'lab', 'archive', 'continue', 'back', 'notification', 'coin', 'help', 'user', 'close', 'menu', 'chevron-down', 'check', 'clock', 'pin', 'book', 'cat'];
const assets = [
  { file: 'hero-voyage.png', title: '远航环境页头', note: '横向裁切；文字放在独立阅读层。' },
  { file: 'course-voyage.png', title: '通用探索课程封面', note: '仅用于后端没有封面时，不代表正式课程内容。' },
  { file: 'island-observatory.png', title: '观测浮岛模块', note: '透明场景模块；维持比例，组合使用。' },
  { file: 'island-relay.png', title: '通讯浮岛模块', note: '透明场景模块；不作为章节归属依据。' },
  { file: 'planet-ring-v2.png', title: '环状星体模块', note: '透明远景装饰；不承载正文。' },
  { file: 'companion-cat.png', title: '原创学习伙伴', note: '透明静态小猫；承接原提问入口。' },
];

export default function PixelPreview() {
  const [selected, setSelected] = useState(2);
  return <div className="pixel-preview">
    <h1>晴空观测站 · 素材与组件</h1>
    <Sentence className="pixel-preview-note">Pixel v1 / 开发预览。以下数值与节点仅用于查看组件状态，不代表课程进度、正式内容或奖励。</Sentence>
    <Alert type="info" showIcon title="原创素材库" description={<span>图像由本项目使用图像工具生成，SVG 图标由本项目绘制。来源、尺寸与用途见 <a href="/assets/pixel-v1/manifest.json" target="_blank" rel="noreferrer">素材清单 manifest.json</a>。</span>} />
    <h2>按钮与交互状态</h2>
    <PixelPanel><div className="pixel-preview-buttons">
      {[
        { name: '默认', className: '' }, { name: '悬停', className: 'pixel-demo-hover' },
        { name: '按下', className: 'pixel-demo-pressed' }, { name: '键盘聚焦', className: 'pixel-demo-focus' },
        { name: '禁用', disabled: true }, { name: '加载', loading: true },
      ].map(({ name, ...props }) => <div className="pixel-preview-state" key={name}><span>{name}</span><PixelButton type="primary" {...props} icon={props.loading ? undefined : <PixelIcon name="continue" />}>{props.loading ? '处理中' : '继续探索'}</PixelButton></div>)}
    </div></PixelPanel>
    <h2>面板、状态标签与进度</h2>
    <PixelPanel><h3>独立的清晰阅读面板</h3><Sentence>正文保持易读，不叠在复杂场景上。状态同时用文字和色彩说明。</Sentence>
      <div className="pixel-preview-row" style={{ margin: '16px 0' }}><PixelTag>未开始</PixelTag><PixelTag tone="current">当前课时</PixelTag><PixelTag tone="success">已完成</PixelTag><PixelTag tone="warning">待评审</PixelTag><PixelTag tone="danger">需修改</PixelTag></div>
      <PixelProgress label="预览示例进度" value={60} />
    </PixelPanel>
    <h2>可操作路线节点</h2>
    <PixelPanel><Sentence>用鼠标或键盘选择节点。此处只展示选择状态，不代表实际关卡或解锁条件。</Sentence><div className="pixel-preview-route">
      {[1, 2, 3].map((number) => <button type="button" key={number} className="pixel-preview-node" aria-label={`预览节点 ${number}`} aria-current={number === selected ? 'step' : undefined} onClick={() => setSelected(number)}>{number}</button>)}
    </div><PixelTag tone="current">当前选中示例节点 {selected}</PixelTag></PixelPanel>
    <h2>原创整数网格图标</h2>
    <PixelPanel><div className="pixel-preview-row">{icons.map((name) => <div className="pixel-preview-icon" key={name}><PixelIcon name={name} size={48} /><span>{name}</span></div>)}</div></PixelPanel>
    <h2>成套场景与伙伴</h2>
    <div className="pixel-preview-assets">{assets.map((asset) => <PixelPanel as="figure" className="pixel-preview-asset" key={asset.file}>
      <PixelImage {...pixelImageProps(asset.file.replace('.png', ''), '(max-width: 600px) calc(100vw - 80px), 320px')} alt={asset.title} width={4} height={3} loading="lazy" />
      <figcaption><strong>{asset.title}</strong><div><a href={`/assets/pixel-v1/${asset.file}`} target="_blank" rel="noreferrer">{asset.file} · 查看母版</a></div><Sentence>{asset.note}</Sentence></figcaption>
    </PixelPanel>)}</div>
  </div>;
}
