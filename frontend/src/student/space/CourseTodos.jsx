import ConfigCopyText from '../../content/ConfigText';
import StudentCopyText from '../../content/ManagedText';
import {copyText as siteText} from "../../content/copy";
import Sentence from '../../content/Sentence';
import {useCallback} from 'react';
import {Collapse,Empty,Space} from 'antd';
import {useCourseApis,useCourseNavigate} from '../useCourseApis';
import useRemote from '../useRemote';
import {buildHomeTodos} from '../homeModel';
import {PixelButton,PixelTag} from '../visual/PixelUI';
import PixelIcon from '../visual/PixelIcon';
const reportLabels={get approved(){return siteText("site.43fb5a4b98631ff5")},get submitted(){return siteText("site.82fde970c51986e1")},get rejected(){return siteText("site.5457582074840ee2")}};
const workLabels={get approved(){return siteText("site.78a07635536b651a")},get pending(){return siteText("site.8c66119e692e4fad")},get rejected(){return siteText("site.f012d0ffe99c28b4")}};
function Todo({ item, primary = false }) {
  const navigate = useCourseNavigate();
  return <div className={`home-todo ${primary ? 'home-todo--primary' : ''}`} data-testid={primary ? 'home-primary-todo' : undefined}>
    <div className="home-todo-copy">
      <h3><ConfigCopyText object={item} field="title" value={item.title}/></h3>
      <Sentence className="home-todo-source">{item.courseTitle} · {item.lessonTitle}</Sentence>
      <Space wrap size={[8, 8]}><PixelTag>{<StudentCopyText id={"site.084b34e6d31a7b34"}/>}{item.learningProgress}%</PixelTag>
        {reportLabels[item.reportStatus] && <PixelTag tone={item.reportStatus === 'rejected' ? 'warning' : 'neutral'}>{reportLabels[item.reportStatus]}</PixelTag>}
        {workLabels[item.workStatus] && <PixelTag tone={item.workStatus === 'rejected' ? 'warning' : 'neutral'}>{workLabels[item.workStatus]}</PixelTag>}
      </Space>
      <Sentence className="home-todo-description"><ConfigCopyText sentence object={item} field="description" value={item.description}/></Sentence>
      {item.taskId && <Sentence className="home-todo-deadline">{<StudentCopyText id={"site.68f1c6b06d8515e3"}/>}{item.deadline || <StudentCopyText id={"site.59afcee7703eb91a"}/>}</Sentence>}
    </div>
    <div className="home-todo-action"><PixelButton type={primary ? 'primary' : 'default'} onClick={() => navigate(item.href)} icon={<PixelIcon name="continue" />}>{item.action}</PixelButton></div>
  </div>;
}


export default function CourseTodos({detail}){
 const {taskAPI}=useCourseApis();const fetcher=useCallback(()=>taskAPI.list(),[taskAPI]);const {data,error,retry}=useRemote(fetcher,{courseSensitive:true,courseId:detail.course.id});
 const todos=buildHomeTodos({courses:[detail.course],courseDetails:[detail],tasks:data?.tasks||[]});
 return <Collapse className="space-course-todos" items={[{key:'todo',label:siteText("site.a26aa0f8953496de")+(todos[0]?.action||siteText("site.fc4a0c1e956ee890"))+(todos.length?'（'+todos.length+'）':''),children:<>{error&&<Sentence role="alert">{<StudentCopyText id={"site.4b2783e8130a3e3b"}/>}<button onClick={retry}>{<StudentCopyText id={"site.4180126218a2ad4f"}/>}</button></Sentence>}{todos.length?todos.map((item,i)=><Todo key={item.id} item={item} primary={!i}/>):<Empty description={siteText("site.c8ecc6944df86c64")} data-copy-bindings={JSON.stringify(["site.c8ecc6944df86c64"])}/>}</>}]}  data-copy-bindings={JSON.stringify(["site.a26aa0f8953496de","site.fc4a0c1e956ee890"])}/>;
}
