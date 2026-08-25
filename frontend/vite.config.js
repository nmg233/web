import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ============================================
// Content-Security-Policy（SPA 侧有效 CSP）
// - 开发环境：由 Vite dev server 响应头下发（需放行 HMR WebSocket 与
//   @vitejs/plugin-react 注入的内联预置脚本，故 script-src 含 'unsafe-inline'）。
// - 生产构建：构建产物无内联脚本，注入严格 CSP meta（script-src 'self'）。
//   备注：Ant Design 使用 cssinjs 在运行时注入 <style>，故 style-src 需 'unsafe-inline'；
//   API 与上传文件均走同源 /api、/uploads（开发环境由 Vite 代理），CSP 无需放行第三方地址。
//   frame-ancestors 仅响应头生效（meta 中被忽略），故仅在开发响应头保留；
//   生产部署时应在静态服务器（如 nginx）响应头中补充 frame-ancestors 以防御点击劫持。
// ============================================

const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws://localhost:5173 ws://127.0.0.1:5173",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ')

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // 仅在构建产物中注入生产 CSP（meta）；开发环境由 server.headers 提供 CSP 响应头
    {
      name: 'inject-prod-csp',
      transformIndexHtml(html, ctx) {
        if (ctx.server) return html // 开发环境跳过（响应头已处理）
        const meta = `<meta http-equiv="Content-Security-Policy" content="${PROD_CSP}" />`
        return html.replace('</head>', `${meta}\n  </head>`)
      },
    },
  ],
  server: {
    headers: {
      'Content-Security-Policy': DEV_CSP,
    },
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
})
