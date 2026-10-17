// Explicit read-only inventory. Does not load app config, seed, migrate or bind.
const path=require('node:path'),Database=require('../backend/node_modules/better-sqlite3');
function inspect(db){const has=(t,c)=>db.pragma(`table_info(${t})`).some(x=>x.name===c),scoped=has('reward_gifts','course_id');return {readOnly:true,schemaVersion:db.prepare('SELECT max(version) version FROM schema_migrations').get().version,
 gifts:db.prepare(`SELECT g.*, (SELECT count(*) FROM reward_orders o WHERE o.gift_id=g.id) order_count FROM reward_gifts g ${scoped?'WHERE g.course_id IS NULL':''} ORDER BY g.id`).all().map(g=>({giftId:g.id,name:g.name,imageId:g.image_id,stock:g.stock,price:g.price,limit:g.per_student_limit,published:g.published,revision:g.revision,orderCount:g.order_count,targetCourseId:null,reason:'人工核对后填写，不按名称或唯一课程猜测'})),
 lessonDefinitions:db.prepare('SELECT b.lesson_id,l.course_id,b.name FROM lesson_badge_definitions b JOIN lessons l ON l.id=b.lesson_id ORDER BY l.course_id,l.id').all(),
 instructions:'此清单不执行绑定。先联合备份、核对目标课程和差异，再由管理员在课程管理的存量核对入口逐项确认。历史金币不重算。'};}
if(require.main===module){let db;try{const args=process.argv.slice(2),i=args.indexOf('--db');if(i<0||!args[i+1]||args.length!==2)throw Error('用法：node scripts/course-reward-audit.cjs --db <已有数据库>');db=new Database(path.resolve(args[i+1]),{readonly:true,fileMustExist:true});db.pragma('query_only=ON');console.log(JSON.stringify(inspect(db),null,2));}catch(e){console.error(e.message);process.exitCode=1;}finally{db?.close();}}
module.exports={inspect};
