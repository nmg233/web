import {isCopyPreview} from '../copy-review/previewMode.js';
import {Alert} from 'antd';
import {useAuth} from '../store/AuthContext';
import StudentAlert from '../student/visual/StudentAlert';
export default function RoleAlert(props){const {user}=useAuth();const Component=(user?.role==='student'||isCopyPreview())?StudentAlert:Alert;return <Component {...props}/>;}
