const db = require('../config/database');
const fs = require('fs');
const path = require('path');
const { isStaff, isTeacher } = require('../middleware/auth');
const { UPLOAD_ROOT } = require('../middleware/upload');
const { decodeOriginalName } = require('../helpers/fileName');
const notificationService = require('../services/notificationService');

const { NOTIFICATION_EVENTS } = notificationService;

function notifyWorkRecipients(work, payload, recipientIds) {
  return notificationService.safeCreateForUsers({
    category: 'work',
    businessType: 'work',
    businessId: work.id,
    actionUrl: payload.actionUrl === undefined ? `/works/${work.id}` : payload.actionUrl,
    ...payload,
  }, recipientIds);
}

function removeUploadedFile(file) {
  if (file && file.path) {
    try { fs.unlinkSync(file.path); } catch (e) { /* 文件可能已删除 */ }
  }
}

function canAccessStudent(user, student) {
  return !isTeacher(user.role) || student.school_id === user.school_id;
}

exports.pendingTasks = (req, res) => {
  try {
    if (req.user.role !== 'student') return res.json({ tasks: [] });
    const tasks = db.prepare(`SELECT t.id, t.title, t.description, c.title AS course_title,
      e.id AS enrollment_id FROM enrollments e JOIN courses c ON c.id=e.course_id
      JOIN lessons l ON l.course_id=c.id JOIN tasks t ON t.lesson_id=l.id
      WHERE e.student_id=? AND c.status='published' AND t.require_upload=1
      AND (
        NOT EXISTS (SELECT 1 FROM works w WHERE w.student_id=e.student_id AND w.task_id=t.id)
        OR (SELECT w.review_status FROM works w
        WHERE w.student_id=e.student_id AND w.task_id=t.id
        ORDER BY w.version DESC, w.created_at DESC, w.id DESC LIMIT 1) = 'rejected'
      )
      ORDER BY t.created_at DESC`).all(req.user.id);
    res.json({ tasks });
  } catch (err) { res.status(500).json({ error: '加载待办任务失败' }); }
};

