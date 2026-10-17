import {Button,Card,Space,Tabs} from 'antd';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import SchoolApplications from '../organization/SchoolApplications';
import StudentList from '../students/List';
import Dashboard from '../dashboard/Index';
const links={
 teaching:[['报告评审与逐题反馈','/mentor/reviews','打开报告列表后可直接评审对应报告，保留学生、课时和筛选上下文'],['作品评审与版本','/works','查看作品附件、历次版本和退回修改'],['成长档案与反思','/archives','查看有权限的学生成长与反思记录'],['学生观察与评价','/observer/students','直接选择学生，查看学习结果与观察评价']],
 settings:[['平台公共文字与受控学生预览','/student-copy','点选文字或文章使用原对象编辑器；保存与教材发布分开'],['反馈处理','/feedback/manage','查看反馈附件、回复并更新处理状态'],['AI 配置','/dashboard/ai/settings','本步不修改 AI 启用状态'],['AI 测试','/dashboard/ai','沿用已有能力和课程范围'],['管理员实验工具','/glider','受控实验入口；工作人员没有个人兑换资格'],['高级文案历史工具','/copy-review','保留历史导出 JSON、兼容审阅与恢复能力']],
};
export default function ModuleHub(){
 const {module}=useParams(),[search,setSearch]=useSearchParams();
 if(module==='organization')return <section><h1>账号与组织</h1><Tabs activeKey={search.get('section')||'accounts'} onChange={section=>setSearch({section})} items={[{key:'accounts',label:'账号管理',children:<StudentList/>},{key:'schools',label:'学校与班级',children:<Dashboard organization/>},{key:'applications',label:'学校申请审核',children:<SchoolApplications/>}]}/></section>;
 const title=module==='teaching'?'教学与成长':'平台设置';
 return <section><h1>{title}</h1><div className="maintenance-list">{(links[module]||[]).map(([name,url,note])=><Card key={url} title={name}><p>{note}</p><Link className="ant-btn ant-btn-default" to={url}>进入{name}</Link></Card>)}</div>{module==='teaching'&&<Space><Button href="/mentor/reviews">查看待评报告</Button><Link to="/courses">进入课程管理维护教材</Link></Space>}</section>;
}
