const router = require('express').Router();
const { requireAuth, requirePasswordChanged, requireRole } = require('../middleware/auth');
const { dailyFortune } = require('../services/dailyFortune');
const db = require('../config/database');
const presets = ['pilot','glider','ginkgo','robot','telescope','rocket','book','observatory'];
router.get('/avatar', requireAuth, requirePasswordChanged, (req,res) => {
  if(Object.keys(req.query).length) return res.status(400).json({error:'头像由当前账号读取'});
  res.setHeader('Cache-Control','no-store');
  const user=db.prepare('SELECT avatar_preset,avatar_url FROM users WHERE id=?').get(req.user.id);
  res.json({presetId:user.avatar_preset,legacyUrl:user.avatar_url});
});
router.put('/avatar', requireAuth, requirePasswordChanged, (req,res) => {
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.query).length||Object.keys(req.body).some(k=>k!=='presetId')||!presets.includes(req.body.presetId)) return res.status(400).json({error:'请选择允许的账号头像'});
  db.prepare('UPDATE users SET avatar_preset=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(req.body.presetId,req.user.id);
  res.json({saved:true,presetId:req.body.presetId});
});
router.get('/daily-fortune', requireAuth, requirePasswordChanged, requireRole('student'), (req, res) => {
  if (Object.keys(req.query).length) return res.status(400).json({error:'运势由当前账号和服务器日期决定',code:'FORTUNE_QUERY_NOT_ALLOWED'});
  res.setHeader('Cache-Control', 'no-store');
  res.json(dailyFortune(req.user.id));
});
module.exports = router;
