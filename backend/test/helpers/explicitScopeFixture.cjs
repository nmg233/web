// TEST ONLY. Old test datasets were inserted after startup/migration. Explicitly
// describe their intended legacy grants; production never infers these scopes.
function observers(db){
 db.exec(`INSERT OR IGNORE INTO legacy_teacher_students(teacher_id,student_id,school_id)
  SELECT t.id,s.id,s.school_id FROM users s JOIN users t ON t.id=s.teacher_id AND t.role='teacher' WHERE s.role='student';
 INSERT OR IGNORE INTO teacher_observation_grants(teacher_id,student_id,course_id,school_id,source)
  SELECT t.id,s.id,e.course_id,s.school_id,'legacy_teacher_id' FROM users s JOIN users t ON t.id=s.teacher_id AND t.role='teacher' JOIN enrollments e ON e.student_id=s.id;`);
}
function admissions(db){
 const admin=db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get()?.id;if(!admin)return;
 for(const mentor of db.prepare("SELECT id FROM users WHERE role='academic_mentor'").all()){
  const students=db.prepare("SELECT * FROM users WHERE role='student' AND mentor_id=? AND school_id IS NOT NULL").all(mentor.id);
  for(const schoolId of new Set(students.map(s=>s.school_id))){
   let app=db.prepare('SELECT id FROM school_applications WHERE applicant_id=? AND school_id=?').get(mentor.id,schoolId);
   if(!app)app={id:db.prepare("INSERT INTO school_applications(applicant_id,name,normalized_name,region,explanation,status,school_id) VALUES(?,? ,?,'测试','显式测试学校授权','approved',?)").run(mentor.id,'测试学校'+schoolId,'fixture-'+schoolId,schoolId).lastInsertRowid};
   db.prepare('INSERT OR IGNORE INTO school_managers(school_id,mentor_id,application_id,granted_by) VALUES(?,?,?,?)').run(schoolId,mentor.id,app.id,admin);
   for(const c of db.prepare('SELECT course_id FROM course_managers WHERE mentor_id=? AND active=1').all(mentor.id))db.prepare('INSERT OR IGNORE INTO course_school_scopes(course_id,school_id,created_by) VALUES(?,?,?)').run(c.course_id,schoolId,admin);
  }
  for(const s of students)db.prepare("INSERT OR IGNORE INTO organization_account_delegations(student_id,mentor_id,school_id,actor_id,reason) VALUES(?,?,?,?,'测试显式账号委托')").run(s.id,mentor.id,s.school_id,admin);
 }
}
module.exports={observers,admissions};
