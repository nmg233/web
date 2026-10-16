const path=require('node:path'),{createRequire}=require('node:module');
// A detached operator kit may reuse the installed backend dependencies without
// loading that application's config, environment, migrations or server.
function applicationRoot(){return path.resolve(process.env.LESSON_MAINT_APP_ROOT||path.join(__dirname,'../..'));}
function databaseConstructor(){return createRequire(path.join(applicationRoot(),'backend/package.json'))('better-sqlite3');}
function lessonVersions(){return require(path.join(applicationRoot(),'backend/helpers/lessonVersions.js'));}
module.exports={applicationRoot,databaseConstructor,lessonVersions};
