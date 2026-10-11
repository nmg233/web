import Alert from '../../student/visual/StudentAlert';
import Sentence from '../../content/Sentence';
import {copyText} from '../../content/copy';
import CopyBlock from '../../content/CopyBlock';
import { Modal, Spin } from 'antd';
import { useCourseExperience } from './useCourseExperience';
import { avatars } from './avatars';
import { asset } from './identity';
import {useCoursePresentation} from './CoursePresentation';
import { PixelButton, PixelImage } from '../visual/PixelUI';
import PixelIcon from '../visual/PixelIcon';

export default function AvatarPreference(){
  const s=useCourseExperience(),look=useCoursePresentation();if(!s||look.theme!=='voyage')return null;
  const selected=avatars.find(a=>a.id===s.avatar.id),busy=['loading','saving','reading'].includes(s.avatar.state);
  return <>
    <button className="course-avatar-button" aria-label={copyText('avatar.open')} onClick={()=>s.openOverlay('avatar')}>
      {selected?<PixelImage src={asset('avatar-'+selected.id,96)} alt={selected.role+' '+selected.name} width={40} height={40}/>:<PixelIcon name="user" size={28}/>}
      <span className="course-avatar-label">{selected?selected.name:copyText('avatar.open')}</span>
    </button>
    <Modal open={s.overlay==='avatar'} onCancel={()=>s.openOverlay(null)} footer={null} title={copyText('avatar.open')} width={680} zIndex={1250} rootClassName="student-pixel student-interactions course-avatar-modal" destroyOnHidden={false}>
      <CopyBlock id="avatar.hint" as="p"/>
      {busy&&<Sentence role="status"><Spin size="small"/> {s.avatar.state==='loading'?copyText('system.avatar.001'):s.avatar.state==='saving'?copyText('system.avatar.002'):copyText('system.avatar.003')}</Sentence>}
      {s.avatar.notice&&<Alert role="status" type={s.avatar.state==='ready'?'success':'warning'} title={s.avatar.notice}/>}
      {['error','uncertain'].includes(s.avatar.state)&&<PixelButton onClick={s.readAvatar}>{copyText('avatar.reload')}</PixelButton>}
      <div className="course-avatar-grid">{avatars.map(a=><button key={a.id} type="button" aria-pressed={s.avatar.id===a.id} disabled={busy} onClick={()=>s.saveAvatar(a.id)}>
        <PixelImage src={asset('avatar-'+a.id,192)} alt="" width={96} height={96}/><strong>{a.role}</strong><span>{a.name}</span>{s.avatar.id===a.id&&<CopyBlock id="system.avatar.004" as="small" />}
      </button>)}</div>
    </Modal>
  </>;
}
