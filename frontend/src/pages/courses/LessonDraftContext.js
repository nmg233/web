import {createContext,useContext} from 'react';
export const LessonDraftContext=createContext(null);
export const useLessonDraft=()=>useContext(LessonDraftContext);
