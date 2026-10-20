import {useEffect,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {Layout} from 'antd';
import {courseAPI} from '../api';
import {useAuth} from '../store/AuthContext';
import {staffThemeCourseId} from '../utils/staffCourseTheme';
import StudentTheme from '../student/visual/StudentTheme';
import Sidebar from './Sidebar';
import HeaderBar from './Header';
import ReviewInspector from '../copy-review/ReviewInspector';
import './staff.css';
import './staff-campus.css';
export default function StaffShell({children}){
 const{pathname}=useLocation(),{user}=useAuth(),id=staffThemeCourseId(pathname,user?.role);
 const[look,setLook]=useState(null);
 const campusStaff=['admin','academic_mentor'].includes(user?.role);
 useEffect(()=>{document.body.dataset.staffUi='true';return()=>{delete document.body.dataset.staffUi;};},[]);
 useEffect(()=>{if(campusStaff)document.body.dataset.staffCampus='true';return()=>{if(campusStaff)delete document.body.dataset.staffCampus;};},[campusStaff]);
 useEffect(()=>{let live=true;if(id)courseAPI.detail(id).then(r=>{if(live)setLook({id,theme:r.course?.presentation_theme});}).catch(()=>{if(live)setLook(null);});return()=>{live=false;};},[id]);
 const theme=!campusStaff&&look?.id===id&&look?.theme==='voyage'?'voyage':'campus';
 return <StudentTheme variant={theme}><Layout className={`space-staff-shell${campusStaff?' staff-campus-ui':''}`} data-testid="staff-shell"><Sidebar/><Layout className="staff-main"><HeaderBar/><ReviewInspector/><Layout.Content className="staff-content" id="staff-content">{children}</Layout.Content></Layout></Layout></StudentTheme>;
}
