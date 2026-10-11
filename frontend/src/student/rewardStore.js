import {copyText as siteText} from "../content/systemText.js";
import { DEMO_REWARDS_CHANGED, REWARD_CHANNEL, rewardStorageKey, rewardSyncWarning } from './rewardEvents.js';

// One account snapshot serves the header and page; broadcasts only invalidate reads.
export function createRewardStore({ accountId, adapter, target, createChannel = () => new BroadcastChannel(REWARD_CHANNEL) }) {
  let state = { data: null, status: 'loading', error: null, refreshing: false, syncWarning: '' };
  let sequence = 0, channel;
  const listeners = new Set();
  const publish = next => { state = next; listeners.forEach(listener => listener()); };
  const refresh = async () => {
    if (!listeners.size) return;
    const ticket = ++sequence;
    publish({ ...state, refreshing: true });
    try {
      const data = await adapter.load();
      if (ticket === sequence && listeners.size) publish({ ...state, data, status: 'ready', error: null, refreshing: false,
        syncWarning: data.syncWarning || state.syncWarning });
    } catch (error) {
      if (ticket === sequence && listeners.size) publish({ ...state, status: 'error', error, refreshing: false });
    }
  };
  const onStorage = event => {
    if (event.key === rewardStorageKey(accountId)) {
      publish({ ...state, syncWarning: siteText("site.2a4f35fa11b8ef8f") });
      refresh();
    } else if (event.key === null) refresh();
  };
  const onChange = event => {
    if (String(event.detail?.accountId) !== String(accountId)) return;
    if (event.detail.syncWarning) publish({ ...state, syncWarning: event.detail.syncWarning });
    refresh();
  };
  const subscribe = listener => {
    listeners.add(listener);
    if (listeners.size === 1) {
      target.addEventListener('focus', refresh);
      target.addEventListener('storage', onStorage);
      target.addEventListener(DEMO_REWARDS_CHANGED, onChange);
      try {
        channel = createChannel();
        if (!channel) throw Error();
        channel.onmessage = event => { if (String(event.data?.accountId) === String(accountId)) refresh(); };
        channel.onmessageerror = () => publish({ ...state, syncWarning: rewardSyncWarning });
      } catch { publish({ ...state, syncWarning: rewardSyncWarning }); }
      refresh();
    }
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        sequence++;
        target.removeEventListener('focus', refresh);
        target.removeEventListener('storage', onStorage);
        target.removeEventListener(DEMO_REWARDS_CHANGED, onChange);
        if (channel) { channel.onmessage = null; channel.onmessageerror = null; try { channel.close(); } catch { /* No live UI. */ } channel = null; }
      }
    };
  };
  const mutate = async operation => {
    try { return await operation(); }
    finally { await refresh(); } // Failure here is a read failure, never a rollback claim.
  };
  return { subscribe, getSnapshot: () => state, refresh,
    redeem: (...args) => mutate(() => adapter.redeem(...args)),
    checkin:(...args)=>mutate(()=>adapter.checkin(...args)),
    markSynced:(...args)=>mutate(()=>adapter.markSynced(...args)),
    reset: (...args) => mutate(() => adapter.reset(...args)),
  };
}
