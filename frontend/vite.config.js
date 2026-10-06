import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// three 的实际安装位置（renderer_3.js 位于 frontend 之外，裸导入需经 alias 解析）
const THREE_DIR = fileURLToPath(new URL('./node_modules/three', import.meta.url))

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
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: http://localhost:3000",
  "media-src 'self' data: blob: http://localhost:3000",
  "font-src 'self' data:",
  "connect-src 'self' http://localhost:3000 ws://localhost:5173 ws://127.0.0.1:5173",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ')

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
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
  resolve: {
    // simulation/glider/web_renderer/renderer_3.js 从 frontend 外导入：
    // 裸导入（three / three/addons/…）无法从 importer 位置向上找到 node_modules，需固定解析
    alias: [
      { find: /^three\/addons\//, replacement: `${THREE_DIR.replaceAll('\\', '/')}/examples/jsm/` },
      { find: /^three$/, replacement: THREE_DIR },
    ],
  },
  server: {
    // 允许 dev server 提供项目根（web/）内的模块：frontend 从 simulation/glider/
    // 直接导入 renderer_3.js（避免双份维护拷贝）
    fs: { allow: ['..'] },
    headers: {
      'Content-Security-Policy': DEV_CSP,
    },
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
})
