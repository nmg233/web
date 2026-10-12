export const PLATFORM_NAME = 'PBL 科创平台';
export const PLATFORM_FONT = "'ChillReunion', 'Microsoft YaHei', sans-serif";
// 主题来自已授权课程的真实元数据，与 courses.theme（教学主题）分开。
export function coursePresentation(course){return {theme:course?.presentation_theme==='voyage'?'voyage':'campus',sample:false,groups:[]};}
export function asset(name,width=960){return '/assets/redesign-v2/web/'+name+'-'+width+'.webp';}

// 封面只接受同站静态资源引用；私有附件仍由服务器鉴权，失败时保留安全底色。
export function safeCoverSource(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes(String.fromCharCode(92)) || [...value].some(c => c.charCodeAt(0) <= 32)) return null;
  try {
    const url = new URL(value, 'https://platform.invalid');
    return url.origin === 'https://platform.invalid' && /^\/(assets|uploads)\//.test(url.pathname) ? url.pathname + url.search : null;
  } catch { return null; }
}
