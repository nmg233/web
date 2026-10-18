export const adminModules=[
 {key:'/dashboard',label:'工作台',iconKey:'dashboard'},
 {key:'/courses',label:'课程管理',iconKey:'book'},
 {key:'/admin/teaching',label:'教学与成长',iconKey:'learning'},
 {key:'/admin/organization',label:'账号与组织',iconKey:'team'},
 {key:'/admin/settings',label:'平台设置',iconKey:'settings'},
];
export function adminModuleFor(path){
 if(/^\/(students|dashboard\/schools|admin\/organization)(\/|$)/.test(path))return '/admin/organization';
 if(/^\/(works|tasks|archives|observer|mentor\/reviews|admin\/teaching)(\/|$)/.test(path))return '/admin/teaching';
 if(/^\/(courses|mentor\/content|reward-management)(\/|$)/.test(path))return '/courses';
 if(/^\/(student-copy|copy-review|feedback|glider|dashboard\/ai|admin\/settings)(\/|$)/.test(path))return '/admin/settings';
 return path.startsWith('/notifications')||path==='/change-password'?null:'/dashboard';
}
