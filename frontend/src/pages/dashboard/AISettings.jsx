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
    }).catch(() => setError('无法读取 AI 配置。'));
  }, [form]);

  const save = async (values) => {
    setSaving(true);
    try {
      const data = await aiAPI.saveSettings({ ...values, api_key: values.api_key || undefined });
      setSettings(data);
      form.setFieldValue('api_key', '');
      message.success('AI 配置已保存');
      setError('');
    } catch (err) { setError(err?.response?.data?.error || '保存失败'); }
    finally { setSaving(false); }
  };

  return <div style={{ maxWidth: 850, margin: '0 auto' }}>
    <Space><Title level={4}>灵境小智 · 管理员配置</Title><Link to="/dashboard/ai">返回助手</Link></Space>
    <Paragraph type="secondary">API Key 只发送到后端，保存后不会再次显示。启用前须由服务器管理员设置 AI_CONFIG_SECRET。</Paragraph>
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    {settings && !settings.encryption_ready && <Alert type="warning" showIcon message="服务器尚未设置 AI_CONFIG_SECRET，暂不能保存 API Key 或启用助手。" style={{ marginBottom: 16 }} />}
    <Card loading={!settings}>
      <Form form={form} layout="vertical" onFinish={save}>
        <Form.Item name="enabled" label="启用 AI 助手" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="api_key" label={`DeepSeek API Key${settings?.has_api_key ? '（已配置；留空表示不更换）' : ''}`}>
          <Input.Password autoComplete="new-password" placeholder="粘贴 API Key" />
        </Form.Item>
        <Form.Item name="model" label="模型名称" rules={[{ required: true, message: '请输入模型名称' }]}><Input placeholder="deepseek-flash" /></Form.Item>
        <Form.Item name="base_url" label="API Base URL" rules={[{ required: true, message: '请输入 Base URL' }]}>
          <Input placeholder="https://api.deepseek.com" />
        </Form.Item>
        <Text type="secondary">Base URL 需在服务器 AI_ALLOWED_BASE_URLS 白名单内；默认仅允许 DeepSeek 官方地址。</Text>
        <Form.Item name="system_prompt" label="系统 Prompt" rules={[{ required: true, min: 20, message: '至少 20 字' }]} style={{ marginTop: 16 }}>
          <Input.TextArea rows={13} maxLength={10000} showCount />
        </Form.Item>
        <Space wrap size="large">
          <Form.Item name="retrieval_enabled" label="检索上传的课程资料" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="show_sources" label="显示参考资料" valuePropName="checked"><Switch /></Form.Item>
        </Space>
        <Form.Item name="expansion_level" label="专业拓展程度">
          <Select options={[{ value: 'strict', label: '严格' }, { value: 'balanced', label: '平衡' }, { value: 'open', label: '开放' }]} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving}>保存配置</Button>
      </Form>
    </Card>
  </div>;
}
