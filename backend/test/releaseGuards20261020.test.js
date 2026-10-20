const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {spawnSync}=require('node:child_process');
const {retryCleanupQueue}=require('../helpers/fileLifecycle');
const {assertNoReferences}=require('../helpers/deletionProtection');
const Database=require('better-sqlite3');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'release-guard-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('清理队列不删除越界文件、上传根或仍在历史快照中的文件',t=>{
 const dir=fixture(t),uploads=path.join(dir,'uploads');fs.mkdirSync(uploads);
 const outside=path.join(dir,'outside.txt'),old=path.join(uploads,'old.txt'),orphan=path.join(uploads,'orphan.txt');
 for(const f of [outside,old,orphan])fs.writeFileSync(f,'synthetic');
 const db=new Database(':memory:');t.after(()=>db.close());db.exec('CREATE TABLE snapshots(content_json TEXT)');db.prepare('INSERT INTO snapshots VALUES(?)').run(JSON.stringify({file_path:old}));
 fs.writeFileSync(path.join(uploads,'.cleanup-queue.json'),JSON.stringify([outside,old,orphan,uploads].map(p=>({path:p,type:p===uploads?'dir':'file'}))));
 const result=retryCleanupQueue(uploads,{isReferenced:require('../helpers/fileReferenceProtection').checker(db)});
 assert.deepEqual(result,{retried:1,failed:3});assert.ok(fs.existsSync(old));assert.ok(fs.existsSync(outside));assert.ok(fs.existsSync(uploads));assert.equal(fs.existsSync(orphan),false);
});
test('清理脚本在项目 ESM 环境可执行；队列损坏和缺少数据库时失败且保留文件',t=>{
 const dir=fixture(t),file=path.join(dir,'old.txt');fs.writeFileSync(file,'synthetic');
 const script=path.resolve(__dirname,'../../scripts/cleanup-files.js');
 const run=()=>spawnSync(process.execPath,[script,dir],{env:{...process.env,DB_PATH:''},encoding:'utf8'});
 assert.equal(run().status,0);
 fs.writeFileSync(path.join(dir,'.cleanup-queue.json'),'bad');assert.notEqual(run().status,0);
 fs.writeFileSync(path.join(dir,'.cleanup-queue.json'),JSON.stringify([{path:file,type:'file'}]));assert.notEqual(run().status,0);assert.ok(fs.existsSync(file));
});
test('外键历史引用返回可解释409；空白父对象仍可正常删除',t=>{
 const db=new Database(':memory:');t.after(()=>db.close());db.pragma('foreign_keys=ON');
 db.exec('CREATE TABLE schools(id INTEGER PRIMARY KEY);CREATE TABLE applications(id INTEGER PRIMARY KEY,school_id REFERENCES schools(id));INSERT INTO schools VALUES(1),(2);INSERT INTO applications VALUES(1,1);');
 assert.throws(()=>assertNoReferences(db,'schools',1,'学校存在历史'),e=>e.status===409&&e.message==='学校存在历史');
 assert.doesNotThrow(()=>assertNoReferences(db,'schools',2,'存在历史'));db.prepare('DELETE FROM schools WHERE id=2').run();
});
test('视频策略按精确字节定义，普通资料及封面上限没有随之扩大',()=>{
 const policy=require('../../shared/uploadPolicy.json');assert.equal(policy.replayMaxBytes,1_500_000_000);assert.equal(policy.replayTimeoutMs,7_200_000);
 const source=fs.readFileSync(path.join(__dirname,'../middleware/upload.js'),'utf8');assert.match(source,/50\s*\*\s*1024\s*\*\s*1024/);assert.match(source,/replayMaxBytes/);
});
for(const mode of ['ok','old-index','missing-js','spa-fallback'])test('Nginx放行探针真实HTTP：'+mode,async t=>{
 const dir=fixture(t);fs.mkdirSync(path.join(dir,'assets'));
 const index='<html><head><link rel="stylesheet" href="/assets/style.css"></head><body><script type="module" src="/assets/app.js"></script></body></html>';
 fs.writeFileSync(path.join(dir,'index.html'),index);fs.writeFileSync(path.join(dir,'assets/app.js'),'console.log("fixture")');fs.writeFileSync(path.join(dir,'assets/style.css'),'body{}');
 const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname;
  if(p==='/'){res.end(mode==='old-index'?'<html>old</html>':index);return;}
  if(p==='/assets/app.js'&&mode==='missing-js'){res.writeHead(404);res.end('missing');return;}
  if(p==='/assets/app.js'&&mode==='spa-fallback'){res.end(index);return;}
  const f=path.join(dir,p);if(fs.existsSync(f))res.end(fs.readFileSync(f));else{res.writeHead(404);res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const {probeFrontend}=await import('../../scripts/probe-frontend.mjs');
 const run=()=>probeFrontend(dir,'http://127.0.0.1:'+server.address().port+'/');
 if(mode==='ok')assert.deepEqual(await run(),{verified:true,assets:2});else await assert.rejects(run,/不匹配|HTTP 404/);
});
