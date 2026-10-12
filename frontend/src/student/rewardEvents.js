import {copyText as siteText} from "../content/systemText.js";
export const DEMO_REWARDS_CHANGED = 'student-demo-rewards-changed';
export const REWARD_CHANNEL = 'star-voyage-reward-changes-v2';
export const rewardStorageKey = accountId => `star-voyage:rewards:demo:v1:${accountId}`;
export const rewardSyncWarning = siteText("site.a0efa7edcb9caf63");
export function notifyDemoRewardsChanged(accountId) {
  let warning = '', channel;
  try {
    channel = new BroadcastChannel(REWARD_CHANNEL);
    channel.postMessage({ accountId: String(accountId) }); // Signal only, never a trusted balance.
  } catch { warning = rewardSyncWarning; }
  finally { try { channel?.close(); } catch { warning = rewardSyncWarning; } }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(DEMO_REWARDS_CHANGED, { detail: { accountId, syncWarning: warning } }));
  return warning;
}
