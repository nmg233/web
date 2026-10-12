import {Form,Input} from 'antd';
import {copyText} from '../content/copy';
import {openReflectionFields} from './reflectionModel';
export default function OpenReflectionForm({prefix=[]}){
 return <div className="open-reflection-form"><p className="study-help">{copyText('next2.reflection.scope')}</p><Form.Item name={[...prefix,'reflection_version']} initialValue={2} hidden><Input/></Form.Item>{openReflectionFields.map(([key,label],i)=><Form.Item key={key} name={[...prefix,key]} label={copyText(label)} dependencies={i===0?openReflectionFields.slice(1).map(([k])=>[...prefix,k]):undefined} rules={[{max:2000,message:copyText('next2.reflection.max')},...(i===0?[({getFieldValue})=>({validator:()=>openReflectionFields.some(([k])=>getFieldValue([...prefix,k])?.trim())?Promise.resolve():Promise.reject(new Error(copyText('next2.reflection.required')))})]:[])]}><Input.TextArea rows={5} maxLength={2000} showCount placeholder={copyText('next2.reflection.hint.'+key)}/></Form.Item>)}</div>;
}
