// URL 是课程上下文的唯一来源；不保存“上次选中课程”作为授权依据。
export function courseIdFromPath(path) { return path.match(/^\/courses\/(\d+)(?:\/|$)/)?.[1] || null; }
export function coursePath(id,path='') {
 if(!id)return path||'/explore';
 if(path.startsWith('/courses/'))return path;
 const map={'/archives/reflection':'/reflection','/dashboard/ai':'/assistant','/archives':'/archives','/lab':'/lab','/glider':'/glider'};
 const base=path.split(/[?#]/)[0],suffix=path.slice(base.length);
 if(base==='/archives/rewards'||base==='/me')return '/me';
 if(!base)return '/courses/'+id;
 if(!(base in map) && !/^\/(works|tasks)(?:\/|$)/.test(base))return path;
 return '/courses/'+id+(map[base]??base)+suffix;
}
