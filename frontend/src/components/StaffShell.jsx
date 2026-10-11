import {useEffect,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {Layout} from 'antd';
import {courseAPI} from '../api';
import StudentTheme from '../student/visual/StudentTheme';
import Sidebar from './Sidebar';
import HeaderBar from './Header';
import ReviewInspector from '../copy-review/ReviewInspector';
import './staff.css';
export default function StaffShell({children}){
 const{pathname}=useLocation(),id=pathname.match(/^\/courses\/(\d+)(?:\/|$)/)?.[1];
 const[look,setLook]=useState(null);
 useEffect(()=>{document.body.dataset.staffUi='true';return()=>{delete document.body.dataset.staffUi;};},[]);
 useEffect(()=>{let live=true;if(id)courseAPI.detail(id).then(r=>{if(live)setLook({id,theme:r.course?.presentation_theme});}).catch(()=>{if(live)setLook(null);});return()=>{live=false;};},[id]);
 const theme=look?.id===id&&look?.theme==='voyage'?'voyage':'campus';
 return <StudentTheme variant={theme}><Layout className="space-staff-shell" data-testid="staff-shell"><Sidebar/><Layout className="staff-main"><HeaderBar/><ReviewInspector/><Layout.Content className="staff-content" id="staff-content">{children}</Layout.Content></Layout></Layout></StudentTheme>;
}
