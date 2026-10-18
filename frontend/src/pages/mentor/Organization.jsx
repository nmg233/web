import {mentorText} from './workspaceCopy';
import ApplicationInbox from './ApplicationInbox';
import {Tabs} from 'antd';
import {useSearchParams} from 'react-router-dom';
import SchoolApplications from '../organization/SchoolApplications';
import SchoolAccounts from './SchoolAccounts';
export default function Organization(){const[params,setParams]=useSearchParams();return <section><h1>{mentorText("mentor.Organization.d24a0079db42")}</h1><Tabs activeKey={params.get('section')||'applications'} onChange={section=>{const next=new URLSearchParams(params);next.set('section',section);setParams(next);}} items={[{key:'requests',label:mentorText("mentor.Organization.428b91afbbd6"),children:<ApplicationInbox/>},{key:'applications',label:mentorText("mentor.Organization.41eb023d7dbc"),children:<SchoolApplications applicationsOnly/>},{key:'accounts',label:mentorText("mentor.Organization.8bd124abe640"),children:<SchoolAccounts/>}]}/></section>;}
