import Sentence from '../content/Sentence';
import {copyText} from '../content/copy';
import CopyBlock from '../content/CopyBlock';
import {useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {Empty,Input} from 'antd';
import {courseAPI} from '../api';
import AsyncPageState from '../student/visual/StudentPageState';
import useRemote from './useRemote';
import {filterCourses} from './homeModel';
import {coursePresentation} from './space/identity';
import CourseCover from './space/CourseCover';
import SceneArt from './space/SceneArt';
import PixelIcon from './visual/PixelIcon';
const readCourses=()=>courseAPI.list();
export default function ExploreHome(){
 const {data,loading,error,retry}=useRemote(readCourses,{courseSensitive:true});const [query,setQuery]=useState('');const location=useLocation();
 const courses=filterCourses(data?.courses||[],query);
 return <div className="space-selector">
  <header className="space-selector-heading"><div><span className="space-eyebrow">{copyText('system.platform.001')}</span><h1>{copyText('system.platform.002')}</h1><CopyBlock id="system.platform.003" as="p" /></div><Input.Search aria-label={copyText('system.platform.004')} placeholder={copyText('system.platform.005')} value={query} onChange={e=>setQuery(e.target.value)} allowClear/></header>
  {location.state?.notice&&<Sentence role="status" className="space-notice">{location.state.notice}</Sentence>}
  <AsyncPageState loading={loading} error={error} onRetry={retry}>
   {!courses.length?<div className="space-empty"><SceneArt name="campus" priority/><div><Empty description={data?.courses?.length?copyText('system.platform.006'):copyText('system.platform.007')}/></div></div>:<section className="space-course-selection" aria-label={copyText('system.platform.008')}>{courses.map((course,i)=>{const look=coursePresentation(course);return <Link key={course.id} to={'/courses/'+course.id} className="space-course-card" data-testid="home-course-card" aria-label={copyText('system.platform.009')+course.title}>
    <SceneArt name={look.theme==='voyage'?'cosmos':'campus'} priority={!i}/><CourseCover course={course} className="space-real-cover" loading={i?'lazy':'eager'} onError={e=>{e.currentTarget.hidden=true;}}/>
    <div className="space-course-card-top"><span>{copyText('system.platform.010')}</span>{look.sample&&<span>{copyText('system.platform.011')}</span>}</div>
    <div className="space-course-card-copy"><div><h2>{course.title}</h2>{course.description&&<Sentence>{course.description}</Sentence>}</div><span className="space-course-enter">{copyText('system.platform.013')}<PixelIcon name="continue"/></span></div>
   </Link>;})}</section>}
  </AsyncPageState>
 </div>;
}
