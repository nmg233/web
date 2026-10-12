import {copyText as siteText} from "../../content/copy";
import { Button, Form, Input } from 'antd';

export default function FeedbackMessageForm({ onSubmit, loading = false, internal = false }) {
  const [form] = Form.useForm();
  return <Form name={internal ? 'feedback-internal' : 'feedback-reply'} form={form} layout="vertical" onFinish={({ content }) => onSubmit(content.trim(), () => form.resetFields())}>
    <Form.Item name="content" label={internal ? siteText("site.7ba0c5303a6e3f7d") : siteText("site.ead6c57a21373fa8")} rules={[{ required: true, whitespace: true, message: siteText("site.2329901e371ec734") }, { max: 2000, message: siteText("site.c253189f66b0cfd1") }]}>
      <Input.TextArea rows={4} maxLength={2000} showCount placeholder={internal ? siteText("site.d44cb9da456cd582") : siteText("site.a5fcefa830acceca")} />
    </Form.Item>
    <Button type={internal ? 'default' : 'primary'} htmlType="submit" loading={loading} aria-label={internal ? siteText("site.9d8e8af79ec4a8c8") : siteText("site.e46fe66c598934f5")}>{internal ? siteText("site.9d8e8af79ec4a8c8") : siteText("site.e46fe66c598934f5")}</Button>
  </Form>;
}
