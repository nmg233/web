import registry from '../../../../content/course-themes/registry.json' with {type:'json'};
export const publicThemes=registry.themes;
export const publicThemeOptions=Object.entries(publicThemes).map(([value,t])=>({value,label:t.label}));
export const themeNodes=Object.fromEntries(Object.values(publicThemes).flatMap(t=>t.nodes).map(n=>[n.id,n]));
export function effectiveTheme(course){return Object.hasOwn(publicThemes,course?.public_theme)?course.public_theme:course?.presentation_theme==='voyage'?'voyage':'campus';}
