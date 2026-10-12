import {useEffect,useState} from 'react';
import client from '../../api/client';
import {safeCoverSource} from './identity';
export default function CourseCover({course,...props}){
 const source=safeCoverSource(course.cover_image),privateSource=typeof course.cover_image==='string'&&new RegExp('^/api/courses/'+Number(course.id)+'/cover(?:\\?v=[a-f0-9-]{36})?$').test(course.cover_image);
 const [state,setState]=useState(null);
 useEffect(()=>{if(!privateSource)return;let live=true,url;const controller=new AbortController();client.get(course.cover_image.slice(4),{responseType:'blob',signal:controller.signal,silent:true}).then(blob=>{if(!live)return;url=URL.createObjectURL(blob);setState({source:course.cover_image,url});}).catch(()=>{});return()=>{live=false;controller.abort();if(url)URL.revokeObjectURL(url);};},[course.cover_image,privateSource]);
 const src=privateSource?(state?.source===course.cover_image?state.url:null):source;
 return src?<img {...props} src={src} alt=""/>:null;
}
