// organizationService：学校/班级统一领域逻辑。
// dashboardController 与 studentController 原先各自维护一套 CRUD，
// 统一到此服务后避免两处校验/SQL 漂移；响应契约由各控制器自行包装。
const db = require('../config/database');

function createSchool({ name, description, tags, region, contact_person, contact_phone }) {
  const result = db.prepare(
    `INSERT INTO schools (name, description, tags, region, contact_person, contact_phone)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(name.trim(), description || null, tags || null, region || null,
        contact_person || null, contact_phone || null);
  return { id: Number(result.lastInsertRowid) };
}

function deleteSchool(id) {
  const school = db.prepare('SELECT id FROM schools WHERE id = ?').get(id);
  if (!school) return false;
  db.prepare('DELETE FROM schools WHERE id = ?').run(id);
  return true;
}

function createClass({ name, school_id, grade }) {
  const school = db.prepare('SELECT id FROM schools WHERE id = ?').get(school_id);
  if (!school) return null;
  const result = db.prepare('INSERT INTO classes (name, school_id, grade) VALUES (?, ?, ?)')
    .run(name.trim(), school_id, grade || null);
  return { id: Number(result.lastInsertRowid) };
}

function deleteClass(id) {
  const cls = db.prepare('SELECT id FROM classes WHERE id = ?').get(id);
  if (!cls) return false;
  db.prepare('DELETE FROM classes WHERE id = ?').run(id);
  return true;
}

module.exports = { createSchool, deleteSchool, createClass, deleteClass };
