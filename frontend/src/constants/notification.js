import {copyText as siteText} from "../content/systemText.js";
export const notificationCategories = {
  feedback: { label: siteText("site.e4e1bb5509e5b19e"), color: 'blue' },
  course: { label: siteText("site.c87e49055ff0f7ce"), color: 'geekblue' },
  task: { label: siteText("site.e03ad4bbd871a815"), color: 'cyan' },
  work: { label: siteText("site.193fe12e29139e48"), color: 'purple' },
  archive: { label: siteText("site.80f12a89d77b3e88"), color: 'green' },
  account: { label: siteText("site.231bf397944089ff"), color: 'gold' },
  system: { label: siteText("site.2c59c54e948428a1"), color: 'default' },
  security: { label: siteText("site.b171eaa30dad99bc"), color: 'red' },
};

export const notificationLevels = {
  normal: { label: siteText("site.8bada91becfb84c2"), color: 'default' },
  important: { label: siteText("site.33f051058b130c29"), color: 'orange' },
  urgent: { label: siteText("site.cd9172c122f13b00"), color: 'red' },
  security: { label: siteText("site.b171eaa30dad99bc"), color: 'magenta' },
};

export const notificationCategoryOptions = Object.entries(notificationCategories)
  .map(([value, item]) => ({ value, label: item.label }));

export const notificationLevelOptions = Object.entries(notificationLevels)
  .map(([value, item]) => ({ value, label: item.label }));

export const notificationReadOptions = [
  { value: 'unread', label: siteText("site.fc28a6ef6f9cdf54") },
  { value: 'read', label: siteText("site.11bea73a90a654df") },
];
