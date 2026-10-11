import { createContext, useContext } from 'react';
export const CourseExperienceContext = createContext(null);
export const useCourseExperience = () => useContext(CourseExperienceContext);
