// 业务时区统一为 Asia/Shanghai。
// 存储仍为 UTC（CURRENT_TIMESTAMP），仅「日期边界」类计算使用北京时间。
function todayInBeijing() {
  // en-CA 输出 YYYY-MM-DD
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

module.exports = { todayInBeijing };
