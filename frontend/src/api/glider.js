import defaultClient from './client';
export function createGliderAPI(client) {

// 此页就近呈现错误和重试，避免轮询/文件错误重复弹出全局提示；鉴权仍走 client。
return {
  // 提交滑翔机参数并启动模拟（学生）
  simulate: (params) => client.post('/glider/simulate', params, { silent: true }),
  // 我的模拟记录
  list: () => client.get('/glider/simulations', { silent: true }),
  detail: (id) => client.get(`/glider/simulations/${id}`, { silent: true }),
  // 结果文件：trajectory3d.png / flight_telemetry.png / flight_telemetry.csv / summary.json
  file: (id, name) => client.get(`/glider/simulations/${id}/files/${name}`, { responseType: 'blob', silent: true }),
  // 短期签名流式播放地址（历史 MP4 记录直挂 <video>，支持 Range 拖动）
  streamUrl: (id, name = 'flight_replay.mp4') => client.get(`/glider/simulations/${id}/stream-url?name=${name}`, { silent: true }),
  // 逐帧轨迹数据（最小向量接口）：'bin' = ftrc 二进制（ArrayBuffer，推荐）、'json' = JSON
  // 格式与解析示例见 simulation/glider/RENDER_API.md
  trace: (id, format = 'json') => client.get(
    `/glider/simulations/${id}/trace${format === 'bin' ? '?format=bin' : ''}`,
    format === 'bin' ? { responseType: 'arraybuffer' } : undefined,
  ),
  // 引擎能力探测（提交前检查）
  capabilities: () => client.get('/glider/capabilities', { silent: true }),
};

}
export const gliderAPI = createGliderAPI(defaultClient);
