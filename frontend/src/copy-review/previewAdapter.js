import {isCopyPreview} from './previewMode.js';
// Explicitly separate preview DTOs from student runtime APIs. Never forward unknown reads or writes.
let context=null;
export function setPreviewContext(value){context=value;}
export function previewRequest(config){
 if(!isCopyPreview())return;
 const raw=new URL(config.url,'https://local.invalid').pathname,method=(config.method||'get').toLowerCase();
 if(method==='post'&&['/rewards/badges/reconcile','/rewards/coins/reconcile'].includes(raw)){config.adapter=async()=>({data:{preview:true,pending:[]},status:200,statusText:'OK',headers:{},config});return;}
 if(method!=='get')throw Object.assign(new Error('管理员预览禁止业务写入'),{code:'PREVIEW_READ_ONLY',config});
 if(raw==='/auth/me'||raw.startsWith('/student-copy/')||/^\/courses\/(?:resources\/\d+\/download|\d+\/(?:map-images\/|maintenance\/resources\/))/.test(raw))return;
 const c=context||{},p=raw.replace(/^\/course-spaces\/\d+/,'').replace(/^\/rewards(?=\/coins)/,''),empty={preview:true};let data;
 if(p==='/courses')data={courses:c.courses||[],pagination:{total:c.courses?.length||0}};
 else if(/^\/courses\/\d+$/.test(p))data={...c,course:c.course,lessons:c.lessons||[],enrollments:[],teachers:[],progress:0};
 else if(/^\/learning\/lessons\/\d+$/.test(p))data=c.package;
 else if(/\/preferences\/avatar$/.test(raw))data={avatarId:null};
 else if(p==='/dashboard/ai/courses'||p==='/ai/courses')data={enabled:false,courses:c.courses||[]};
 else if(p==='/student-guide')data={dismissed:true,version:'preview'};
 else if(p==='/account/daily-fortune')data={date:c.serverDate,level:'medium',art:'fortune-star',good:[],avoid:[],preview:true};
 else if(p==='/coins')data={balance:0,totalEarned:0,totalSpent:0,totalCheckins:0,history:[],today:{date:c.serverDate,checked:false,streak:0,todayStreak:1,amount:0,validForMs:3600000},preview:true};
 else if(p.startsWith('/coins/'))data={items:[],entries:[],records:[],today:{date:c.serverDate},nextBefore:null,pagination:{total:0},preview:true};
 else if(p==='/reward-shop/gifts')data={gifts:[]};else if(p==='/reward-shop/orders')data={items:[],orders:[],total:0,page:1,pagination:{total:0}};
 else if(p.startsWith('/rewards'))data={badges:[],definitions:[],grants:[],exchanges:[],gifts:[],claims:[],earned:[],preview:true};
 else if(p==='/tasks')data={tasks:c.tasks||[],pagination:{total:c.tasks?.length||0}};
 else if(p==='/works')data={works:[],pagination:{total:0}};
 else if(p==='/notifications'||p==='/notifications/unread-count'||p==='/notifications/recent')data={success:true,data:{items:[],count:0,pagination:{total:0,page:1,page_size:20},total:0},preview:true};
 else if(p==='/feedback')data={feedbacks:[],pagination:{total:0}};
 else if(p.startsWith('/archives'))data={courses:c.courses||[],reports:[],reflections:[],works:[],simulations:[],records:[],stats:{},preview:true};
 else if(p.startsWith('/glider'))data={simulations:[],results:[],items:[],preview:true};
 else {const error='此预览状态没有个人记录；真实学生数据不会在管理员预览中读取';config.adapter=async()=>{throw Object.assign(new Error(error),{config,response:{config,status:404,data:{error}}});};return;}
 config.adapter=async()=>({data:data||empty,status:200,statusText:'OK',headers:{},config});
}
