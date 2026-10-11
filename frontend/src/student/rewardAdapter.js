import {copyText as siteText} from "../content/systemText.js";
import { rewardStorageKey, notifyDemoRewardsChanged } from './rewardEvents.js';
import { initialRewardState, validateRewardState, redeemReward, rewardSnapshot, rewardFailure } from './rewardModel.js';
import { openRewardDatabase, rewardTransaction, REWARD_DATABASE } from './rewardDatabase.js';
import {rewardDemoConfig} from './rewardConfig.js';

const corrupt = () => rewardFailure('CORRUPT_DATA', siteText("site.9b3b42e49ac0a0a5"));
function validateAccount(record) {
  if (!record?.initialized || record.schemaVersion !== 1 || !Number.isInteger(record.revision) || record.revision < 1) throw corrupt();
  validateRewardState(record.state);
  validateMeta(record);
  return record;
}
function validateMeta(record){
 const meta=record.meta;
 if(meta!==undefined&&(!meta||!Array.isArray(meta.checkins)||!Array.isArray(meta.outbox)||meta.checkins.some(d=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))||meta.outbox.some(e=>!e||typeof e.id!=='string'||typeof e.giftId!=='string'||!['pending','synced'].includes(e.sync))))throw corrupt();
 return meta||{checkins:[],outbox:[]};
}
// The first argument is a v1 migration source only. It is never a write destination.
export function createDemoRewardAdapter(storageSource, accountId, options = {}) {
  if (!accountId) throw new Error(siteText("site.9ff17e5009f01556"));
  const key = rewardStorageKey(accountId), id = String(accountId);
  const databaseName = options.databaseName || REWARD_DATABASE;
  const factory = Object.hasOwn(options, 'indexedDB') ? options.indexedDB : (() => window.indexedDB);
  let syncWarning = '', initialized = false;
  const legacyState = () => {
    let storage, saved;
    try {
      storage = typeof storageSource === 'function' ? storageSource() : storageSource;
      if (!storage) throw Error();
    } catch { throw rewardFailure('STORAGE_ACCESS', siteText("site.f2d529c0ec0c28e2")); }
    try { saved = storage.getItem(key); }
    catch { throw rewardFailure('READ_FAILED', siteText("site.bfb7895a6afdd098")); }
    if (saved === null || saved === undefined) return { state: initialRewardState(), source: 'new' };
    try { return { state: validateRewardState(JSON.parse(saved)), source: 'v1' }; }
    catch { throw corrupt(); }
  };
  const read = db => rewardTransaction(db, 'readonly', (store, done) => {
    const request = store.get(id);
    request.onsuccess = () => done(request.result);
  });
  const ensure = async (db, signal) => {
    const existing = await read(db);
    if (existing !== undefined) return validateAccount(existing); // Do not touch localStorage again.
    const legacy = legacyState(); // Preparation outside the live readwrite transaction.
    return rewardTransaction(db, 'readwrite', (store, done, fail) => {
      const request = store.get(id);
      request.onsuccess = () => {
        try {
          if (request.result !== undefined) { done(validateAccount(request.result)); return; }
          const account = { accountId: id, schemaVersion: 1, initialized: true, source: legacy.source,
            initializedAt: new Date().toISOString(), revision: 1, state: legacy.state };
          store.put(account); done(account);
        } catch (error) { fail(error); }
      };
    }, { signal, write: true });
  };
  const withDatabase = async operation => {
    const db = await openRewardDatabase(factory, databaseName);
    try { return await operation(db); } finally { db.close(); }
  };
  const change = async (kind, giftId, requestId, { signal, day } = {}) => {
    signal?.throwIfAborted();
    const result = await withDatabase(async db => {
      if (kind !== 'reset' && !initialized) { await ensure(db, signal); initialized = true; }
      return rewardTransaction(db, 'readwrite', (store, done, fail) => {
        const request = store.get(id);
        request.onsuccess = () => {
          try {
            const existing = request.result;
            if (kind === 'reset') {
              // Confirmed reset also recovers corrupt/missing state, without reading a broken v1 source.
              const meta=validateMeta(existing||{});
              const account = { accountId: id, schemaVersion: 1, initialized: true, source: 'reset',meta,
                initializedAt: existing?.initializedAt || new Date().toISOString(),
                revision: Number.isInteger(existing?.revision) && existing.revision >= 1 ? existing.revision + 1 : 1, state: initialRewardState() };
              store.put(account); done(rewardSnapshot(account.state)); return;
            }
            const account = validateAccount(existing);
            const meta=account.meta=validateMeta(account);
            if(kind==='checkin'){
              const now=options.clock?options.clock():performance.now();
              if(!day||!/^\d{4}-\d{2}-\d{2}$/.test(day.date)||!Number.isFinite(day.expires)||now>=day.expires)throw rewardFailure('DATE_EXPIRED',siteText("site.a180b9d47a1d73f7"));
              if(meta.checkins.includes(day.date)){done({changed:false,date:day.date});return;}
              meta.checkins.push(day.date);account.state.balance+=rewardDemoConfig.dailyCoins;
              account.state.ledger.unshift({id:'checkin:'+day.date,title:siteText("site.008129487629f259"),amount:rewardDemoConfig.dailyCoins,time:new Date().toISOString()});
              account.revision++;store.put(account);done({changed:true,date:day.date,amount:rewardDemoConfig.dailyCoins});return;
            }
            if(kind==='synced'){
              const event=meta.outbox.find(e=>e.id===requestId);if(!event)throw corrupt();
              if(event.sync!=='synced'){event.sync='synced';account.revision++;const record=account.state.records.find(r=>r.id===requestId);if(record)record.status=siteText("site.d91266861354a840");store.put(account);}done(event);return;
            }
            const intent=meta.outbox.find(e=>e.id===requestId);
            if(intent){if(intent.giftId!==giftId)throw rewardFailure('REQUEST_CONFLICT',siteText("site.4ff275ef2b159cb1"));done(intent);return;}
            const { record, changed } = redeemReward(account.state, giftId, requestId);
            if (changed) { meta.outbox.push({...record,sync:'pending'});account.revision++; store.put(account); }
            done(record);
          } catch (error) { fail(error); }
        };
      }, { signal, write: true });
    });
    // This runs only after complete. Broadcast failure must never turn a committed write into failure.
    initialized = true;
    syncWarning = notifyDemoRewardsChanged(accountId);
    return result;
  };
  return {
    mode: 'demo',
    load: () => withDatabase(async db => { const account = await ensure(db); initialized = true; return { ...rewardSnapshot(account.state),...validateMeta(account), syncWarning }; }),
    redeem: (giftId, requestId, settings) => change('redeem', giftId, requestId, settings),
    checkin: settings=>change('checkin',undefined,undefined,settings),
    markSynced:(requestId,settings)=>change('synced',undefined,requestId,settings),
    reset: settings => change('reset', undefined, undefined, settings),
  };
}
export const createRewardAdapter = createDemoRewardAdapter;
