const db = require('../config/database');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { UPLOAD_ROOT } = require('../middleware/upload');

// ------------------------------------------------------------------
// 模拟引擎配置 —— 同一份代码可在“本地 Windows / 服务器 Linux”两种环境运行真正的 novaPhy
// novaPhy wheel 仅支持 Linux x86_64 + CPython 3.11，因此解释器按环境配置：
//   · 服务器(Linux)：原生调用，直接指向装好 novaPhy 的解释器
//       GLIDER_PYTHON=/opt/novaphy/bin/python
//   · 本地(Windows + WSL)：用 wsl: 前缀，经 wsl.exe 调用 WSL 内的 Linux 版解释器
//       GLIDER_PYTHON=wsl:Ubuntu-24.04:/opt/novaphy/bin/python
//     （/mnt/d 与 D:\ 是同一物理盘：Node 用 Windows 路径读写结果，Python 用 /mnt/d 路径写结果，天然互通）
//   · 无 WSL 的 Windows 兜底：GLIDER_PYTHON=python + GLIDER_BACKEND=reference（纯 numpy，行为等价）
// GLIDER_BACKEND  auto | novaphy | reference（默认 auto：可加载 novaPhy 则优先 novaPhy）
// GLIDER_MAX_ACTIVE  并发上限（默认 2）
// ------------------------------------------------------------------
function parsePython() {
  const raw = (process.env.GLIDER_PYTHON || '').trim();
  if (raw.startsWith('wsl:')) {
    const rest = raw.slice(4); // 形如 distro:pythonPath
    const idx = rest.indexOf(':');
    return {
      mode: 'wsl',
      distro: idx === -1 ? rest : rest.slice(0, idx),
      python: idx === -1 ? '/opt/novaphy/bin/python' : rest.slice(idx + 1),
    };
  }
  return {
    mode: 'native',
    python: raw || (process.platform === 'win32' ? 'python' : 'python3'),
  };
}

const PY = parsePython();
const GLIDER_BACKEND = process.env.GLIDER_BACKEND || 'auto';
const GLIDER_DIR = path.resolve(__dirname, '..', '..', 'test_Novaphy', 'glider_sim');
const GLIDER_MAX_ACTIVE = Math.max(1, parseInt(process.env.GLIDER_MAX_ACTIVE || '2', 10) || 2);
const GLIDER_ALT = 150;            // 投放高度固定 (m)，避免变量过多
// 单次最长仿真时间(s)：读环境变量 GLIDER_TIMEOUT 可调，默认 100。
// 150m 投放、L/D≈15 的典型稳定滑翔约需 65~75s 才能落地；若设 60s 会被截断、看不到“平稳降落(landed)”。
const GLIDER_TIMEOUT = Math.min(300, Math.max(20, Number.parseFloat(process.env.GLIDER_TIMEOUT) || 100));
// MP4 飞行回放：默认生成（固定机位、覆盖全程）；GLIDER_VIDEO=0 关闭；帧率 / 时长上限可配
const GLIDER_VIDEO = String(process.env.GLIDER_VIDEO || '1') !== '0';
const GLIDER_VIDEO_FPS = Math.min(30, Math.max(4, parseInt(process.env.GLIDER_VIDEO_FPS || '10', 10) || 10));
const GLIDER_VIDEO_MAX = Math.min(600, Math.max(5, Number.parseFloat(process.env.GLIDER_VIDEO_MAX) || 300));

