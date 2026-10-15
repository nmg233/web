import {runtimeText as runtimeCopyText} from '../../content/runtimeCopy.js';
// 学生使用指南正文。这里改动的文字会同时出现在「使用指南」页面和登录后的自动弹窗里。
//
// 与《作业完成要求》合并时，只需把那份文档的内容按同样的结构追加到本文件的
// homeworkRequirementSections 数组；指南页与弹窗会自动把它排在指南后面，无需改动组件。
//
// 每个区块支持：title（必需）、summary（一句话说明）、steps（有序步骤）、points（要点）、notice（提醒框）。
// id 必须唯一，用于锚点和无障碍标注。

export const studentGuideUpdatedAt = '2026-10-14';

export const guideSections = [
  {
    id: 'account',
    get title(){return runtimeCopyText("student26.3a0cafd2d2348ad5")},
    get summary(){return runtimeCopyText("student26.aa4d092a2ebd22f7")},
    get points(){return [
      runtimeCopyText("student26.fc7fe0d6a7bc0261"),
      runtimeCopyText("student26.161856a2f61282eb"),
      runtimeCopyText("student26.a6dc5f20612c2f3c"),
    ]},
    get notice(){return runtimeCopyText("student26.419b263b66d9ad49")},

titleCopyId:"student26.3a0cafd2d2348ad5",summaryCopyId:"student26.aa4d092a2ebd22f7",pointsCopyIds:["student26.fc7fe0d6a7bc0261","student26.161856a2f61282eb","student26.a6dc5f20612c2f3c"],noticeCopyId:"student26.419b263b66d9ad49",
__copyIds:{"title":"student26.3a0cafd2d2348ad5","summary":"student26.aa4d092a2ebd22f7"}},
  {
    id: 'platform',
    get title(){return runtimeCopyText("student26.209779059b4bb3f5")},
    get summary(){return runtimeCopyText("student26.04f03022294e6483")},
    get points(){return [
      runtimeCopyText("student26.db7e3bcd61abac3f"),
      runtimeCopyText("student26.18a7975258ed221e"),
      runtimeCopyText("student26.00838d190cd421f7"),
      runtimeCopyText("student26.5c9310163ce2973d"),
      runtimeCopyText("student26.ddc2e0006a396755"),
    ]},

titleCopyId:"student26.209779059b4bb3f5",summaryCopyId:"student26.04f03022294e6483",pointsCopyIds:["student26.db7e3bcd61abac3f","student26.18a7975258ed221e","student26.00838d190cd421f7","student26.5c9310163ce2973d","student26.ddc2e0006a396755"],
__copyIds:{"title":"student26.209779059b4bb3f5","summary":"student26.04f03022294e6483"}},
  {
    id: 'courses',
    get title(){return runtimeCopyText("student26.c97962f46c4ddefe")},
    get summary(){return runtimeCopyText("student26.734d2a353934434a")},
    get points(){return [
      runtimeCopyText("student26.07f921ce0c6ddfd6"),
      runtimeCopyText("student26.b99f02023f8ef880"),
      runtimeCopyText("student26.6c26d3104245e42f"),
      runtimeCopyText("student26.57431590abd56551"),
    ]},
    get notice(){return runtimeCopyText("student26.8f302bb2cca81c5e")},

titleCopyId:"student26.c97962f46c4ddefe",summaryCopyId:"student26.734d2a353934434a",pointsCopyIds:["student26.07f921ce0c6ddfd6","student26.b99f02023f8ef880","student26.6c26d3104245e42f","student26.57431590abd56551"],noticeCopyId:"student26.8f302bb2cca81c5e",
__copyIds:{"title":"student26.c97962f46c4ddefe","summary":"student26.734d2a353934434a"}},
  {
    id: 'lesson-loop',
    get title(){return runtimeCopyText("student26.801eb872a710de92")},
    get summary(){return runtimeCopyText("student26.0b6699cef3827b23")},
    get steps(){return [
      runtimeCopyText("student26.71e94e20b7893c6a"),
      runtimeCopyText("student26.2fc439bc5b2796de"),
      runtimeCopyText("student26.a8160252249046a3"),
      runtimeCopyText("student26.35125dfc82a3dbc9"),
    ]},
    get notice(){return runtimeCopyText("student26.4ce33da01f821406")},

titleCopyId:"student26.801eb872a710de92",summaryCopyId:"student26.0b6699cef3827b23",stepsCopyIds:["student26.71e94e20b7893c6a","student26.2fc439bc5b2796de","student26.a8160252249046a3","student26.35125dfc82a3dbc9"],noticeCopyId:"student26.4ce33da01f821406",
__copyIds:{"title":"student26.801eb872a710de92","summary":"student26.0b6699cef3827b23"}},
  {
    id: 'tasks-works',
    get title(){return runtimeCopyText("student26.5c6b4e6c1c3f2a02")},
    get summary(){return runtimeCopyText("student26.22c88aec4169e936")},
    get points(){return [
      runtimeCopyText("student26.abfea880f47af0d2"),
      runtimeCopyText("student26.cfb8ff8f31e9cbc2"),
      runtimeCopyText("student26.11747e455810eb5d"),
      runtimeCopyText("student26.c2de57f4e4fe73b3"),
      runtimeCopyText("student26.af3fe1b72004c24d"),
    ]},
    get notice(){return runtimeCopyText("student26.622f88aac7dfd2dc")},

titleCopyId:"student26.5c6b4e6c1c3f2a02",summaryCopyId:"student26.22c88aec4169e936",pointsCopyIds:["student26.abfea880f47af0d2","student26.cfb8ff8f31e9cbc2","student26.11747e455810eb5d","student26.c2de57f4e4fe73b3","student26.af3fe1b72004c24d"],noticeCopyId:"student26.622f88aac7dfd2dc",
__copyIds:{"title":"student26.5c6b4e6c1c3f2a02","summary":"student26.22c88aec4169e936"}},
  {
    id: 'archive',
    get title(){return runtimeCopyText("student26.33fbc45b9f1acbf2")},
    get summary(){return runtimeCopyText("student26.fa6a9d139ce25c69")},
    get points(){return [
      runtimeCopyText("student26.0b10f82c82517bd7"),
      runtimeCopyText("student26.a72ccd9057873cb9"),
      runtimeCopyText("student26.9f28c9677415fe75"),
      runtimeCopyText("student26.4eb34bbd9336cc1d"),
      runtimeCopyText("student26.59065976a3898c29"),
    ]},
    get notice(){return runtimeCopyText("student26.823047bba8999399")},

titleCopyId:"student26.33fbc45b9f1acbf2",summaryCopyId:"student26.fa6a9d139ce25c69",pointsCopyIds:["student26.0b10f82c82517bd7","student26.a72ccd9057873cb9","student26.9f28c9677415fe75","student26.4eb34bbd9336cc1d","student26.59065976a3898c29"],noticeCopyId:"student26.823047bba8999399",
__copyIds:{"title":"student26.33fbc45b9f1acbf2","summary":"student26.fa6a9d139ce25c69"}},
  {
    id: 'lab',
    get title(){return runtimeCopyText("student26.744e37ecddf8895a")},
    get summary(){return runtimeCopyText("student26.f305549738cd86c9")},
    get points(){return [
      runtimeCopyText("student26.f6512e96bfc8b2c9"),
      runtimeCopyText("student26.cc250c6cb2e2aa0f"),
      runtimeCopyText("student26.e9a6f4441385b7ed"),
      runtimeCopyText("student26.b493df2076dc81cb"),
    ]},
    get notice(){return runtimeCopyText("student26.9677243246b48469")},

titleCopyId:"student26.744e37ecddf8895a",summaryCopyId:"student26.f305549738cd86c9",pointsCopyIds:["student26.f6512e96bfc8b2c9","student26.cc250c6cb2e2aa0f","student26.e9a6f4441385b7ed","student26.b493df2076dc81cb"],noticeCopyId:"student26.9677243246b48469",
__copyIds:{"title":"student26.744e37ecddf8895a","summary":"student26.f305549738cd86c9"}},
  {
    id: 'assistant',
    get title(){return runtimeCopyText("student26.aaaa193ca90efb51")},
    get summary(){return runtimeCopyText("student26.df6b2081426fc85b")},
    get points(){return [
      runtimeCopyText("student26.8fb14c5914e931fc"),
      runtimeCopyText("student26.f30f83d716a5b461"),
      runtimeCopyText("student26.f23eff9a82aa2ef6"),
      runtimeCopyText("student26.3669ef7991d49cc2"),
    ]},

titleCopyId:"student26.aaaa193ca90efb51",summaryCopyId:"student26.df6b2081426fc85b",pointsCopyIds:["student26.8fb14c5914e931fc","student26.f30f83d716a5b461","student26.f23eff9a82aa2ef6","student26.3669ef7991d49cc2"],
__copyIds:{"title":"student26.aaaa193ca90efb51","summary":"student26.df6b2081426fc85b"}},
  {
    id: 'rewards',
    get title(){return runtimeCopyText("student26.9f614182a46c6b8b")},
    get summary(){return runtimeCopyText("student26.42c9346c3959a0e3")},
    get points(){return [
      runtimeCopyText("student26.9eb2d0bc5a46fe55"),
      runtimeCopyText("student26.d7eb009ac0dc147b"),
      runtimeCopyText("student26.bc5beff25e6691ea"),
      runtimeCopyText("student26.60cb057d0b1e7956"),
      runtimeCopyText("student26.3852685430d6dbd2"),
    ]},
    get notice(){return runtimeCopyText("student26.57dde29b77df13b2")},

titleCopyId:"student26.9f614182a46c6b8b",summaryCopyId:"student26.42c9346c3959a0e3",pointsCopyIds:["student26.9eb2d0bc5a46fe55","student26.d7eb009ac0dc147b","student26.bc5beff25e6691ea","student26.60cb057d0b1e7956","student26.3852685430d6dbd2"],noticeCopyId:"student26.57dde29b77df13b2",
__copyIds:{"title":"student26.9f614182a46c6b8b","summary":"student26.42c9346c3959a0e3"}},
  {
    id: 'support',
    get title(){return runtimeCopyText("student26.47874a5a38b1dc85")},
    get summary(){return runtimeCopyText("student26.4f1aca89efb02468")},
    get points(){return [
      runtimeCopyText("student26.7f4da86d999780ce"),
      runtimeCopyText("student26.e3a992c3bf0e2325"),
      runtimeCopyText("student26.1c9b7721822e740d"),
    ]},

titleCopyId:"student26.47874a5a38b1dc85",summaryCopyId:"student26.4f1aca89efb02468",pointsCopyIds:["student26.7f4da86d999780ce","student26.e3a992c3bf0e2325","student26.1c9b7721822e740d"],
__copyIds:{"title":"student26.47874a5a38b1dc85","summary":"student26.4f1aca89efb02468"}},
  {
    id: 'faq',
    get title(){return runtimeCopyText("student26.6323dc41d23e65ef")},
    get points(){return [
      runtimeCopyText("student26.f92dd4840cc498d4"),
      runtimeCopyText("student26.1d692327d06c8a35"),
      runtimeCopyText("student26.df79d440391398fb"),
      runtimeCopyText("student26.2a308d2feac5ec1f"),
      runtimeCopyText("student26.2786beca0a8e8243"),
      runtimeCopyText("student26.6d04a4cd8ec45a1f"),
    ]},

titleCopyId:"student26.6323dc41d23e65ef",pointsCopyIds:["student26.f92dd4840cc498d4","student26.1d692327d06c8a35","student26.df79d440391398fb","student26.2a308d2feac5ec1f","student26.2786beca0a8e8243","student26.6d04a4cd8ec45a1f"],
__copyIds:{"title":"student26.6323dc41d23e65ef"}},
];

// 待补：《作业完成要求》尚未定稿。定稿后把内容按上面的结构写进本数组即可，
// 弹窗与指南页会自动把「作业完成要求」排在学生使用指南后面；保持数组为空时这一段不会显示。
//
// 示例：
// { id: 'homework-requirements', title: '作业完成要求', summary: '……',
//   steps: ['……', '……'], points: ['……'], notice: '……' },
export const homeworkRequirementSections = [];
export const studentGuideDocument = {
  updatedAt: studentGuideUpdatedAt,
  sections: [...guideSections, ...homeworkRequirementSections],
  get footnote(){return runtimeCopyText("student26.9745963f45309ea6")},

footnoteCopyId:"student26.9745963f45309ea6",
};
