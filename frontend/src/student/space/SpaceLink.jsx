import {Link} from 'react-router-dom';
import {useCourseId} from '../useCourseApis';
import {coursePath} from '../spaceRoutes';
export default function SpaceLink({to,...props}){const id=useCourseId();return <Link to={typeof to==='string'?coursePath(id,to):to} {...props}/>;}
