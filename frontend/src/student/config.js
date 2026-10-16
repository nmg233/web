import {copyText as siteText} from "../content/systemText.js";
// 仅在课程负责人确认真实课程 ID、章节名及课时归属后填写。
// 示例结构：{ [courseId]: [{ title, lessonIds: [] }] }；未分组课时始终显示。
export const courseGroups = {};

// 仅用于自动化验收的合成课程；普通启动与生产构建不会启用。
export const testCourseGroups = {
  get 1(){return [
    { get title(){return siteText("site.1da51b2c3217cd29")}, lessonIds: [1, 2] ,__copyIds:{"title":"site.1da51b2c3217cd29"}},
    { get title(){return siteText("site.bdd2b02d6af5b405")}, lessonIds: [3, 4] ,__copyIds:{"title":"site.bdd2b02d6af5b405"}},
  ]},
};

export const studentTestConfigEnabled = import.meta.env.DEV && import.meta.env.VITE_STUDENT_TEST_CONFIG === '1';
export function groupsForCourse(courseId) {
  return (studentTestConfigEnabled ? testCourseGroups : courseGroups)[courseId] || [];
}

export const experiments = new Proxy([],{get(_target,property){const current=[
  { id: 'glider', get title(){return siteText("site.4afcb120a8a12c02")}, path: '/glider', get description(){return siteText("site.4ce36122fab6b829")}, cover:{name:'glider-cover',get alt(){return siteText("site.62e96e09f1474406")},position:'50% 48%',width:480,height:720} ,__copyIds:{"title":"site.4afcb120a8a12c02","description":"site.4ce36122fab6b829"}},
];const item=Reflect.get(current,property);return typeof item==='function'?item.bind(current):item;}});
