// organizationService：学校/班级统一领域逻辑。
// dashboardController 与 studentController 原先各自维护一套 CRUD，
// 统一到此服务后避免两处校验/SQL 漂移；响应契约由各控制器自行包装。
const db = require('../config/database');
const { ensureSchoolCode } = require('../helpers/username');
const requests = require('../helpers/requestResults');

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
const own = (data,key) => Object.prototype.hasOwnProperty.call(data,key);
function positiveId(value) {
  const id = Number(value);
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(id)) fail('组织或教师标识无效');
  return id;
}

// 所有旧/新学生分配入口共用部分更新契约：省略保留，明确 null 才解除。
function assignStudent(actor, studentId, data) {
  if (actor?.role !== 'admin') fail('仅管理员可以调整学生归属',403);
  const id=positiveId(studentId);
  const identity=requests.identity(actor,`student-assignment:${id}`,data);
  return db.transaction(() => {
    const prior=requests.existing(db,identity); if(prior) return prior;
    const student=db.prepare("SELECT * FROM users WHERE id=? AND role='student'").get(id);
    if(!student) fail('学生不存在',404);
    const school=own(data,'school_id') ? positiveId(data.school_id) : student.school_id;
    const moved=school !== student.school_id;
    const cls=own(data,'class_id') ? (data.class_id == null ? null : positiveId(data.class_id)) : student.class_id;
    const teacher=own(data,'teacher_id') ? (data.teacher_id == null ? null : positiveId(data.teacher_id)) : student.teacher_id;
    const mentor=own(data,'mentor_id') ? (data.mentor_id == null ? null : positiveId(data.mentor_id)) : student.mentor_id;
    const target=db.prepare('SELECT id,is_active,name FROM schools WHERE id=?').get(school);
    if(!target || (moved && !target.is_active)) fail('目标学校不存在或已停用');
    if(moved && (!own(data,'teacher_id') || !teacher || !own(data,'class_id') || !cls)) fail('跨校必须选择目标学校班级和新负责教师');
    if(cls && !db.prepare('SELECT 1 FROM classes WHERE id=? AND school_id=?').get(cls,school)) fail('班级不属于目标学校');
    if(teacher) {
      const staff=db.prepare("SELECT school_id,is_active,archived_at FROM users WHERE id=? AND role='teacher'").get(teacher);
      if(!staff || staff.school_id!==school || ((moved || own(data,'teacher_id')) && (!staff.is_active || staff.archived_at))) fail('负责教师必须与学生同校，新增分配须选择有效教师');
    }
    if(mentor && !db.prepare("SELECT 1 FROM users WHERE id=? AND role='academic_mentor' AND is_active=1 AND archived_at IS NULL").get(mentor)) {
      // 原有停用导师关系允许保留，不能把资料编辑当作新增分配。
      if(own(data,'mentor_id') && !(moved && mentor===student.mentor_id)) fail('负责导师不存在或已停用');
    }
    const reason=typeof data.reason==='string' ? data.reason.trim() : '';
    if(moved && (!reason || reason.length>1000)) fail('跨校迁移原因必填，且不能超过1000字');
    if(moved && mentor !== student.mentor_id) fail('跨校迁移必须保留原负责导师；请另行调整导师');
    if(data.source_school_id !== undefined && Number(data.source_school_id)!==student.school_id) fail('学生学校已改变，请刷新后操作',409);
    if(moved) db.prepare(`INSERT INTO student_school_transfers(student_id,actor_id,source_school_id,target_school_id,teacher_id,reason,context_json) VALUES(?,?,?,?,?,?,?)`)
      .run(id,actor.id,student.school_id,school,teacher,reason,JSON.stringify({username:student.username,old_class_id:student.class_id,new_class_id:cls,old_teacher_id:student.teacher_id,mentor_id:student.mentor_id,target_school_name:target.name}));
    db.prepare('UPDATE users SET school_id=?,class_id=?,teacher_id=?,mentor_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(school,cls,teacher,mentor,id);
    const result={message:'学生分配信息已更新',student_id:id}; requests.save(db,identity,result); return result;
  }).immediate();
}

// 移动同一个班级，而非重新建班、重建账号；审计和幂等结果必须与关系更新一起提交。
function transferClass(actor, classId, data) {
  if (actor?.role !== 'admin') fail('仅管理员可以迁移班级', 403);
  const id = positiveId(classId);
  const from = positiveId(data.source_school_id);
  const to = positiveId(data.target_school_id);
  const teacherId = positiveId(data.teacher_id);
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  if (!reason || reason.length > 1000) fail('迁移原因必填，且不能超过1000字');
  if (!data.request_key) fail('迁移请求必须提供重试标识');
  const identity = requests.identity(actor, `class-transfer:${id}`, data);
  return db.transaction(() => {
    const prior = requests.existing(db, identity);
    if (prior) return prior;
    const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(id);
    if (!cls) fail('班级不存在', 404);
    if (cls.school_id !== from) fail('班级归属已改变，请刷新页面后重新操作', 409);
    if (from === to) fail('目标学校必须与原学校不同');
    const source = db.prepare('SELECT id,name FROM schools WHERE id=?').get(from);
    const target = db.prepare('SELECT id,name,is_active FROM schools WHERE id=?').get(to);
    if (!target || !target.is_active) fail('目标学校不存在或已停用');
    const teacher = db.prepare("SELECT id,real_name,school_id FROM users WHERE id=? AND role='teacher' AND is_active=1 AND archived_at IS NULL").get(teacherId);
    if (!teacher || teacher.school_id !== to) fail('必须选择目标学校的有效负责教师');
    if (db.prepare("SELECT 1 FROM users WHERE class_id=? AND role<>'student' LIMIT 1").get(id)) {
      fail('班级仍绑定教师或其他非学生账号，请先调整这些账号的班级归属，再整班迁移', 409);
    }
    const students = db.prepare("SELECT id,username,real_name,school_id,teacher_id,mentor_id FROM users WHERE class_id=? AND role='student' ORDER BY id").all(id);
    if (students.some(s => s.school_id !== from)) fail('班级内存在学校归属不一致的学生，请先处理异常关系', 409);
    if (data.student_count !== undefined && data.student_count !== students.length) fail('班级学生人数已改变，请刷新页面后确认迁移范围', 409);
    const context = { class_name: cls.name, grade: cls.grade, source_school_name: source.name,
      target_school_name: target.name, teacher_name: teacher.real_name,
      actor_name: db.prepare('SELECT real_name FROM users WHERE id=?').get(actor.id)?.real_name };
    db.prepare('UPDATE classes SET school_id=? WHERE id=?').run(to,id);
    db.prepare("UPDATE users SET school_id=?,teacher_id=? WHERE class_id=? AND role='student'").run(to,teacherId,id);
    const audit = db.prepare(`INSERT INTO class_school_transfers
      (class_id,source_school_id,target_school_id,teacher_id,actor_id,reason,members_json,context_json)
      VALUES (?,?,?,?,?,?,?,?)`).run(id,from,to,teacherId,actor.id,reason,JSON.stringify(students),JSON.stringify(context));
    const result = { id: Number(audit.lastInsertRowid), class_id: id, target_school_id: to, teacher_id: teacherId, student_count: students.length };
    requests.save(db,identity,result);
    return result;
  }).immediate();
}

function classTransfers(actor, classId) {
  if (actor?.role !== 'admin') fail('仅管理员可以查看迁移记录', 403);
  return db.prepare('SELECT * FROM class_school_transfers WHERE class_id=? ORDER BY id DESC').all(positiveId(classId))
    .map(({ members_json,context_json,...row }) => ({ ...row, members: JSON.parse(members_json), context: JSON.parse(context_json) }));
}

function createSchool({ name, description, tags, region, contact_person, contact_phone }) {
  return db.transaction(() => {
  const result = db.prepare(
    `INSERT INTO schools (name, description, tags, region, contact_person, contact_phone)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(name.trim(), description || null, tags || null, region || null,
        contact_person || null, contact_phone || null);
  const id = Number(result.lastInsertRowid);
  return { id, account_code: ensureSchoolCode(db,id) };
  })();
}

function deleteSchool(id) {
  const school = db.prepare('SELECT id FROM schools WHERE id = ?').get(id);
  if (!school) return false;
  const users = db.prepare('SELECT COUNT(*) c FROM users WHERE school_id = ?').get(id).c;
  const classes = db.prepare('SELECT COUNT(*) c FROM classes WHERE school_id = ?').get(id).c;
  if (users || classes) throw Object.assign(new Error('学校仍关联账号或班级，请先迁移；可停用学校保留历史'), { status: 409 });
  db.prepare('DELETE FROM schools WHERE id = ?').run(id);
  return true;
}

function createClass({ name, school_id, grade }) {
  const school = db.prepare('SELECT id FROM schools WHERE id = ? AND is_active = 1').get(school_id);
  if (!school) return null;
  const result = db.prepare('INSERT INTO classes (name, school_id, grade) VALUES (?, ?, ?)')
    .run(name.trim(), school_id, grade || null);
  return { id: Number(result.lastInsertRowid) };
}

function deleteClass(id) {
  const cls = db.prepare('SELECT id FROM classes WHERE id = ?').get(id);
  if (!cls) return false;
  if (db.prepare('SELECT 1 FROM users WHERE class_id = ? LIMIT 1').get(id)) {
    throw Object.assign(new Error('班级仍关联账号，请先迁移学生，不能直接删除'), { status: 409 });
  }
  db.prepare('DELETE FROM classes WHERE id = ?').run(id);
  return true;
}

function setSchoolActive(id, active) {
  if (typeof active !== 'boolean') throw Object.assign(new Error('学校状态必须是布尔值'), { status: 400 });
  const result = db.prepare('UPDATE schools SET is_active = ? WHERE id = ?').run(active ? 1 : 0, id);
  if (!result.changes) throw Object.assign(new Error('学校不存在'), { status: 404 });
}

module.exports = { createSchool, deleteSchool, createClass, deleteClass, setSchoolActive, transferClass, classTransfers, assignStudent };
