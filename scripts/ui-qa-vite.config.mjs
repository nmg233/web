import base from '../frontend/vite.config.js';
import { fileURLToPath } from 'node:url';
export default { ...base, root:fileURLToPath(new URL('../frontend',import.meta.url)),
  server:{ ...base.server, host:'127.0.0.1', port:5188, strictPort:true,
    headers:{'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:5188; font-src 'self' data:; object-src 'none'"},
    proxy:{'/api':'http://127.0.0.1:3091','/uploads':'http://127.0.0.1:3091'} } };
