import { Spin } from 'antd';

// 统一页面加载态：替代各页面「数据未就绪直接 return null」造成的白屏
export default function PageLoading({ tip = '加载中...' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
      <Spin size="large" tip={tip} />
    </div>
  );
}
