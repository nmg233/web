// ============================================
// 登录接口防护（AUTH-07）
// - IP 级限流：同 IP 每分钟最多 N 次登录尝试（默认 10，LOGIN_RATE_LIMIT_IP）
// - 用户名级限流：同用户名每分钟最多 M 次失败尝试（默认 5，LOGIN_RATE_LIMIT_USER）
// - 账户锁定：连续失败 K 次后锁定账号 L 分钟（默认 10 次 / 15 分钟，
//     ACCOUNT_LOCK_THRESHOLD / ACCOUNT_LOCK_DURATION）
// 所有配置通过环境变量管理（见 .env.example）。
// 注意：进程内 Map 实现，仅单实例有效；多实例部署需替换为 Redis 等共享存储。
// ============================================

const IP_MAX_ATTEMPTS = parseInt(process.env.LOGIN_RATE_LIMIT_IP, 10) || 10;
const USER_MAX_FAILURES = parseInt(process.env.LOGIN_RATE_LIMIT_USER, 10) || 5;
const LOCK_THRESHOLD = parseInt(process.env.ACCOUNT_LOCK_THRESHOLD, 10) || 10;
const LOCK_DURATION_MIN = parseInt(process.env.ACCOUNT_LOCK_DURATION, 10) || 15;
const WINDOW_MS = 60 * 1000;

// ip -> number[]（最近尝试时间戳，滑动窗口）
const ipAttempts = new Map();
// username -> number[]（最近失败时间戳，滑动窗口）
const userFailures = new Map();
// username -> 连续失败次数
const userConsecutiveFails = new Map();
// username -> { lockedUntil }（锁定截止时间戳）
const userLocks = new Map();

function now() {
  return Date.now();
}

function pruneWindow(list) {
  return list.filter((t) => now() - t < WINDOW_MS);
}

/**
 * 包装登录处理器：在请求前做 IP / 用户名 / 账户锁定校验，
 * 并拦截 res.json 统计登录失败/成功结果。
 */
function loginRateLimit(handler) {
  return (req, res) => {
    // 1. IP 级限流（滑动窗口）
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const ipList = pruneWindow(ipAttempts.get(ip) || []);
    if (ipList.length >= IP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: '登录尝试过于频繁，请 1 分钟后再试' });
    }

    // 2. 账户锁定检查（连续失败达到阈值）
    const username = String(req.body.real_name || '').trim();
    const lockKey = `lock:${username}`;
    const lockInfo = userLocks.get(lockKey);
    if (lockInfo && lockInfo.lockedUntil > now()) {
      const minutes = Math.ceil((lockInfo.lockedUntil - now()) / 60000);
      return res.status(429).json({ error: `该账号已锁定，请 ${minutes} 分钟后再试` });
    }

    // 3. 用户名级失败限流（滑动窗口）
    const failKey = `fail:${username}`;
    const failList = pruneWindow(userFailures.get(failKey) || []);
    if (failList.length >= USER_MAX_FAILURES) {
      return res.status(429).json({ error: '登录失败次数过多，请 1 分钟后再试' });
    }

    // 记录本次 IP 尝试（无论成败）
    ipList.push(now());
    ipAttempts.set(ip, ipList);

    // 4. 拦截 res.json 统计结果
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 401) {
        // 登录失败：记录失败时间 + 连续失败计数
        const newFailList = [...failList, now()];
        userFailures.set(failKey, newFailList);
        const consecutive = (userConsecutiveFails.get(lockKey) || 0) + 1;
        if (consecutive >= LOCK_THRESHOLD) {
          userLocks.set(lockKey, { lockedUntil: now() + LOCK_DURATION_MIN * 60000 });
          userConsecutiveFails.delete(lockKey);
          userFailures.delete(failKey);
          return originalJson({
            error: `连续登录失败次数过多，该账号已锁定 ${LOCK_DURATION_MIN} 分钟`
          });
        }
        userConsecutiveFails.set(lockKey, consecutive);
      } else if (res.statusCode < 400) {
        // 登录成功：清空该用户名所有失败记录与锁定状态
        userFailures.delete(failKey);
        userConsecutiveFails.delete(lockKey);
        userLocks.delete(lockKey);
      }
      return originalJson(body);
    };

    return handler(req, res);
  };
}

module.exports = { loginRateLimit };
