require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
// 生产环境部署在 nginx 反向代理之后，信任第一层代理以获取真实客户端 IP
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const API_PREFIX = process.env.API_PREFIX || '/api';

// ============================================
// JWT 密钥
// 优先读环境变量 JWT_SECRET；否则读取/生成持久化的 .jwt-secret 文件。
// 避免每次服务重启都随机生成密钥，导致已登录用户的 token 全部失效。
// AUTH-10：生产环境若未设置 JWT_SECRET，直接硬失败终止进程（多实例/只读系统不允许写文件）。
// ============================================
function getOrCreateJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  if (process.env.NODE_ENV === 'production') {
    console.error('❌ [FATAL] 生产环境必须显式设置 JWT_SECRET 环境变量，禁止自动生成/写文件。请设置后重启。');
    process.exit(1);
  }

  // 仅开发/测试环境允许读取或自动生成 .jwt-secret 文件
  const secretFile = path.join(__dirname, '.jwt-secret');
  try {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing) return existing;
  } catch (e) { /* 文件不存在则创建 */ }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  console.log('🔑 已生成并持久化 JWT 密钥到 .jwt-secret');
  return secret;
}
const JWT_SECRET = getOrCreateJwtSecret();
app.set('jwt_secret', JWT_SECRET);

// ============================================
// 中间件配置
// ============================================
app.disable('x-powered-by');
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  // AUTH-09 补偿措施：全局响应头增加 CSP，缓解 XSS 对 localStorage 中 Token 的影响
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'");
  next();
});
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 响应日志：打印所有 4xx/5xx 响应的状态码和响应体，便于排查 400 等前端报错
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400) {
      console.warn(`[API ${req.method} ${req.originalUrl}] → ${res.statusCode}:`, JSON.stringify(body));
    }
    return originalJson(body);
  };
  next();
});

// ============================================
// API 路由
// ============================================
app.use(`${API_PREFIX}/auth`, require('./routes/auth'));
app.use(`${API_PREFIX}/dashboard`, require('./routes/dashboard'));
app.use(`${API_PREFIX}/courses`, require('./routes/courses'));
app.use(`${API_PREFIX}/tasks`, require('./routes/tasks'));
app.use(`${API_PREFIX}/students`, require('./routes/students'));
app.use(`${API_PREFIX}/works`, require('./routes/works'));
app.use(`${API_PREFIX}/archives`, require('./routes/archives'));
app.use(`${API_PREFIX}/feedback`, require('./routes/feedback'));
app.use(`${API_PREFIX}/notifications`, require('./routes/notifications'));

// 健康检查
app.get(`${API_PREFIX}/health`, (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: '请求的资源不存在' });
});

// 全局错误处理
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('服务器错误:', err);
  res.status(status).json({
    error: status === 404 ? '文件不存在' : '服务器内部错误',
    message: status === 404 ? undefined : (process.env.NODE_ENV === 'development' ? err.message : '请稍后重试'),
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 PBL API 服务器启动: http://localhost:${PORT}${API_PREFIX}`);
    console.log(`📝 前端开发地址: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
  });
}

module.exports = app;
