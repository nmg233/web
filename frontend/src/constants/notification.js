import {copyText as siteText} from "../content/systemText.js";
export const notificationCategories = {
  feedback: { get label(){return siteText("site.e4e1bb5509e5b19e")}, color: 'blue' ,__copyIds:{"label":"site.e4e1bb5509e5b19e"}},
  course: { get label(){return siteText("site.c87e49055ff0f7ce")}, color: 'geekblue' ,__copyIds:{"label":"site.c87e49055ff0f7ce"}},
  task: { get label(){return siteText("site.e03ad4bbd871a815")}, color: 'cyan' ,__copyIds:{"label":"site.e03ad4bbd871a815"}},
  work: { get label(){return siteText("site.193fe12e29139e48")}, color: 'purple' ,__copyIds:{"label":"site.193fe12e29139e48"}},
  archive: { get label(){return siteText("site.80f12a89d77b3e88")}, color: 'green' ,__copyIds:{"label":"site.80f12a89d77b3e88"}},
  account: { get label(){return siteText("site.231bf397944089ff")}, color: 'gold' ,__copyIds:{"label":"site.231bf397944089ff"}},
  system: { get label(){return siteText("site.2c59c54e948428a1")}, color: 'default' ,__copyIds:{"label":"site.2c59c54e948428a1"}},
  security: { get label(){return siteText("site.b171eaa30dad99bc")}, color: 'red' ,__copyIds:{"label":"site.b171eaa30dad99bc"}},
};

export const notificationLevels = {
  normal: { get label(){return siteText("site.8bada91becfb84c2")}, color: 'default' ,__copyIds:{"label":"site.8bada91becfb84c2"}},
  important: { get label(){return siteText("site.33f051058b130c29")}, color: 'orange' ,__copyIds:{"label":"site.33f051058b130c29"}},
  urgent: { get label(){return siteText("site.cd9172c122f13b00")}, color: 'red' ,__copyIds:{"label":"site.cd9172c122f13b00"}},
  security: { get label(){return siteText("site.b171eaa30dad99bc")}, color: 'magenta' ,__copyIds:{"label":"site.b171eaa30dad99bc"}},
};

export const notificationCategoryOptions = Object.keys(notificationCategories).map(value => ({value,get label(){return notificationCategories[value].label}}));

export const notificationLevelOptions = Object.keys(notificationLevels).map(value => ({value,get label(){return notificationLevels[value].label}}));

export const notificationReadOptions = [
  { value: 'unread', get label(){return siteText("site.fc28a6ef6f9cdf54")} ,__copyIds:{"label":"site.fc28a6ef6f9cdf54"}},
  { value: 'read', get label(){return siteText("site.11bea73a90a654df")} ,__copyIds:{"label":"site.11bea73a90a654df"}},
];
