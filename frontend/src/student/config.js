import {copyText as siteText} from "../content/systemText.js";
// 仅在课程负责人确认真实课程 ID、章节名及课时归属后填写。
// 示例结构：{ [courseId]: [{ title, lessonIds: [] }] }；未分组课时始终显示。
export const courseGroups = {};

// 仅用于自动化验收的合成课程；普通启动与生产构建不会启用。
export const testCourseGroups = {
  1: [
    { title: siteText("site.1da51b2c3217cd29"), lessonIds: [1, 2] },
    { title: siteText("site.bdd2b02d6af5b405"), lessonIds: [3, 4] },
  ],
};

export const studentTestConfigEnabled = import.meta.env.DEV && import.meta.env.VITE_STUDENT_TEST_CONFIG === '1';
export function groupsForCourse(courseId) {
  return (studentTestConfigEnabled ? testCourseGroups : courseGroups)[courseId] || [];
}

export const experiments = [
  { id: 'glider', title: siteText("site.4afcb120a8a12c02"), path: '/glider', description: siteText("site.4ce36122fab6b829"), cover:{name:'glider-cover',alt:siteText("site.62e96e09f1474406"),position:'50% 48%',width:480,height:720} },
];
