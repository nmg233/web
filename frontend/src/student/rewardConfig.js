import {copyText as siteText} from "../content/systemText.js";
// 全部为演示规则，不与成绩、练习分数、真实发放规则关联。
export const rewardDemoConfig = {
  initialPoints: 120,
  dailyCoins: 5,
  gifts: [
    { id: 'notebook', type:'physical', title: siteText("site.7255c2778b690201"), cost: 40, stock: 3, description: siteText("site.5995736b4cab5b05"), limit: 2 },
    { id: 'model', type:'physical', title: siteText("site.57b0a8967cb74242"), cost: 160, stock: 2, description: siteText("site.c4839998e7f446ca"), limit: 1 },
    { id: 'sticker', type:'physical', title: siteText("site.12a0ba25c2b45d2c"), cost: 20, stock: 0, description: siteText("site.962a411319449928"), limit: 1 },
    { id:'digital-theory',type:'badge',art:'theory',title:siteText("site.02e8d3ffba1f50da"),cost:30,stock:1,limit:1,description:siteText("site.1235e82d57cc4bfd") },
    { id:'digital-glider',type:'badge',art:'glider',title:siteText("site.2dad71911a230851"),cost:30,stock:1,limit:1,description:siteText("site.abf1f2bb5198074d") },
  ],
  badges: [
    { id: 'record', title: siteText("site.64adda56fb262640"), earned: true, description: siteText("site.bdfdde02dca02d48"), condition: siteText("site.2b2b414f050133b7") },
    { id: 'iterate', title: siteText("site.e73a10cfcc7f1065"), earned: false, description: siteText("site.90e246bd6a124dae"), condition: siteText("site.65b678f067c8e614") },
  ],
};
