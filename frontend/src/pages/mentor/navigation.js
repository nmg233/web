import registry from '../../../../shared/staffWorkspace.json' with {type:'json'};
export const mentorModules=registry.modules.academic_mentor;
export function mentorModuleFor(path){
 if(/^\/(courses|student-copy|mentor\/content)(\/|$)/.test(path))return '/courses';
 if(/^\/mentor\/(organization|requests)(\/|$)/.test(path))return '/mentor/organization';
 if(/^\/(students|works|tasks|archives|feedback|mentor\/(reviews|teaching|feedback))(\/|$)/.test(path))return '/mentor/teaching';
 if(/^\/mentor\/guide(\/|$)/.test(path)||/^\/(glider|dashboard\/ai)(\/|$)/.test(path))return '/mentor/guide';
 return path==='/dashboard'?'/dashboard':null;
}
