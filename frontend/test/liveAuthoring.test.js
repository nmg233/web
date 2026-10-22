import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {createServer} from 'vite';
import {lessonReplayFields} from '../src/utils/replayUpload.js';
test('实际课时工作区：正式版和草稿均可选文件，归档/取消仍只读，关闭编辑入口已移除',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'}),previous=globalThis.location;
 try{
  globalThis.location={search:'?lesson=1'};
  const {AuthProvider}=await server.ssrLoadModule('/src/store/AuthContext.jsx');
  const Teaching=(await server.ssrLoadModule('/src/pages/courses/TeachingPreview.jsx')).default;
  const policy={formats:[],replayExtensions:['.mp4','.webm'],coverExtensions:['.png'],replayLimitBytes:1500000000,resourceLimitMB:50,coverLimitMB:5};
  for(const publication_state of['draft','legacy','published'])for(const restricted of['none','cancelled','archived']){
   const lesson={id:1,course_id:1,title:'隔离课时',publication_state,status:restricted==='cancelled'?'cancelled':'scheduled',presentation_type:'visit',content_state:'ready',article_blocks:[]};
   const data={course:{id:1,title:'隔离课题',status:restricted==='archived'?'archived':'published'},lessons:[lesson],chapters:[],tasks:[],resources:[],replays:[],experiments:[]};
   const html=renderToStaticMarkup(h(MemoryRouter,{initialEntries:['/?lesson=1']},h(AuthProvider,null,h(Teaching,{data,courseId:1,policy,disabled:restricted==='archived',dirty:()=>{},onBusyChange:()=>{},refresh:async()=>{}}))));
   const region=html.slice(html.indexOf('id="lesson-videos"'),html.indexOf('id="lesson-effect"'));
   const button=region.match(/<button\b([^>]*)>([\s\S]*?)<\/button>/);
   assert.ok(button);assert.equal(/\sdisabled(?:=|\s|$)/.test(button[1]),restricted!=='none',publication_state+':'+restricted);
   assert.ok(!html.includes('关闭并编辑本课时'));
   assert.ok(html.includes('无需关闭课时'));
   if(restricted==='none')assert.equal(lessonReplayFields(1,[lesson],lesson,{title:'视频'}).lesson_id,'1');
  }
 }finally{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;await server.close();}
});
