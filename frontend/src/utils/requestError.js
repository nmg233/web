import {copyText as siteText} from "../content/systemText.js";
export function requestError(error, { action = siteText("site.1542280ccb3c9f4c"), write = false } = {}) {
  if (error?.code === 'AUTH_STORAGE' || error?.code === 'PASSWORD_CHANGED_STORAGE') return error.message;
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') return write
    ? action + siteText("site.96d23b0be0a1ca36")
    : action + siteText("site.afc0506d647eb2de");
  if (error?.response?.data?.error || error?.response?.data?.message) return error.response.data.error || error.response.data.message;
  if (!error?.response) return write ? action + siteText("site.265a3de82f37bba5") : siteText("site.ad763f0f31deeb3e");
  return action + siteText("site.f46bf25949069f2c");
}
export function objectErrorTitle(error, object) {
  return error?.response?.status === 404 ? object + siteText("site.c17447bfc59c1b00")
    : error?.response?.status === 403 ? siteText("site.f38395ffc0882a3e") + object : object + siteText("site.865e772e54d4a87d");
}
