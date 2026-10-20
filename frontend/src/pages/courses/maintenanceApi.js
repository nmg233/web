import client from '../../api/client';
import uploadPolicy from '../../../../shared/uploadPolicy.json' with {type:'json'};
const base=id=>`/courses/${id}/maintenance`;
export const maintenanceAPI={
 readDiagnostic:(id,lesson)=>client.get(base(id)+'/lessons/'+lesson+'/diagnostics',{silent:true}),
 read:id=>client.get(base(id),{silent:true}),formats:()=>client.get('/courses/upload-formats',{silent:true}),
 download:(id,resourceId)=>client.get(base(id)+'/resources/'+resourceId+'/download',{responseType:'blob',silent:true}),
 save:(id,path,data)=>client.put(base(id)+path,data,{silent:true}),create:(id,path,data)=>client.post(base(id)+path,data,{silent:true}),remove:(id,path)=>client.delete(base(id)+path,{silent:true}),
  upload:(id,kind,form,signal,onUploadProgress)=>client.post(`/courses/${id}/${kind==='resource'?'resources':kind==='replay'?`lessons/${encodeURIComponent(form.get('lesson_id'))}/replays`:'cover'}`,form,{signal,onUploadProgress,silent:true,headers:{'Content-Type':undefined},timeout:kind==='replay'?uploadPolicy.replayTimeoutMs:30000}),
 replayResult:(id,key)=>client.get(`/courses/${id}/replay-requests/${key}`,{silent:true}),
};
