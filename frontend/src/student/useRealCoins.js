import {createContext,useContext} from 'react';
export const RealCoinsContext=createContext(null);
export const COIN_LEARNING_CHANGED='student-coin-learning-changed';
export const useRealCoins=()=>useContext(RealCoinsContext);
