const registry=require('../../content/course-themes/registry.json');
const publicKeys=Object.keys(registry.themes),nodes=Object.fromEntries(Object.values(registry.themes).flatMap(t=>t.nodes).map(n=>[n.id,n]));
function effective(course){return publicKeys.includes(course?.public_theme)?course.public_theme:course?.presentation_theme==='voyage'?'voyage':'campus';}
function assertSelection(preset,current){if(publicKeys.includes(preset))return;if(preset==='voyage'&&effective(current)==='voyage')return;throw Object.assign(new Error('只能选择校园、蓝天白云、森林、海滩；存量远航仅可原样保留'),{status:400});}
module.exports={registry,publicKeys,nodes,effective,assertSelection};
