export const mentorModules=[
 {key:'/dashboard',label:'工作台',iconKey:'dashboard'},
 {key:'/courses',label:'课程管理',iconKey:'book'},
 {key:'/mentor/teaching',label:'教学与成长',iconKey:'learning'},
 {key:'/mentor/organization',label:'学校与账号',iconKey:'team'},
 {key:'/mentor/guide',label:'使用指引',iconKey:'guide'},
];
export function mentorModuleFor(path){
 if(/^\/(courses|student-copy|mentor\/content)(\/|$)/.test(path))return '/courses';
 if(/^\/mentor\/organization(\/|$)/.test(path))return '/mentor/organization';
 if(/^\/(students|works|tasks|archives|mentor\/(reviews|teaching|feedback))(\/|$)/.test(path))return '/mentor/teaching';
 if(/^\/mentor\/guide(\/|$)/.test(path)||/^\/(feedback|glider|dashboard\/ai)(\/|$)/.test(path))return '/mentor/guide';
 return path==='/dashboard'?'/dashboard':null;
}
