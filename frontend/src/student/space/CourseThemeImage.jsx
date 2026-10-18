import {useEffect,useState} from 'react';
import client from '../../api/client';
export default function CourseThemeImage({image,...props}){
 const [state,setState]=useState(null);
 useEffect(()=>{let live=true,url;if(!image?.url)return;client.get(image.url.slice(4),{responseType:'blob',silent:true}).then(blob=>{if(live){url=URL.createObjectURL(blob);setState({source:image.url,url});}}).catch(()=>{});return()=>{live=false;if(url)URL.revokeObjectURL(url);};},[image?.url]);
 return state?.source===image?.url&&state?.url?<img {...props} src={state.url} alt={props.alt||''} onError={e=>{e.currentTarget.hidden=true;}}/>:null;
}
