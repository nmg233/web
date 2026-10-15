import {isCopyPreview} from '../copy-review/previewMode.js';
import {useAuth} from '../store/AuthContext';
import Sentence from './Sentence';
export default function RoleSentence({as:Element='p',children,...props}){
 const {user}=useAuth();
 return (user?.role==='student'||isCopyPreview())?<Sentence as={Element} {...props}>{children}</Sentence>:<Element {...props}>{children}</Element>;
}
