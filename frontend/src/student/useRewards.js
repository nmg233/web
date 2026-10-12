import { createContext, useContext, useSyncExternalStore } from 'react';

export const RewardsContext = createContext(null);
export function useRewards() {
  const store = useContext(RewardsContext);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ...snapshot, store };
}
