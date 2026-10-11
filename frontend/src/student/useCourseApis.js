import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { createAPIs } from '../api';
import { createGliderAPI } from '../api/glider';
import { useAuth } from '../store/AuthContext';
import { courseIdFromPath, coursePath } from './spaceRoutes';
export function useCourseId(){const {pathname}=useLocation();const {user}=useAuth();return user?.role==='student'?courseIdFromPath(pathname):null;}
export function useCourseApis(){
 const id=useCourseId();
 return useMemo(()=>{
  const scoped={};
  for(const method of ['get','post','put','patch','delete'])scoped[method]=(url,...args)=>client[method](id?'/course-spaces/'+id+url:url,...args);
  return {...createAPIs(scoped),gliderAPI:createGliderAPI(scoped)};
 },[id]);
}
export function useCourseNavigate(){const navigate=useNavigate(),id=useCourseId();return useMemo(()=>(to,options)=>navigate(typeof to==='string'?coursePath(id,to):to,options),[id,navigate]);}
