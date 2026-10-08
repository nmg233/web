const fs = require('node:fs');
const path = require('node:path');

function maintenanceFile() {
  return path.resolve(process.env.MAINTENANCE_FILE || path.join(path.dirname(
    process.env.DB_PATH || path.join(__dirname, '../database/pbl_platform.db')), 'maintenance.lock'));
}

// GET 学习包也会绑定版本，因此维护窗口阻断所有业务入口，而非仅拦截 POST。
function gate(prefix) {
  return (req, res, next) => {
    if (req.path === `${prefix}/health` || !fs.existsSync(maintenanceFile())) return next();
    res.setHeader('Retry-After', '60');
    return res.status(503).json({ error: '网站正在维护，请稍后重试', code: 'MAINTENANCE' });
  };
}

module.exports = { gate, maintenanceFile };
