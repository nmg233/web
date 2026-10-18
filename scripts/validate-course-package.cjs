// Format-only local inspection; no DB import, network request or archive extraction to caller paths.
const fs=require('node:fs'),format=require('../backend/services/coursePackageFormat');
try{const file=process.argv[2];if(!file)throw Error('用法：node scripts/validate-course-package.cjs <package.zip>');const bytes=fs.readFileSync(file),parsed=format.validate(format.unzip(bytes));console.log(JSON.stringify({valid:true,level:'离线格式与素材校验；服务端导入前还会复核练习语义、权限和目标修订',sha256:format.digest(bytes),...parsed.summary},null,2));}catch(e){console.error(e.message);process.exitCode=1;}
