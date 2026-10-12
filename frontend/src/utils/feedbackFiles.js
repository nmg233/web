import {copyText as siteText} from "../content/systemText.js";
export const FEEDBACK_MAX_FILES = 3;
export const FEEDBACK_MAX_SIZE = 10 * 1024 * 1024;
const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf' };
export function feedbackFileError(file, count) {
  if (count >= FEEDBACK_MAX_FILES) return siteText("site.14c797e78b938855");
  const extension = file.name?.split('.').at(-1)?.toLowerCase();
  if (!mime[extension] || mime[extension] !== file.type) return siteText("site.641084bd18bdda68");
  if (file.size > FEEDBACK_MAX_SIZE) return siteText("site.33b7e7b2e470176f");
  return '';
}
export const studentFeedbackModules = { auth: siteText("site.ad70adac5e57f6d0"), dashboard: siteText("site.af492bcd0b6000c7"), courses: siteText("site.dfabeec2c0e418ab"), students: siteText("site.a95621c951c59963"), works: siteText("site.fc7753233f5e561e"), archives: siteText("site.dcb6e8e2a13e3f90"), assistant: siteText("site.36227347df94de45"), other: siteText("site.b4b2cdc382911e4b") };
