import client from './client';

export const gliderAPI = {
  // 提交滑翔机参数并启动模拟（学生）
  simulate: (params) => client.post('/glider/simulate', params),
  // 我的模拟记录
  list: () => client.get('/glider/simulations'),
  detail: (id) => client.get(`/glider/simulations/${id}`),
  // 结果文件：trajectory3d.png / flight_telemetry.png / flight_telemetry.csv / summary.json
  file: (id, name) => client.get(`/glider/simulations/${id}/files/${name}`, { responseType: 'blob' }),
  // 短期签名流式播放地址（视频直挂 <video>，支持 Range 拖动）
  streamUrl: (id, name = 'flight_replay.mp4') => client.get(`/glider/simulations/${id}/stream-url?name=${name}`),
  // 引擎能力探测（提交前检查）
  capabilities: () => client.get('/glider/capabilities'),
};
