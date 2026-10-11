import {createContext,useContext} from 'react';
export const ServerRewardsContext=createContext(null);
export const useServerRewards=()=>useContext(ServerRewardsContext);
