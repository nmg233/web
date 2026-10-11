import {copyText as siteText, copyTemplate as siteTemplate} from "../content/systemText.js";
import { rewardDemoConfig as config } from './rewardConfig.js';
export const rewardFailure = (code, message) => Object.assign(new Error(message), { code });
export const initialRewardState = () => ({ balance: config.initialPoints, records: [], ledger: [
  { id: 'initial', title: siteText("site.59a1183105b69521"), amount: config.initialPoints, time: '' },
] });
export function validateRewardState(value) {
  if (!value || !Number.isFinite(value.balance) || value.balance < 0 || !Array.isArray(value.records) || !Array.isArray(value.ledger)
    || value.records.some(r => !r || typeof r.id !== 'string' || typeof r.giftId !== 'string' || typeof r.title !== 'string' || !Number.isFinite(r.cost) || typeof r.time !== 'string')
    || value.ledger.some(r => !r || typeof r.id !== 'string' || typeof r.title !== 'string' || !Number.isFinite(r.amount) || typeof r.time !== 'string'))
    throw rewardFailure('CORRUPT_DATA', siteText("site.aa4606fa75a94b68"));
  return value;
}
export function rewardCondition(gift, state) {
  const count = state.records.filter(record => record.giftId === gift.id).length;
  if (count >= gift.limit) return siteText("site.07666ab8081dfaa8");
  if (count >= gift.stock) return siteText("site.abfbf7a08600fbc4");
  if (state.balance < gift.cost) return `还差 ${gift.cost - state.balance} 演示金币`;
  return '';
}
export function rewardSnapshot(state) {
  validateRewardState(state);
  return { ...state, mode: 'demo', gifts: config.gifts.map(gift => ({ ...gift, blockedReason: rewardCondition(gift, state),
    remaining: Math.max(0, gift.stock - state.records.filter(record => record.giftId === gift.id).length) })), badges: config.badges };
}
// Pure rule application; the caller must read and apply this inside one readwrite transaction.
export function redeemReward(state, giftId, requestId) {
  validateRewardState(state);
  if (!requestId) throw rewardFailure('REQUEST_INVALID', siteText("site.572fd0905734ce6c"));
  const previous = state.records.find(record => record.id === requestId);
  if (previous) {
    if(previous.giftId!==giftId)throw rewardFailure('REQUEST_CONFLICT',siteText("site.14f4236a33906dec"));
    return { record: previous, changed: false };
  }
  const gift = config.gifts.find(item => item.id === giftId);
  if (!gift) throw rewardFailure('REQUEST_INVALID', siteText("site.c4c32ad1b6c20e19"));
  const reason = rewardCondition(gift, state);
  if (reason) throw rewardFailure('RULE_BLOCKED', reason);
  const record = { id: requestId, giftId, title: gift.title, type:gift.type, art:gift.art, cost: gift.cost, time: new Date().toISOString(), status: siteText("site.57064789ce9d8873") };
  state.balance -= gift.cost; state.records.unshift(record);
  state.ledger.unshift({ id: requestId, title: siteTemplate("site.fa87a51e40fd73d6", {slot0: (gift.title)}), amount: -gift.cost, time: record.time });
  return { record, changed: true };
}
