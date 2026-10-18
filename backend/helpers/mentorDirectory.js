const {mentorStudentScope}=require('../policies/studentPolicy');
function predicate(column='u.id'){return `(${column.replace(/\.id$/,'.mentor_id')}=? OR ${mentorStudentScope(column)})`;}
const params=id=>[id,id,id];
function schoolIds(db,user){return require('../services/mentorSchoolScope').schools(user).map(r=>r.id);}
module.exports={predicate,params,schoolIds};
