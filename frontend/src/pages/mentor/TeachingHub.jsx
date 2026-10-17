import {mentorText} from './workspaceCopy';
import {Card} from 'antd';
import {Link} from 'react-router-dom';
export default function TeachingHub(){return <section><h1>{mentorText("mentor.TeachingHub.3d6a1679784d")}</h1><p>{mentorText("mentor.TeachingHub.45e35142bf10")}</p><div className="maintenance-list">{[[mentorText("mentor.TeachingHub.317a494a871f"),'/students'],[mentorText("mentor.TeachingHub.32191cba41b8"),'/mentor/reviews'],[mentorText("mentor.TeachingHub.d82ad30044ce"),'/works'],[mentorText("mentor.TeachingHub.9270a2a4871f"),'/archives'],[mentorText("mentor.TeachingHub.1642ce955e4c"),'/tasks']].map(([name,url])=><Card key={url} title={name}><Link to={url}>{mentorText("mentor.TeachingHub.f88182fcd575")}{name}</Link></Card>)}</div></section>;}
