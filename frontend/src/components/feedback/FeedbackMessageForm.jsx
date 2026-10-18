import {copyText as siteText} from "../../content/copy";
import {useRef,useState} from 'react';
import {feedbackFileError} from '../../utils/feedbackFiles';
import {Alert, Button, Form, Input } from 'antd';

export default function FeedbackMessageForm({ onSubmit, loading = false, internal = false, draft:draftRef, onDirty=()=>{} }) {
  // Initialize from the parent account/object memory snapshot only when this form mounts.
  // eslint-disable-next-line react-hooks/refs
  const [initialDraft]=useState(()=>draftRef?.current||{}),[form] = Form.useForm(),[files,setFiles]=useState(initialDraft.files||[]),[error,setError]=useState(''),key=useRef(initialDraft.key||crypto.randomUUID());
  const changed=()=>{key.current=crypto.randomUUID();if(draftRef)draftRef.current={content:form.getFieldValue('content'),files,key:key.current};onDirty(true);};
  const pick=e=>{const next=[...files];for(const f of e.target.files){const problem=feedbackFileError(f,next.length);if(problem)setError(problem);else next.push(f);}setFiles(next);changed();if(draftRef)draftRef.current={content:form.getFieldValue('content'),files:next,key:key.current};e.target.value='';};
  return <Form name={internal ? 'feedback-internal' : 'feedback-reply'} form={form} initialValues={{content:initialDraft.content}} layout="vertical" onValuesChange={changed} onFinish={({ content }) => onSubmit(content.trim(), () => {form.setFieldsValue({content:''});setFiles([]);if(draftRef)draftRef.current={};onDirty(false);key.current=crypto.randomUUID();},files,key.current)}>
    <Form.Item name="content" label={internal ? siteText("site.7ba0c5303a6e3f7d") : siteText("site.ead6c57a21373fa8")} rules={[{ required: true, whitespace: true, message: siteText("site.2329901e371ec734") }, { max: 2000, message: siteText("site.c253189f66b0cfd1") }]}>
      <Input.TextArea rows={4} maxLength={2000} showCount placeholder={internal ? siteText("site.d44cb9da456cd582") : siteText("site.a5fcefa830acceca")} />
    </Form.Item>
    {error&&<Alert type="error" title={error}/>}<label>补充附件（最多3个，每个10MB）<input aria-label={internal?'内部备注附件':'公开回复附件'} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf" disabled={loading} onChange={pick}/></label><ul>{files.map((file,i)=><li key={i}>{file.name} <Button disabled={loading} onClick={()=>{changed();setFiles(v=>{const next=v.filter((_,n)=>n!==i);if(draftRef)draftRef.current={content:form.getFieldValue('content'),files:next,key:key.current};return next;});}}>移除</Button></li>)}</ul>
    <Button type={internal ? 'default' : 'primary'} htmlType="submit" loading={loading} aria-label={internal ? siteText("site.9d8e8af79ec4a8c8") : siteText("site.e46fe66c598934f5")}>{internal ? siteText("site.9d8e8af79ec4a8c8") : siteText("site.e46fe66c598934f5")}</Button>
  </Form>;
}
