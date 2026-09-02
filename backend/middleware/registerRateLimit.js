// ============================================
// 注册接口防护
// - IP 级限流：同 IP 每分钟最多 N 次注册尝试（默认 5，REGISTER_RATE_LIMIT）
// 目的：缓解公开注册被批量滥用与用户名枚举探测。
// 注意：进程内 Map 实现，仅单实例有效；多实例部署需替换为 Redis 等共享存储。
// ============================================

const MAX_ATTEMPTS = parseInt(process.env.REGISTER_RATE_LIMIT, 10) || 5;
const WINDOW_MS = 60 * 1000;

// ip -> number[]（最近尝试时间戳，滑动窗口）
const ipAttempts = new Map();

function pruneWindow(list) {
  const now = Date.now();
  return list.filter((t) => now - t < WINDOW_MS);
}

/**
 * 包装注册处理器：请求前按 IP 做滑动窗口限流。
 */
function registerRateLimit(handler) {
  return (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const list = pruneWindow(ipAttempts.get(ip) || []);
    if (list.length >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: '操作过于频繁，请稍后再试' });
    }
    list.push(Date.now());
    ipAttempts.set(ip, list);
    return handler(req, res);
  };
}

module.exports = { registerRateLimit };
