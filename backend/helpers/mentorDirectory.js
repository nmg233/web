const {mentorStudentScope}=require('../policies/studentPolicy');
function predicate(column='u.id'){return `(${column.replace(/\.id$/,'.mentor_id')}=? OR ${mentorStudentScope(column)})`;}
const params=id=>[id,id,id];
function schoolIds(db,user){return db.prepare(`SELECT DISTINCT school_id id FROM users u WHERE u.role='student' AND school_id IS NOT NULL AND ${predicate()}`).all(...params(user.id)).map(r=>r.id);}
module.exports={predicate,params,schoolIds};
