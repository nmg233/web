import {copyText as siteText} from "../content/systemText.js";
import { rewardFailure } from './rewardModel.js';
export const REWARD_DATABASE = 'star-voyage-rewards';
export const REWARD_STORE = 'accounts';
export function openRewardDatabase(factorySource, name = REWARD_DATABASE) {
  return new Promise((resolve, reject) => {
    let factory, request, settled = false;
    const fail = (code, text) => { if (!settled) { settled = true; reject(rewardFailure(code, text)); } };
    try {
      factory = typeof factorySource === 'function' ? factorySource() : factorySource;
      if (!factory) throw Error();
    } catch { fail('DB_UNAVAILABLE', siteText("site.004c8f1e9226af9f")); return; }
    try { request = factory.open(name, 1); }
    catch { fail('DB_OPEN', siteText("site.60ef9834ca6f017a")); return; }
    request.onblocked = () => fail('DB_BLOCKED', siteText("site.fe04533123137c8c"));
    request.onerror = () => fail('DB_OPEN', siteText("site.60ef9834ca6f017a"));
    request.onupgradeneeded = () => {
      if (settled) { request.transaction.abort(); return; }
      try {
        if (!request.result.objectStoreNames.contains(REWARD_STORE)) request.result.createObjectStore(REWARD_STORE, { keyPath: 'accountId' });
      } catch {
        fail('DB_OPEN', siteText("site.4ca457f743f50a79"));
        request.transaction.abort();
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      settled = true;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
// No async work inside operate: queue requests now and in request callbacks only.
// An aborted transaction never resolves, even if an earlier put request succeeded.
export function rewardTransaction(db, mode, operate, { signal, write = false } = {}) {
  return new Promise((resolve, reject) => {
    let transaction, result, failure;
    const aborted = () => { try { transaction.abort(); } catch { /* Already committed: await complete, do not claim rollback. */ } };
    const cleanup = () => signal?.removeEventListener('abort', aborted);
    const databaseError = () => rewardFailure(write ? 'WRITE_FAILED' : 'READ_FAILED', write
      ? siteText("site.1e9ef3073d307000")
      : siteText("site.39597c181dab03ba"));
    if (signal?.aborted) { reject(signal.reason || new DOMException(siteText("site.c32f49a8d7085186"), 'AbortError')); return; }
    try { transaction = db.transaction(REWARD_STORE, mode); }
    catch { reject(databaseError()); return; }
    transaction.oncomplete = () => { cleanup(); resolve(result); };
    transaction.onabort = () => { cleanup(); reject(failure || (signal?.aborted ? signal.reason : null) || databaseError()); };
    transaction.onerror = () => { /* Default request handling aborts the transaction. */ };
    signal?.addEventListener('abort', aborted, { once: true });
    const fail = error => { failure = typeof error?.code === 'string' ? error : databaseError(); aborted(); };
    try { operate(transaction.objectStore(REWARD_STORE), value => { result = value; }, fail); }
    catch (error) { fail(error?.code ? error : databaseError()); }
  });
}
