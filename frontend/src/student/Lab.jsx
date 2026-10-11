import Alert from '../student/visual/StudentAlert';
import {copyText} from '../content/copy';
import CopyBlock from '../content/CopyBlock';
import { useLocation } from 'react-router-dom';
import Link from './space/SpaceLink';

import PageContainer from '../components/common/PageContainer';
import { experiments } from './config';
import { PixelImage, PixelPanel, PixelTag } from './visual/PixelUI';
import { StudyHeader } from './visual/StudyUI';
import PixelIcon from './visual/PixelIcon';
import './visual/pixel-lab.css';
import {patchAsset} from './space/visualAssets';
import Sentence from '../content/Sentence';

const steps = [[copyText('system.lab.001'), copyText('system.lab.002')], [copyText('system.lab.003'), copyText('system.lab.004')], [copyText('system.lab.005'), copyText('system.lab.006')], [copyText('system.lab.007'), copyText('system.lab.008')]];
export default function Lab() {
  const location = useLocation();
  return <PageContainer><div className="study-workspace lab-workspace">
    <StudyHeader eyebrow={<><PixelIcon name="lab" size={20} />OBSERVATORY / LAB</>} title={copyText('system.lab.009')} description={copyText('system.lab.010')} />
    {location.state?.experimentNotice && <Alert type="warning" showIcon title={location.state.experimentNotice} />}
    <ol className="lab-cycle">{steps.map(([title, description], index) => <li key={title}><span className="lab-cycle-number">0{index + 1}</span><div><strong>{title}</strong><Sentence>{description}</Sentence></div>{index < 3 && <PixelIcon name="continue" size={20} />}</li>)}</ol>
    <div className="lab-catalog-heading"><h3>{copyText('system.lab.011')}</h3><span>{experiments.length}{copyText('system.lab.012')}</span></div>
    <div className="lab-catalog">{experiments.map((experiment) => <PixelPanel className="lab-experiment" key={experiment.id}>
      <PixelImage className="lab-experiment-cover" src={patchAsset(experiment.cover.name)} srcSet={`${patchAsset(experiment.cover.name,480)} 480w, ${patchAsset(experiment.cover.name,960)} 960w`} sizes="(max-width:767px) 100vw, 260px" alt={experiment.cover.alt} width={experiment.cover.width} height={experiment.cover.height} imageStyle={{objectPosition:experiment.cover.position}} fallback={<PixelIcon name="lab" size={64}/>}/>
      <div className="lab-experiment-content"><PixelTag>{copyText('system.lab.013')}</PixelTag><h2>{experiment.title}</h2><Sentence>{experiment.description}</Sentence>
        {experiment.id === 'glider' && <dl><div><dt>{copyText('system.lab.014')}</dt><dd>{copyText('system.lab.015')}</dd></div><div><dt>{copyText('system.lab.016')}</dt><dd>{copyText('system.lab.017')}</dd></div></dl>}
        <Link to={experiment.path} className="pixel-link-button lab-start-link"><PixelIcon name="continue" />{copyText('system.lab.018')}</Link>
      </div>
    </PixelPanel>)}</div>
    <aside className="lab-footnote"><PixelIcon name="book" size={24} /><div><strong>{copyText('system.lab.019')}</strong><CopyBlock id="system.lab.020" as="p" /></div></aside>
  </div></PageContainer>;
}
