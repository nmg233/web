const router = require('express').Router({ mergeParams: true });
const db = require('../config/database');
const avatars = new Set(['navigator', 'pathfinder', 'maker', 'decoder', 'collaborator', 'guardian']);
router.use((req,res,next)=>db.prepare('SELECT presentation_theme FROM courses WHERE id=?').get(req.courseSpace)?.presentation_theme==='voyage'?next():res.status(403).json({error:'当前课程没有六角色头像展示'}));
// 外层已确认登录、student、改密、本人 active 报名及 published 课程。
router.get('/avatar', (req, res) => {
  const row = db.prepare('SELECT avatar_id, updated_at FROM course_avatar_preferences WHERE student_id=? AND course_id=?').get(req.user.id, req.courseSpace);
  res.json({ avatarId: row?.avatar_id ?? null, updatedAt: row?.updated_at ?? null });
});
router.put('/avatar', (req, res) => {
  const body = req.body;
  if (!body || Object.keys(body).length !== 1 || !avatars.has(body.avatarId)) return res.status(400).json({ error: '请选择有效的角色头像；不能指定账号或图片地址。', code: 'INVALID_AVATAR' });
  db.prepare(`INSERT INTO course_avatar_preferences(student_id,course_id,avatar_id) VALUES(?,?,?)
    ON CONFLICT(student_id,course_id) DO UPDATE SET avatar_id=excluded.avatar_id,updated_at=CURRENT_TIMESTAMP`).run(req.user.id, req.courseSpace, body.avatarId);
  res.json({ saved: true, avatarId: body.avatarId });
});
module.exports = router;
