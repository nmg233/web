import {useSyncExternalStore} from 'react';
import {subscribeCopy,copySnapshot} from './runtimeCopy.js';
export function useCopyVersion(){return useSyncExternalStore(subscribeCopy,copySnapshot,copySnapshot);}
