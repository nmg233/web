import client from '../../api/client';
const base=id=>`/courses/${id}/maintenance`;
export const maintenanceAPI={
 read:id=>client.get(base(id),{silent:true}),formats:()=>client.get('/courses/upload-formats',{silent:true}),
 download:(id,resourceId)=>client.get(base(id)+'/resources/'+resourceId+'/download',{responseType:'blob',silent:true}),
 save:(id,path,data)=>client.put(base(id)+path,data,{silent:true}),create:(id,path,data)=>client.post(base(id)+path,data,{silent:true}),remove:(id,path)=>client.delete(base(id)+path,{silent:true}),
 upload:(id,kind,form,signal)=>client.post(`/courses/${id}/${kind==='resource'?'resources':kind==='replay'?'replays':'cover'}`,form,{signal,silent:true,headers:{'Content-Type':undefined},timeout:kind==='replay'?120000:30000}),
};
