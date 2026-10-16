import {copyText as siteText} from "../content/systemText.js";
export const feedbackTypes = {
  get suggestion(){return siteText("site.980bd5f3761ee613")},
  get bug(){return siteText("site.f008f266458f9a16")},
  get question(){return siteText("site.7547cfa127e70455")},
  get content(){return siteText("site.fcd59b91ea3b2023")},
  get other(){return siteText("site.2fa61cb253029231")},
};

export const feedbackModules = {
  get auth(){return siteText("site.7b8cd75fd428f693")},
  get dashboard(){return siteText("site.29dd3f99a7984745")},
  get courses(){return siteText("site.ec6c798ce431a517")},
  get students(){return siteText("site.31e9a480ae76c0f1")},
  get works(){return siteText("site.f37da9bba1e4692a")},
  get archives(){return siteText("site.a464089f5c3c50b0")},
  get assistant(){return siteText("site.814cc87fde09f401")},
  get other(){return siteText("site.2fa61cb253029231")},
};

export const feedbackStatuses = {
  pending: { get label(){return siteText("site.34f4666ee3988229")}, color: 'orange' ,__copyIds:{"label":"site.34f4666ee3988229"}},
  processing: { get label(){return siteText("site.2a560d15b1440621")}, color: 'blue' ,__copyIds:{"label":"site.2a560d15b1440621"}},
  waiting_user: { get label(){return siteText("site.1e1e368902252ee4")}, color: 'gold' ,__copyIds:{"label":"site.1e1e368902252ee4"}},
  resolved: { get label(){return siteText("site.f7a802c8b97f03d6")}, color: 'green' ,__copyIds:{"label":"site.f7a802c8b97f03d6"}},
  closed: { get label(){return siteText("site.e07fd78fd0505320")}, color: 'default' ,__copyIds:{"label":"site.e07fd78fd0505320"}},
  rejected: { get label(){return siteText("site.911a80f5f3fb9957")}, color: 'red' ,__copyIds:{"label":"site.911a80f5f3fb9957"}},
};

export const feedbackPriorities = {
  low: { get label(){return siteText("site.0dd8a6f751d6ca83")}, color: 'default' ,__copyIds:{"label":"site.0dd8a6f751d6ca83"}},
  normal: { get label(){return siteText("site.1918ea8335bcba93")}, color: 'blue' ,__copyIds:{"label":"site.1918ea8335bcba93"}},
  high: { get label(){return siteText("site.1e3523823084b84b")}, color: 'orange' ,__copyIds:{"label":"site.1e3523823084b84b"}},
  urgent: { get label(){return siteText("site.97725a4620e6e03e")}, color: 'red' ,__copyIds:{"label":"site.97725a4620e6e03e"}},
};

export const feedbackTypeOptions = Object.keys(feedbackTypes).map(value => ({value,get label(){return feedbackTypes[value]}}));
export const feedbackModuleOptions = Object.keys(feedbackModules).map(value => ({value,get label(){return feedbackModules[value]}}));
export const feedbackStatusOptions = Object.keys(feedbackStatuses).map(value => ({value,get label(){return feedbackStatuses[value].label}}));
export const feedbackPriorityOptions = Object.keys(feedbackPriorities).map(value => ({value,get label(){return feedbackPriorities[value].label}}));

export const feedbackStatusTransitions = {
  pending: ['processing', 'waiting_user', 'rejected'],
  processing: ['waiting_user', 'rejected'],
  waiting_user: ['processing', 'rejected'],
  resolved: ['closed', 'processing'],
  closed: ['processing'],
  rejected: ['processing'],
};
