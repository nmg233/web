import { Tag } from 'antd';

// 统一状态标签：按语义色映射，避免各页面重复内联颜色逻辑
const PRESETS = {
  success: 'green',
  warning: 'orange',
  error: 'red',
  info: 'blue',
  default: 'default',
};

export default function StatusTag({ value, label, type = 'default' }) {
  return <Tag color={PRESETS[type] || PRESETS.default}>{label || value || '—'}</Tag>;
}
