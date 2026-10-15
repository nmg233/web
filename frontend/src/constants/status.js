import {copyText as siteText} from "../content/systemText.js";
export const REPORT_STATUS = {
  get submitted(){return { get label(){return siteText("site.b94e7f9727438356")}, color: 'orange' ,__copyIds:{"label":"site.b94e7f9727438356"}}},
  get approved(){return { get label(){return siteText("site.d6f3aee5e8160484")}, color: 'green' ,__copyIds:{"label":"site.d6f3aee5e8160484"}}},
  get rejected(){return { get label(){return siteText("site.03cf0ab64a141c28")}, color: 'red' ,__copyIds:{"label":"site.03cf0ab64a141c28"}}},
};

export const WORK_STATUS = {
  get pending(){return { get label(){return siteText("site.b94e7f9727438356")}, color: 'orange' ,__copyIds:{"label":"site.b94e7f9727438356"}}},
  get approved(){return { get label(){return siteText("site.d6f3aee5e8160484")}, color: 'green' ,__copyIds:{"label":"site.d6f3aee5e8160484"}}},
  get rejected(){return { get label(){return siteText("site.03cf0ab64a141c28")}, color: 'red' ,__copyIds:{"label":"site.03cf0ab64a141c28"}}},
};

export const LEARNING_STEPS = new Proxy(["site.ca36c6b73ce889a0","site.077104634408f9d0","site.a7cba03f8541382b","site.847ccf5aa1db2a34"],{get(target,property){const value=Reflect.get(target,property);return typeof value==='string'?siteText(value):value;}});
