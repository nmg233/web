import client from './client';

export const gliderAPI = {
  // 提交滑翔机参数并启动模拟（学生）
  simulate: (params) => client.post('/glider/simulate', params),
  // 我的模拟记录
  list: () => client.get('/glider/simulations'),
  detail: (id) => client.get(`/glider/simulations/${id}`),
  // 结果文件：trajectory3d.png / flight_telemetry.png / flight_telemetry.csv / summary.json
  file: (id, name) => client.get(`/glider/simulations/${id}/files/${name}`, { responseType: 'blob' }),
};
