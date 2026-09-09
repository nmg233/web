const db = require('../config/database');

function makeRoleGroups() {
  return { teacher: [], student: [] };
}

function buildUserTree({ roles = ['student', 'teacher'], search = '', includeExecutive = false, classId = null, schoolId = null, mentorId = null } = {}) {
  const placeholders = roles.map(() => '?').join(',');
  const params = roles.slice();
  let sql = `
    SELECT u.id, u.username, u.real_name, u.role, u.email, u.phone, u.is_active,
           u.school_id, u.class_id, s.name AS school_name, c.name AS class_name, c.grade
    FROM users u
    LEFT JOIN schools s ON u.school_id = s.id
    LEFT JOIN classes c ON u.class_id = c.id
    WHERE u.role IN (${placeholders})
  `;

  if (search) {
    sql += ' AND (u.real_name LIKE ? OR u.username LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (classId) {
    sql += ' AND u.class_id = ?';
    params.push(classId);
  }
  if (schoolId) {
    sql += ' AND u.school_id = ?';
    params.push(schoolId);
  }
  if (mentorId) {
    // 导师仅见历史/当前参加过自己课程的学生（决策 D-1，含授课归属）
    sql += ` AND EXISTS (
      SELECT 1 FROM enrollments e JOIN courses c2 ON c2.id = e.course_id
      WHERE e.student_id = u.id
        AND (c2.created_by = ? OR EXISTS (
          SELECT 1 FROM lessons l WHERE l.course_id = c2.id AND l.instructor_id = ?
        ))
    )`;
    params.push(mentorId, mentorId);
  }

  sql += ' ORDER BY u.role, u.real_name';

  const users = db.prepare(sql).all(...params);
  const schools = db.prepare('SELECT * FROM schools ORDER BY name').all();
  const classes = db.prepare('SELECT * FROM classes ORDER BY grade, name').all();

  const tree = {
    schools: schools.map((school) => ({
      ...school,
      classes: classes
        .filter((cls) => cls.school_id === school.id)
        .map((cls) => ({ ...cls, roles: makeRoleGroups() }))
    })),
    unassigned: makeRoleGroups(),
    academicMentors: []
  };

  for (const user of users) {
    const roleKey = user.role === 'teacher' ? 'teacher' : 'student';
    if (user.school_id) {
      const school = tree.schools.find((s) => s.id === user.school_id);
      if (!school) continue;
      const cls = school.classes.find((c) => c.id === user.class_id);
      if (cls) {
        cls.roles[roleKey].push(user);
      } else {
        const unassignedClass = school.classes.find((c) => c.id === null);
        if (!unassignedClass) {
          school.classes.push({
            id: null,
            name: '未分班',
            grade: null,
            roles: makeRoleGroups()
          });
        }
        school.classes.find((c) => c.id === null).roles[roleKey].push(user);
      }
    } else {
      tree.unassigned[roleKey].push(user);
    }
  }

  if (search || schoolId || mentorId) {
    for (const school of tree.schools) {
      school.classes = school.classes.filter((cls) => cls.roles.teacher.length > 0 || cls.roles.student.length > 0);
    }
    tree.schools = tree.schools.filter((school) => school.classes.length > 0);
  }

  if (includeExecutive) {
    const execParams = [];
    let execSql = `
      SELECT id, username, real_name, role, email, phone, profile, is_active,
             school_id, class_id, school_name, class_name, grade
      FROM (
        SELECT u.id, u.username, u.real_name, u.role, u.email, u.phone, u.profile, u.is_active,
               u.school_id, u.class_id, s.name AS school_name, c.name AS class_name, c.grade
        FROM users u
        LEFT JOIN schools s ON u.school_id = s.id
        LEFT JOIN classes c ON u.class_id = c.id
        WHERE u.role = 'academic_mentor'
      ) AS exec_users
    `;
    if (search) {
      execSql += ' WHERE real_name LIKE ? OR username LIKE ?';
      execParams.push(`%${search}%`, `%${search}%`);
    }
    execSql += ' ORDER BY real_name';
    tree.academicMentors = db.prepare(execSql).all(...execParams);
  }

  return tree;
}

module.exports = { buildUserTree };
