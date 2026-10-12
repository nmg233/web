import { useState } from 'react';
import { createRewardAdapter } from './rewardAdapter';
import { createRewardStore } from './rewardStore';
import { RewardsContext } from './useRewards';
import ServerRewards from './ServerRewards';

export default function RewardProvider({ accountId, children }) {
  const [store] = useState(() => createRewardStore({ accountId,
    adapter: createRewardAdapter(() => window.localStorage, accountId), target: window }));
  return <RewardsContext.Provider value={store}><ServerRewards accountId={accountId}>{children}</ServerRewards></RewardsContext.Provider>;
}