// 作品列表
exports.list = (req, res) => {
  try {
    let sql = `
      SELECT w.*, u.real_name as student_name, c.title as course_title,
             EXISTS (SELECT 1 FROM works newer
               WHERE newer.parent_work_id = COALESCE(w.parent_work_id, w.id)
                 AND newer.version > w.version) AS has_newer_version,
             t.title as task_title, s.name as school_name
      FROM works w
      JOIN users u ON w.student_id = u.id
      LEFT JOIN enrollments e ON w.enrollment_id = e.id
      LEFT JOIN courses c ON e.course_id = c.id
      LEFT JOIN tasks t ON w.task_id = t.id
      LEFT JOIN schools s ON u.school_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (req.query.student_id) { sql += ' AND w.student_id = ?'; params.push(req.query.student_id); }
    if (req.query.course_id) { sql += ' AND c.id = ?'; params.push(req.query.course_id); }
    if (req.query.search) {
      sql += ' AND (w.title LIKE ? OR w.description LIKE ?)';
      params.push(`%${req.query.search}%`, `%${req.query.search}%`);
    }
    if (req.user.role === 'student') {
      sql += ' AND w.student_id = ?';
      params.push(req.user.id);
    } else if (!isStaff(req.user.role)) {
      sql += ' AND w.student_id = ?';
      params.push(req.user.id);
    }

    if (isTeacher(req.user.role)) {
      sql += ' AND u.school_id = ?';
      params.push(req.user.school_id || 0);
    }

    sql += ' ORDER BY w.created_at DESC';

    const works = db.prepare(sql).all(...params);
    const courses = db.prepare('SELECT id, title FROM courses ORDER BY title').all();

    res.json({ title: '作品管理', works, courses, filters: req.query });
  } catch (err) {
    console.error('作品列表错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 上传作品页面
exports.showUpload = (req, res) => {
  try {
    const userId = req.user.id;
    let enrollments = [];

    if (isStaff(req.user.role)) {
      let students;
      if (isTeacher(req.user.role)) {
        const schoolId = req.user.school_id || 0;
        enrollments = db.prepare(
          `SELECT e.id as enrollment_id, c.id as course_id, c.title as course_title,
                  u.real_name as student_name, u.id as student_id
           FROM enrollments e
           JOIN courses c ON e.course_id = c.id
           JOIN users u ON e.student_id = u.id
           WHERE u.school_id = ?
           ORDER BY u.real_name`
        ).all(schoolId);
        students = db.prepare(
          "SELECT id, real_name FROM users WHERE role = 'student' AND school_id = ? ORDER BY real_name"
        ).all(schoolId);
      } else {
        enrollments = db.prepare(
          `SELECT e.id as enrollment_id, c.id as course_id, c.title as course_title,
                  u.real_name as student_name, u.id as student_id
           FROM enrollments e
           JOIN courses c ON e.course_id = c.id
           JOIN users u ON e.student_id = u.id
           ORDER BY u.real_name`
        ).all();
        students = db.prepare("SELECT id, real_name FROM users WHERE role = 'student' ORDER BY real_name").all();
      }
      const courseOptions = Array.from(new Map(enrollments.map((e) => [e.course_id, e])).values());
      return res.json({ title: '上传作品', enrollments, courseOptions, students });
    }

    enrollments = db.prepare(
      `SELECT e.id as enrollment_id, c.id as course_id, c.title as course_title
       FROM enrollments e JOIN courses c ON e.course_id = c.id
       WHERE e.student_id = ?`
    ).all(userId);

    const courseOptions = Array.from(new Map(enrollments.map((e) => [e.course_id, e])).values());
    res.json({ title: '上传作品', enrollments, courseOptions, students: [] });
  } catch (err) {
    console.error('加载上传页错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 处理作品上传
exports.upload = (req, res) => {
  try {
    if (req.user.role === 'admin') {
      removeUploadedFile(req.file);
      return res.status(400).json({ error: '管理员不可上传作品' });
    }

    if (!req.file && !req.body.description?.trim()) {
      return res.status(400).json({ error: '请填写成果内容或选择文件' });
    }

    const { title, description, enrollment_id, task_id, student_id, parent_work_id } = req.body;
    const user = req.user;
    const staff = isStaff(user.role);

    if (!title) {
      removeUploadedFile(req.file);
      return res.status(400).json({ error: '请填写作品名称' });
    }

    if (!staff && student_id && Number(student_id) !== user.id) {
      removeUploadedFile(req.file);
      return res.status(400).json({ error: '无权替其他学生上传作品' });
    }

    const actualStudentId = staff ? (student_id || user.id) : user.id;
    const student = db.prepare(
      "SELECT id, school_id FROM users WHERE id = ? AND role = 'student'"
    ).get(actualStudentId);

    if (!student) {
      removeUploadedFile(req.file);
      return res.status(400).json({ error: '所选学生不存在' });
    }

    if (isTeacher(user.role) && student.school_id !== user.school_id) {
      removeUploadedFile(req.file);
      return res.status(400).json({ error: '教师只能为本校学生上传作品' });
    }

    let enrollmentCourseId = null;
    let resolvedEnrollmentId = enrollment_id || null;
    if (enrollment_id) {
      const enrollment = db.prepare(
        'SELECT id, course_id FROM enrollments WHERE id = ? AND student_id = ?'
      ).get(enrollment_id, actualStudentId);
      if (!enrollment) {
        removeUploadedFile(req.file);
        return res.status(400).json({ error: '所选课程报名记录不属于该学生' });
      }
      enrollmentCourseId = enrollment.course_id;
    }

    if (task_id) {
      const task = db.prepare(`
        SELECT t.id, t.require_upload, l.course_id
        FROM tasks t
        JOIN lessons l ON l.id = t.lesson_id
        WHERE t.id = ?
      `).get(task_id);
      if (!task || (enrollmentCourseId && task.course_id !== enrollmentCourseId)) {
        removeUploadedFile(req.file);
        return res.status(400).json({ error: '所选任务不属于当前课程' });
      }
      const taskEnrollment = db.prepare(
        'SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?'
      ).get(actualStudentId, task.course_id);
      if (!taskEnrollment) {
        removeUploadedFile(req.file);
        return res.status(403).json({ error: '请先选课后再提交该任务' });
      }
      resolvedEnrollmentId = taskEnrollment.id;
      if (!parent_work_id) {
        const existingWork = db.prepare(
          'SELECT id FROM works WHERE student_id = ? AND task_id = ? LIMIT 1'
        ).get(actualStudentId, task_id);
        if (existingWork) {
          removeUploadedFile(req.file);
          return res.status(400).json({ error: '该任务已有作品，请通过重新提交创建新版本' });
        }
      }
    }

    const ext = req.file ? path.extname(req.file.originalname).toLowerCase() : '';
    const displayType = !req.file ? 'text' : ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? 'image' :
                        ['.mp4', '.webm'].includes(ext) ? 'video' :
                        ext === '.pdf' ? 'pdf' : 'file';

    let version = 1;
    let parentId = null;
    if (parent_work_id) {
      const old = db.prepare('SELECT * FROM works WHERE id = ? AND student_id = ?').get(parent_work_id, actualStudentId);
      const rootId = old?.parent_work_id || old?.id;
      const submittedTaskId = task_id ? Number(task_id) : null;
      const submittedEnrollmentId = resolvedEnrollmentId ? Number(resolvedEnrollmentId) : null;
      const latest = rootId ? db.prepare(
        'SELECT id FROM works WHERE id = ? OR parent_work_id = ? ORDER BY version DESC, created_at DESC, id DESC LIMIT 1'
      ).get(rootId, rootId) : null;
      if (!old || old.review_status !== 'rejected'
          || old.task_id !== submittedTaskId
          || old.enrollment_id !== submittedEnrollmentId
          || latest?.id !== old.id) {
        removeUploadedFile(req.file);
        return res.status(400).json({ error: '该作品不可重新提交' });
      }
      parentId = rootId;
      version = db.prepare('SELECT COALESCE(MAX(version), 1) + 1 AS version FROM works WHERE id = ? OR parent_work_id = ?').get(parentId, parentId).version;
    }
    const insertResult = db.prepare(
      `INSERT INTO works (student_id, enrollment_id, task_id, title, description,
        file_path, file_name, file_type, file_size, parent_work_id, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(actualStudentId, resolvedEnrollmentId, task_id || null, title,
          description || null, req.file?.path || null, decodeOriginalName(req.file?.originalname) || null,
          displayType, req.file?.size || null, parentId, version);

    db.prepare("INSERT INTO growth_records (student_id,event_type,description) VALUES (?,'system',?)").run(actualStudentId, `提交作品《${title}》`);
    const workCount = db.prepare('SELECT COUNT(*) count FROM works WHERE student_id=?').get(actualStudentId).count;
    if (workCount % 3 === 0) db.prepare("INSERT INTO growth_records (student_id,event_type,description) VALUES (?,'system',?)").run(actualStudentId, `累计完成 ${workCount} 个作品`);

    const workId = Number(insertResult.lastInsertRowid);
    const courseOwner = resolvedEnrollmentId ? db.prepare(`
      SELECT c.created_by
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      WHERE e.id = ?
    `).get(resolvedEnrollmentId) : null;
    const resubmitted = Boolean(parentId);
    notifyWorkRecipients({ id: workId }, {
      eventKey: resubmitted ? NOTIFICATION_EVENTS.WORK_RESUBMITTED : NOTIFICATION_EVENTS.WORK_SUBMITTED,
      dedupeKey: `work.submitted:${workId}`,
      title: resubmitted ? '作品已重新提交' : '作品已提交',
      summary: `《${title}》${resubmitted ? `第 ${version} 版` : ''}`,
      content: resubmitted
        ? `作品《${title}》第 ${version} 版已提交，等待评审。`
        : `作品《${title}》已提交，等待评审。`,
      level: resubmitted ? 'important' : 'normal',
      createdBy: user.id,
    }, [actualStudentId, courseOwner?.created_by].filter(Boolean));

    res.json({ message: '作品上传成功！', id: workId });
  } catch (err) {
    console.error('上传作品错误:', err);
    removeUploadedFile(req.file);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

// 作品详情
exports.detail = (req, res) => {
  try {
    const work = db.prepare(
      `SELECT w.*, u.real_name as student_name, c.title as course_title,
              EXISTS (SELECT 1 FROM works newer
                WHERE newer.parent_work_id = COALESCE(w.parent_work_id, w.id)
                  AND newer.version > w.version) AS has_newer_version,
              t.title as task_title, u.school_id as student_school_id, c.status as course_status
       FROM works w
       JOIN users u ON w.student_id = u.id
       LEFT JOIN enrollments e ON w.enrollment_id = e.id
       LEFT JOIN courses c ON e.course_id = c.id
       LEFT JOIN tasks t ON w.task_id = t.id
       WHERE w.id = ?`
    ).get(req.params.id);

    if (!work) {
      return res.status(400).json({ error: '作品不存在' });
    }

    if (!isStaff(req.user.role) && work.student_id !== req.user.id) {
      return res.status(400).json({ error: '无权查看该作品' });
    }

    if (isTeacher(req.user.role) && work.student_school_id !== req.user.school_id) {
      return res.status(400).json({ error: '无权查看其他学校作品' });
    }

    const review = db.prepare(`SELECT r.*, u.real_name reviewer_name FROM work_reviews r JOIN users u ON u.id=r.reviewer_id WHERE r.work_id=?`).get(work.id);
    work.file_name = decodeOriginalName(work.file_name);
    const rootId = work.parent_work_id || work.id;
    const versions = db.prepare(`SELECT id, version, title, review_status, created_at FROM works WHERE id=? OR parent_work_id=? ORDER BY version DESC`).all(rootId, rootId);
    res.json({ title: work.title, work, review, versions });
  } catch (err) {
    console.error('作品详情错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.download = (req, res) => {
  try {
    const work = db.prepare(`
      SELECT w.*, u.school_id AS student_school_id, c.status AS course_status
      FROM works w
      JOIN users u ON u.id = w.student_id
      LEFT JOIN enrollments e ON e.id = w.enrollment_id
      LEFT JOIN courses c ON c.id = e.course_id
      WHERE w.id = ?
    `).get(req.params.id);
    if (!work || !work.file_path) return res.status(404).json({ error: '附件不存在' });
    if (!isStaff(req.user.role) && work.student_id !== req.user.id) return res.status(403).json({ error: '无权下载该附件' });
    if (isTeacher(req.user.role) && work.student_school_id !== req.user.school_id) {
      return res.status(403).json({ error: '无权下载该附件' });
    }

    const resolvedPath = path.resolve(work.file_path);
    const relativePath = path.relative(UPLOAD_ROOT, resolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath) || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: '附件文件不存在' });
    }
    return res.download(resolvedPath, decodeOriginalName(work.file_name) || path.basename(resolvedPath));
  } catch (err) {
    console.error('下载作品附件错误:', err);
    return res.status(500).json({ error: '下载附件失败' });
  }
};

// 删除作品
exports.delete = (req, res) => {
  try {
    const work = db.prepare(`
      SELECT w.id, w.student_id, w.title, w.file_path, u.school_id as student_school_id
      FROM works w
      JOIN users u ON u.id = w.student_id
      WHERE w.id = ?
    `).get(req.params.id);

    if (!work) {
      return res.status(400).json({ error: '作品不存在' });
    }

    if (!isStaff(req.user.role) && work.student_id !== req.user.id) {
      return res.status(400).json({ error: '无权删除该作品' });
    }

    if (isTeacher(req.user.role) && work.student_school_id !== req.user.school_id) {
      return res.status(400).json({ error: '无权删除其他学校作品' });
    }

    if (work.file_path) {
      try { fs.unlinkSync(work.file_path); } catch (e) { /* 文件可能已删除 */ }
    }
    db.prepare('DELETE FROM works WHERE id = ?').run(req.params.id);
    notifyWorkRecipients(work, {
      eventKey: NOTIFICATION_EVENTS.WORK_DELETED,
      dedupeKey: `work.deleted:${work.id}`,
      title: '作品已删除',
      summary: `《${work.title}》`,
      content: `作品《${work.title}》已被删除。`,
      level: 'important',
      actionUrl: null,
      createdBy: req.user.id,
    }, [work.student_id]);
    res.json({ message: '作品已删除' });
  } catch (err) {
    console.error('删除作品错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.reject = (req, res) => {
  try {
    const work = db.prepare('SELECT id, student_id, title, review_status FROM works WHERE id = ?').get(req.params.id);
    if (!work) {
      return res.status(400).json({ error: '作品不存在' });
    }
    if (work.review_status !== 'pending') return res.status(409).json({ error: '该版本作品已批改，不能修改批改结果' });

    const reason = (req.body.reason || '').trim() || '作品不符合要求，请修改后重新提交';
    const growthId = db.transaction(() => {
      db.prepare(
        "UPDATE works SET review_status = 'rejected', reject_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(reason, req.params.id);
      const growth = db.prepare(
        "INSERT INTO growth_records (student_id,event_type,description) VALUES (?,'system',?)"
      ).run(work.student_id, `作品《${work.title}》被打回修改`);
      return Number(growth.lastInsertRowid);
    })();

    notifyWorkRecipients(work, {
      eventKey: NOTIFICATION_EVENTS.WORK_REVIEWED,
      dedupeKey: `work.reviewed:${work.id}:${growthId}`,
      title: '作品需要修改',
      summary: `《${work.title}》评审结果：需修改`,
      content: reason,
      level: 'important',
      createdBy: req.user.id,
    }, [work.student_id]);

    res.json({ message: '作品已打回' });
  } catch (err) {
    console.error('打回作品错误:', err);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  }
};

exports.review = (req, res) => {
  try {
    const work = db.prepare(`SELECT w.*, u.school_id FROM works w JOIN users u ON u.id=w.student_id WHERE w.id=?`).get(req.params.id);
    if (!work || !canAccessStudent(req.user, work)) return res.status(403).json({ error: '无权批改该作品' });
    if (work.review_status !== 'pending') return res.status(409).json({ error: '该版本作品已批改，不能修改批改结果' });
    const keys = ['problem_discovery', 'solution_design', 'hands_on', 'data_analysis', 'presentation'];
    if (!['approved', 'rejected'].includes(req.body.status)) return res.status(400).json({ error: '请选择批改结果' });
    const status = req.body.status;
    if (status === 'approved' && keys.some((key) => !Number.isInteger(Number(req.body[key])) || Number(req.body[key]) < 1 || Number(req.body[key]) > 5)) return res.status(400).json({ error: '选择通过时，五项评分均须为1-5的整数' });
    const scores = status === 'approved' ? keys.map((key) => Number(req.body[key])) : keys.map(() => null);
    const growthId = db.transaction(() => {
      db.prepare(`INSERT INTO work_reviews (work_id,reviewer_id,comment,suggestion,problem_discovery,solution_design,hands_on,data_analysis,presentation)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(work.id, req.user.id, req.body.comment || null, req.body.suggestion || null, ...scores);
      db.prepare('UPDATE works SET review_status=?, reject_reason=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, status === 'rejected' ? (req.body.suggestion || '请修改后重新提交') : null, work.id);
      const growth = db.prepare("INSERT INTO growth_records (student_id,event_type,description) VALUES (?,'system',?)").run(work.student_id, `作品《${work.title}》获得教师批改`);
      return Number(growth.lastInsertRowid);
    })();
    notifyWorkRecipients(work, {
      eventKey: NOTIFICATION_EVENTS.WORK_REVIEWED,
      dedupeKey: `work.reviewed:${work.id}:${growthId}`,
      title: status === 'approved' ? '作品评审已通过' : '作品需要修改',
      summary: `《${work.title}》评审结果：${status === 'approved' ? '已通过' : '需修改'}`,
      content: status === 'approved'
        ? (req.body.comment || '作品已通过评审。')
        : (req.body.suggestion || '请根据评审建议修改后重新提交。'),
      level: status === 'approved' ? 'normal' : 'important',
      createdBy: req.user.id,
    }, [work.student_id]);
    res.json({ message: '批改已保存' });
  } catch (err) { console.error(err); res.status(500).json({ error: '保存批改失败' }); }
};
