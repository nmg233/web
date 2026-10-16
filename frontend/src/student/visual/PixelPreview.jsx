import ConfigCopyText from '../../content/ConfigText';
import {runtimeText as runtimeCopyText} from '../../content/runtimeCopy';
import StudentCopyText from '../../content/ManagedText';
import Alert from '../../student/visual/StudentAlert';
import Sentence from '../../content/Sentence';
import { useState } from 'react';

import { PixelButton, PixelImage, PixelPanel, PixelProgress, PixelTag } from './PixelUI';
import PixelIcon from './PixelIcon';
import { pixelImageProps } from './pixelAssets';

const icons = ['map', 'lab', 'archive', 'continue', 'back', 'notification', 'coin', 'help', 'user', 'close', 'menu', 'chevron-down', 'check', 'clock', 'pin', 'book', 'cat'];
const assets = [
  { file: 'hero-voyage.png', get title(){return runtimeCopyText("student26.9f1a8409b0f919fc")}, get note(){return runtimeCopyText("student26.152d581b0a645d0f")} ,__copyIds:{"title":"student26.9f1a8409b0f919fc"}},
  { file: 'course-voyage.png', get title(){return runtimeCopyText("student26.2e218d3751bd118c")}, get note(){return runtimeCopyText("student26.57db18d7d9576165")} ,__copyIds:{"title":"student26.2e218d3751bd118c"}},
  { file: 'island-observatory.png', get title(){return runtimeCopyText("student26.5d3e49836ea6e6df")}, get note(){return runtimeCopyText("student26.607cf457eab1aa58")} ,__copyIds:{"title":"student26.5d3e49836ea6e6df"}},
  { file: 'island-relay.png', get title(){return runtimeCopyText("student26.bb3a39630f979369")}, get note(){return runtimeCopyText("student26.2c4142b5abae9f75")} ,__copyIds:{"title":"student26.bb3a39630f979369"}},
  { file: 'planet-ring-v2.png', get title(){return runtimeCopyText("student26.97c758b96cc0716b")}, get note(){return runtimeCopyText("student26.047c0a6ce4ab4eaf")} ,__copyIds:{"title":"student26.97c758b96cc0716b"}},
  { file: 'companion-cat.png', get title(){return runtimeCopyText("student26.3bd09c1f6d9fd0f7")}, get note(){return runtimeCopyText("student26.af37b0d80242b604")} ,__copyIds:{"title":"student26.3bd09c1f6d9fd0f7"}},
];

export default function PixelPreview() {
  const [selected, setSelected] = useState(2);
  return <div className="pixel-preview">
    <h1><StudentCopyText id="student26.60e817961b26e1c8"/></h1>
    <Sentence className="pixel-preview-note"><StudentCopyText id="student26.84a9b19593ef7251"/></Sentence>
    <Alert type="info" showIcon title={runtimeCopyText("student26.f55ffb1496e1fb8a")} description={<span><StudentCopyText id="student26.fcd940a784f2bb1b"/><a href="/assets/pixel-v1/manifest.json" target="_blank" rel="noreferrer"><StudentCopyText id="student26.1bf8e85a37ebd528"/></a>。</span>}  data-copy-bindings={JSON.stringify(["student26.f55ffb1496e1fb8a"])}/>
    <h2><StudentCopyText id="student26.23cfa45410ca7ae3"/></h2>
    <PixelPanel><div className="pixel-preview-buttons">
      {[
        { name: runtimeCopyText("student26.313d853b810820bb"), className: '' ,__copyIds:{"name":"student26.313d853b810820bb"}}, { name: runtimeCopyText("student26.e578714e958dfef8"), className: 'pixel-demo-hover' ,__copyIds:{"name":"student26.e578714e958dfef8"}},
        { name: runtimeCopyText("student26.45c174567d3d6864"), className: 'pixel-demo-pressed' ,__copyIds:{"name":"student26.45c174567d3d6864"}}, { name: runtimeCopyText("student26.a5905c895b24b497"), className: 'pixel-demo-focus' ,__copyIds:{"name":"student26.a5905c895b24b497"}},
        { name: runtimeCopyText("student26.feb242bc8c81ee97"), disabled: true ,__copyIds:{"name":"student26.feb242bc8c81ee97"}}, { name: runtimeCopyText("student26.83293fb81b703334"), loading: true ,__copyIds:{"name":"student26.83293fb81b703334"}},
      ].map(({ name, ...props }) => <div className="pixel-preview-state" key={name}><span>{name}</span><PixelButton type="primary" {...props} icon={props.loading ? undefined : <PixelIcon name="continue" />}>{props.loading ? <StudentCopyText id="student26.d1069333bf466cc3"/> : <StudentCopyText id="student26.797d710876675f46"/>}</PixelButton></div>)}
    </div></PixelPanel>
    <h2><StudentCopyText id="student26.34358b6e9d6739ba"/></h2>
    <PixelPanel><h3><StudentCopyText id="student26.b633dc63e8d2a489"/></h3><Sentence><StudentCopyText id="student26.684df90972b712d0"/></Sentence>
      <div className="pixel-preview-row" style={{ margin: '16px 0' }}><PixelTag><StudentCopyText id="student26.38d742d4af3a9669"/></PixelTag><PixelTag tone="current"><StudentCopyText id="student26.9f5ce679e2673395"/></PixelTag><PixelTag tone="success"><StudentCopyText id="student26.9b1d78304560e413"/></PixelTag><PixelTag tone="warning"><StudentCopyText id="student26.5433c86491de00ea"/></PixelTag><PixelTag tone="danger"><StudentCopyText id="student26.012d4f9c764bcd60"/></PixelTag></div>
      <PixelProgress label={runtimeCopyText("student26.ba1d5c85a344003b")} value={60}  data-copy-bindings={JSON.stringify(["student26.ba1d5c85a344003b"])}/>
    </PixelPanel>
    <h2><StudentCopyText id="student26.e5c3d0302670ac25"/></h2>
    <PixelPanel><Sentence><StudentCopyText id="student26.48b107d3ca200c87"/></Sentence><div className="pixel-preview-route">
      {[1, 2, 3].map((number) => <button type="button" key={number} className="pixel-preview-node" aria-label={`预览节点 ${number}`} aria-current={number === selected ? 'step' : undefined} onClick={() => setSelected(number)}>{number}</button>)}
    </div><PixelTag tone="current"><StudentCopyText id="student26.19a97e7d4755eec0"/>{selected}</PixelTag></PixelPanel>
    <h2><StudentCopyText id="student26.7a3165caf492fac0"/></h2>
    <PixelPanel><div className="pixel-preview-row">{icons.map((name) => <div className="pixel-preview-icon" key={name}><PixelIcon name={name} size={48} /><span>{name}</span></div>)}</div></PixelPanel>
    <h2><StudentCopyText id="student26.a65fb2651062bf63"/></h2>
    <div className="pixel-preview-assets">{assets.map((asset) => <PixelPanel as="figure" className="pixel-preview-asset" key={asset.file}>
      <PixelImage {...pixelImageProps(asset.file.replace('.png', ''), '(max-width: 600px) calc(100vw - 80px), 320px')} alt={asset.title} width={4} height={3} loading="lazy" />
      <figcaption><strong><ConfigCopyText object={asset} field="title" value={asset.title}/></strong><div><a href={`/assets/pixel-v1/${asset.file}`} target="_blank" rel="noreferrer">{asset.file}<StudentCopyText id="student26.be7e8f9628c90211"/></a></div><Sentence>{asset.note}</Sentence></figcaption>
    </PixelPanel>)}</div>
  </div>;
}
