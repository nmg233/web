import {copyText as siteText} from "../content/systemText.js";
// 全部为演示规则，不与成绩、练习分数、真实发放规则关联。
export const rewardDemoConfig = {
  initialPoints: 120,
  dailyCoins: 5,
  get gifts(){return [
    { id: 'notebook', type:'physical', get title(){return siteText("site.7255c2778b690201")}, cost: 40, stock: 3, get description(){return siteText("site.5995736b4cab5b05")}, limit: 2},
    { id: 'model', type:'physical', get title(){return siteText("site.57b0a8967cb74242")}, cost: 160, stock: 2, get description(){return siteText("site.c4839998e7f446ca")}, limit: 1},
    { id: 'sticker', type:'physical', get title(){return siteText("site.12a0ba25c2b45d2c")}, cost: 20, stock: 0, get description(){return siteText("site.962a411319449928")}, limit: 1},
    { id:'digital-theory',type:'badge',art:'theory',get title(){return siteText("site.02e8d3ffba1f50da")},cost:30,stock:1,limit:1,get description(){return siteText("site.1235e82d57cc4bfd")}},
    { id:'digital-glider',type:'badge',art:'glider',get title(){return siteText("site.2dad71911a230851")},cost:30,stock:1,limit:1,get description(){return siteText("site.abf1f2bb5198074d")}},
  ]},
  get badges(){return [
    { id: 'record', get title(){return siteText("site.64adda56fb262640")}, earned: true, get description(){return siteText("site.bdfdde02dca02d48")}, get condition(){return siteText("site.2b2b414f050133b7")}},
    { id: 'iterate', get title(){return siteText("site.e73a10cfcc7f1065")}, earned: false, get description(){return siteText("site.90e246bd6a124dae")}, get condition(){return siteText("site.65b678f067c8e614")}},
  ]},
};