// 把 Windows 绝对路径转成 WSL 的 /mnt/<盘符>/... 路径（供 wsl 调用 novaPhy 引擎）
function toWslPath(p) {
  const abs = path.resolve(p);
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(abs);
  if (!m) return abs.replace(/\\/g, '/');
  return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`;
}

const STATE_LABEL = {
  ok: '正常滑翔',
  landed: '成功着陆',
  'crashed(roll)': '横滚失控坠毁',
  'stalled/slow': '失速下坠',
  timedout: '超时结束',
};

const ALLOWED_FILES = new Set(['trajectory3d.png', 'flight_telemetry.png', 'flight_telemetry.csv', 'summary.json', 'flight_replay.mp4']);

function clampNum(v, lo, hi, def) {
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}

function toDto(row) {
  if (!row) return null;
  let result = null;
  if (row.summary_json) {
    try { result = JSON.parse(row.summary_json); } catch { result = null; }
  }
  return {
    id: row.id,
    student_id: row.student_id,
    student_name: row.student_name || null,
    dihedral_deg: row.dihedral_deg,
    cg_x: row.cg_x,
    speed: row.speed,
    alt: row.alt,
    status: row.status,                 // running / success / error
    state: row.state,                   // ok / landed / crashed(roll) / stalled/slow / timedout
    state_label: (row.state && STATE_LABEL[row.state]) || row.state || null,
    glide_time_s: row.glide_time,
    result,                             // sim_service 的摘要（距离/下沉率/L-D 等）
    error: row.error,
    created_at: row.created_at,
  };
}

function canRead(row, user) {
  if (!row) return false;
  return row.student_id === user.id || user.role === 'admin';
}

// 学生提交三参数，启动一次模拟（异步）
exports.simulate = (req, res) => {
  try {
    const active = db.prepare("SELECT COUNT(*) AS c FROM glider_simulations WHERE status = 'running'").get().c;
    if (active >= GLIDER_MAX_ACTIVE) {
      return res.status(429).json({ error: `当前有 ${active} 个模拟任务正在运行，请稍后再试` });
    }

    const dihedral_deg = clampNum(req.body.dihedral_deg, -30, 30, 5);
    const cg_x = clampNum(req.body.cg_x, -2, 2, 0);
    const speed = clampNum(req.body.speed, 15, 60, 36);

    const info = db.prepare(
      `INSERT INTO glider_simulations (student_id, dihedral_deg, cg_x, speed, alt, status)
       VALUES (?, ?, ?, ?, ?, 'running')`
    ).run(req.user.id, dihedral_deg, cg_x, speed, GLIDER_ALT);
    const id = info.lastInsertRowid;

    const simDir = path.join(UPLOAD_ROOT, 'glider', String(id));
    fs.mkdirSync(simDir, { recursive: true });

    // 不传 --autolevel：默认关闭横滚/偏航自动保持，让学生看到上反角与重心对被动稳定的真实影响
    const flags = [
      '--dihedral', String(dihedral_deg),
      '--cg', String(cg_x),
      '--speed', String(speed),
      '--alt', String(GLIDER_ALT),
      '--timeout', String(GLIDER_TIMEOUT),
      '--backend', GLIDER_BACKEND,
    ];
    if (GLIDER_VIDEO) {
      flags.push('--video', '--video-fps', String(GLIDER_VIDEO_FPS),
                 '--video-max', String(GLIDER_VIDEO_MAX));
    }

    const markError = (msg) => {
      db.prepare(
        "UPDATE glider_simulations SET status='error', error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).run(String(msg).slice(0, 1000), id);
    };

    let stderr = '';
    let child;
    if (PY.mode === 'wsl') {
      // 本地 Windows：经 wsl.exe 调用 WSL 内 Linux 版 novaPhy 解释器（/mnt/d 与 D: 同盘）
      child = spawn('wsl.exe',
        ['-d', PY.distro, '--', PY.python,
         toWslPath(path.join(GLIDER_DIR, 'sim_service.py')),
         ...flags, '--outdir', toWslPath(simDir)],
        { windowsHide: true });
    } else {
      // 服务器 Linux / 原生：直接运行解释器（sim_service.py 与 aero/sim_core 同目录）
      child = spawn(PY.python, ['sim_service.py', ...flags, '--outdir', simDir],
        { cwd: GLIDER_DIR, windowsHide: true });
    }
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.on('error', (err) => markError('无法启动模拟引擎：' + err.message));
    child.on('close', (code) => {
      if (code !== 0) {
        markError(`模拟进程异常退出(code=${code})：${(stderr || '无输出').slice(-500)}`);
        return;
      }
      try {
        const summaryFile = path.join(simDir, 'summary.json');
        if (!fs.existsSync(summaryFile)) throw new Error('未生成 summary.json');
        const result = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
        db.prepare(
          `UPDATE glider_simulations
             SET status='success', state=?, glide_time=?, summary_json=?, updated_at=CURRENT_TIMESTAMP
           WHERE id=?`
        ).run(result.reason || 'ok', result.glide_time_s ?? null, JSON.stringify(result), id);
      } catch (err) {
        markError('解析模拟结果失败：' + err.message);
      }
    });

    return res.json({ id, status: 'running', message: '模拟已开始，请稍候查看结果' });
  } catch (err) {
    console.error('启动滑翔机模拟错误:', err);
    return res.status(500).json({ error: '启动模拟失败，请稍后重试' });
  }
};

// 我的模拟历史（学生本人 / 管理员可见全部）
exports.list = (req, res) => {
  try {
    const rows = (req.user.role === 'admin')
      ? db.prepare(
          `SELECT g.*, u.real_name AS student_name FROM glider_simulations g
           LEFT JOIN users u ON u.id = g.student_id ORDER BY g.id DESC LIMIT 200`
        ).all()
      : db.prepare(
          `SELECT g.*, u.real_name AS student_name FROM glider_simulations g
           LEFT JOIN users u ON u.id = g.student_id WHERE g.student_id = ? ORDER BY g.id DESC LIMIT 100`
        ).all(req.user.id);
    return res.json({ items: rows.map(toDto) });
  } catch (err) {
    console.error('滑翔机模拟列表错误:', err);
    return res.status(500).json({ error: '加载失败，请稍后重试' });
  }
};

// 单条详情（仅本人 / 管理员）
exports.detail = (req, res) => {
  try {
    const row = db.prepare(
      `SELECT g.*, u.real_name AS student_name FROM glider_simulations g
       LEFT JOIN users u ON u.id = g.student_id WHERE g.id = ?`
    ).get(req.params.id);
    if (!canRead(row, req.user)) return res.status(404).json({ error: '模拟记录不存在' });
    return res.json(toDto(row));
  } catch (err) {
    console.error('滑翔机模拟详情错误:', err);
    return res.status(500).json({ error: '加载失败，请稍后重试' });
  }
};

// 结果文件（3D 航迹 / 遥测 PNG / CSV / 摘要）——仅本人 / 管理员可下载
exports.file = (req, res) => {
  try {
    const { id, name } = req.params;
    if (!ALLOWED_FILES.has(name)) return res.status(400).json({ error: '不支持的文件' });
    const row = db.prepare('SELECT * FROM glider_simulations WHERE id = ?').get(id);
    if (!canRead(row, req.user)) return res.status(404).json({ error: '模拟记录不存在' });

    const simDir = path.join(UPLOAD_ROOT, 'glider', String(id));
    const filePath = path.resolve(simDir, name);
    const rel = path.relative(simDir, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: '结果文件不存在' });
    }
    return res.sendFile(filePath);
  } catch (err) {
    console.error('滑翔机模拟文件下载错误:', err);
    return res.status(500).json({ error: '下载失败' });
  }
};
