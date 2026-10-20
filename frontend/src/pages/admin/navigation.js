import registry from '../../../../shared/staffWorkspace.json' with {type:'json'};
export const adminModules=registry.modules.admin;
export function adminModuleFor(path){
 if(/^\/(students|dashboard\/schools|admin\/organization|mentor\/(organization|requests))(\/|$)/.test(path))return '/admin/organization';
 if(/^\/(works|tasks|archives|observer|mentor\/(reviews|feedback|teaching)|admin\/teaching)(\/|$)/.test(path))return '/admin/teaching';
 if(/^\/(courses|mentor\/content|reward-management)(\/|$)/.test(path))return '/courses';
 if(/^\/(student-copy|copy-review|feedback|glider|dashboard\/ai|admin\/settings)(\/|$)/.test(path))return '/admin/settings';
 return path.startsWith('/notifications')||path==='/change-password'?null:'/dashboard';
}
