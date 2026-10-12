import {copyText as siteText} from "../content/systemText.js";
export const feedbackTypes = {
  suggestion: siteText("site.980bd5f3761ee613"),
  bug: siteText("site.f008f266458f9a16"),
  question: siteText("site.7547cfa127e70455"),
  content: siteText("site.fcd59b91ea3b2023"),
  other: siteText("site.2fa61cb253029231"),
};

export const feedbackModules = {
  auth: siteText("site.7b8cd75fd428f693"),
  dashboard: siteText("site.29dd3f99a7984745"),
  courses: siteText("site.ec6c798ce431a517"),
  students: siteText("site.31e9a480ae76c0f1"),
  works: siteText("site.f37da9bba1e4692a"),
  archives: siteText("site.a464089f5c3c50b0"),
  assistant: siteText("site.814cc87fde09f401"),
  other: siteText("site.2fa61cb253029231"),
};

export const feedbackStatuses = {
  pending: { label: siteText("site.34f4666ee3988229"), color: 'orange' },
  processing: { label: siteText("site.2a560d15b1440621"), color: 'blue' },
  waiting_user: { label: siteText("site.1e1e368902252ee4"), color: 'gold' },
  resolved: { label: siteText("site.f7a802c8b97f03d6"), color: 'green' },
  closed: { label: siteText("site.e07fd78fd0505320"), color: 'default' },
  rejected: { label: siteText("site.911a80f5f3fb9957"), color: 'red' },
};

export const feedbackPriorities = {
  low: { label: siteText("site.0dd8a6f751d6ca83"), color: 'default' },
  normal: { label: siteText("site.1918ea8335bcba93"), color: 'blue' },
  high: { label: siteText("site.1e3523823084b84b"), color: 'orange' },
  urgent: { label: siteText("site.97725a4620e6e03e"), color: 'red' },
};

export const feedbackTypeOptions = Object.entries(feedbackTypes).map(([value, label]) => ({ value, label }));
export const feedbackModuleOptions = Object.entries(feedbackModules).map(([value, label]) => ({ value, label }));
export const feedbackStatusOptions = Object.entries(feedbackStatuses).map(([value, item]) => ({ value, label: item.label }));
export const feedbackPriorityOptions = Object.entries(feedbackPriorities).map(([value, item]) => ({ value, label: item.label }));

export const feedbackStatusTransitions = {
  pending: ['processing', 'waiting_user', 'rejected'],
  processing: ['waiting_user', 'rejected'],
  waiting_user: ['processing', 'rejected'],
  resolved: ['closed', 'processing'],
  closed: ['processing'],
  rejected: ['processing'],
};
