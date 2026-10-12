import {copyText as siteText} from "../../content/copy";
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Form, Input, Select, Space, Switch, Typography, message } from 'antd';
import { aiAPI } from '../../api';

const { Title, Paragraph, Text } = Typography;

export default function AISettings() {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    aiAPI.getSettings().then((data) => {
      setSettings(data);
      form.setFieldsValue({ ...data, enabled: Boolean(data.enabled), retrieval_enabled: Boolean(data.retrieval_enabled), show_sources: Boolean(data.show_sources) });
    }).catch(() => setError(siteText("site.e382f3f0616795b0")));
  }, [form]);

  const save = async (values) => {
    setSaving(true);
    try {
      const data = await aiAPI.saveSettings({ ...values, api_key: values.api_key || undefined });
      setSettings(data);
      form.setFieldValue('api_key', '');
      message.success(siteText("site.3ab97cd1e790ba33"));
      setError('');
    } catch (err) { setError(err?.response?.data?.error || siteText("site.4823b71f6c97a30d")); }
    finally { setSaving(false); }
  };

  return <div style={{ maxWidth: 850, margin: '0 auto' }}>
    <Space><Title level={4}>{siteText("site.4edbbb7ba169cd36")}</Title><Link to="/dashboard/ai">{siteText("site.64bb02d5393c7769")}</Link></Space>
    <Paragraph type="secondary">{siteText("site.b5a9936172b37d73")}</Paragraph>
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    {settings && !settings.encryption_ready && <Alert type="warning" showIcon message={siteText("site.0a8d737246e31b1f")} style={{ marginBottom: 16 }} />}
    <Card loading={!settings}>
      <Form form={form} layout="vertical" onFinish={save}>
        <Form.Item name="enabled" label={siteText("site.efdd7c121383b2db")} valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="api_key" label={`DeepSeek API Key${settings?.has_api_key ? siteText("site.9efc5d99741803d5") : ''}`}>
          <Input.Password autoComplete="new-password" placeholder={siteText("site.45e0ac9b90d75fe2")} />
        </Form.Item>
        <Form.Item name="model" label={siteText("site.fc6dd3969d0ad576")} rules={[{ required: true, message: siteText("site.4101b0e8e1f65bd4") }]}><Input placeholder="deepseek-flash" /></Form.Item>
        <Form.Item name="base_url" label="API Base URL" rules={[{ required: true, message: siteText("site.93f6076051507382") }]}>
          <Input placeholder="https://api.deepseek.com" />
        </Form.Item>
        <Text type="secondary">{siteText("site.6f1d965f65789fba")}</Text>
        <Form.Item name="system_prompt" label={siteText("site.d93c8619aaed5372")} rules={[{ required: true, min: 20, message: siteText("site.eaaaff4aa51988b6") }]} style={{ marginTop: 16 }}>
          <Input.TextArea rows={13} maxLength={10000} showCount />
        </Form.Item>
        <Space wrap size="large">
          <Form.Item name="retrieval_enabled" label={siteText("site.34165942b2387dbf")} valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="show_sources" label={siteText("site.dfc36925abbb7d13")} valuePropName="checked"><Switch /></Form.Item>
        </Space>
        <Form.Item name="expansion_level" label={siteText("site.ed389f18fad4f739")}>
          <Select options={[{ value: 'strict', label: siteText("site.64b80e6fd7c65dec") }, { value: 'balanced', label: siteText("site.6d42c8a6f1a690bb") }, { value: 'open', label: siteText("site.7f7fcbc281bec959") }]} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving}>{siteText("site.806a7bb44a673930")}</Button>
      </Form>
    </Card>
  </div>;
}
