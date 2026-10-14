import {useEffect,useState} from 'react';
import {copyText} from '../../content/copy';
import Sentence from '../../content/Sentence';
import {Link} from 'react-router-dom';
import {Button} from 'antd';
import {ServiceModal} from '../../components/ServiceUI';
import {useAuth} from '../../store/AuthContext';
import {studentGuideAPI} from '../../api';
import StudentGuideDocument from './StudentGuideDocument';
import {studentGuideDocument} from './guideContent';
import './student-guide.css';

// 每次页面会话只读取一次关闭状态，并按学生账号分别记住结果；
// 同一台电脑上换账号登录时，新账号仍然会看到自己的弹窗。
const promptState = new Map();

export default function StudentGuideModal() {
  const {user} = useAuth();
  const studentId = user?.role === 'student' && !user.force_reset_password ? user.id : null;
  // 同一会话内重新挂载时沿用已缓存的结论，不再重复请求接口。
  const [visible,setVisible]=useState(()=>studentId != null && promptState.get(studentId) === 'show');
  const [saving,setSaving]=useState(false);
  useEffect(()=>{
    if(studentId == null || promptState.has(studentId)) return undefined;
    let live = true;
    // 读取失败时不打扰学生，也不写缓存：下次登录再尝试。
    studentGuideAPI.status().then(data=>{
      if(!live) return;
      const next = data?.dismissed ? 'done' : 'show';
      promptState.set(studentId,next);
      if(next === 'show') setVisible(true);
    }).catch(()=>{});
    return ()=>{live=false;};
  },[studentId]);
  if(studentId == null) return null;
  // 本次先关闭（点「稍后再看」、遮罩或右上角），下次登录仍会提示。
  const closeForNow = () => { promptState.set(studentId,'done'); setVisible(false); };
  const dismissForever = async () => {
    setSaving(true);
    // 保存失败也先关闭：关闭状态未落库时，下次登录会再次提示，不会丢失指南。
    try { await studentGuideAPI.dismiss(); } catch { /* 见上 */ }
    promptState.set(studentId,'done');
    setSaving(false); setVisible(false);
  };
  return <ServiceModal className="guide-modal" title={copyText('guide.modalTitle')} open={visible}
    onCancel={closeForNow} width={780} footer={<div className="guide-modal-footer">
      <span className="guide-modal-note">{copyText('guide.modalNote')}</span>
      <Button onClick={closeForNow}>{copyText('guide.later')}</Button>
      <Button type="primary" loading={saving} onClick={dismissForever}>{copyText('guide.dismiss')}</Button>
    </div>}>
    <Sentence className="guide-modal-lead">{copyText('guide.modalLead')}</Sentence>
    <Sentence as="p" className="guide-modal-link"><Link to="/guide" onClick={closeForNow}>{copyText('guide.openFull')}</Link></Sentence>
    <StudentGuideDocument document={studentGuideDocument} />
  </ServiceModal>;
}
