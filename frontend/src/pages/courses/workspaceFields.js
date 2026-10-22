// Administrator-only guidance. Never inserted into student teaching fields.
export const lessonTemplates=[
 {value:'learning',label:'普通教学',help:'按原学习闭环填写课堂回顾、知识卡片与练习、报告和开放反思。保存后先处于准备中，核对后逐项发布。'},
 {value:'visit',label:'参观体验',help:'优先填写参观文章、现场图片与回放；可补充卡片和资料，不自动创建作业或完成记录。'},
 {value:'theory',label:'理论学习',help:'优先填写概念、案例、卡片与配套题目，参考答案与解析由原知识卡片编辑器管理。'},
 {value:'experiment',label:'实践操作',help:'优先填写实践步骤、材料和证据要求；实验需显式关联，不自动绑定滑翔机。'},
];
export const courseChecklist=[
 ['title','课程名称','创建必填'],['created_by','负责人（创建账号）','创建必填'],['grade_level','适用学段','选填'],
 ['description','课程简介','发布前检查'],['driving_question','核心问题','选填'],['learning_objectives','学习目标','选填'],
 ['presentation_theme','视觉预设','按需填写'],['cover_image','课程封面','选填'],['materials_needed','材料准备','选填'],
];
export {hasTeachingValue} from '../../utils/teachingContent.js';
