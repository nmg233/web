const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const JSZip = require('jszip');
const { checkZip, parse } = require('../services/aiDocumentWorker');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-budgets-'));
after(() => fs.rmSync(directory, { recursive: true, force: true }));

test('ZIP 炸弹在解压前拒绝，正常低预算文档允许', async () => {
  const safe = new JSZip(); safe.file('word/document.xml','<p>内容</p>');
  const safeBuffer = await safe.generateAsync({ type:'nodebuffer', compression:'DEFLATE' });
  assert.doesNotThrow(() => checkZip(safeBuffer));
  const bomb = new JSZip(); bomb.file('word/document.xml','A'.repeat(3 * 1024 * 1024));
  const buffer = await bomb.generateAsync({ type:'nodebuffer', compression:'DEFLATE' });
  assert.throws(() => checkZip(buffer), /预算超限/);
  assert.throws(() => checkZip(Buffer.alloc(22)), /不支持/);
});

test('累计文本、文件大小有硬预算，不返回截断的成功结果', async () => {
  const text = path.join(directory, 'text.txt');
  fs.writeFileSync(text,'A'.repeat(1_200_001));
  await assert.rejects(parse(text,'.txt'), /120 万/);
  const large = path.join(directory, 'large.txt');
  const descriptor = fs.openSync(large,'w');
  fs.ftruncateSync(descriptor,50 * 1024 * 1024 + 1); fs.closeSync(descriptor);
  await assert.rejects(parse(large,'.txt'), /50 MB/);
});

test('N15：DOCX真实解析不调用CLI格式化依赖，精度格式文本只作为正文处理',async()=>{
  const Module=require('node:module'),original=Module._load;
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>正常正文 %.101f %.0g</w:t></w:r></w:p></w:body></w:document>');
  const file=path.join(directory,'safe.docx');fs.writeFileSync(file,await zip.generateAsync({type:'nodebuffer'}));
  Module._load=function(request,...args){if(['argparse','sprintf-js'].includes(request)) throw Error('不应调用CLI依赖');return original.call(this,request,...args);};
  try{const chunks=await parse(file,'.docx');assert.match(chunks[0].text,/正常正文 %\.101f %\.0g/);}
  finally{Module._load=original;}
});

test('500MB 上传签名验证只读取16字节，不整体读入内存', () => {
  const file = path.join(directory, 'large.mp4');
  const descriptor = fs.openSync(file,'w');
  fs.writeSync(descriptor,Buffer.from('0000ftypisom0000')); fs.ftruncateSync(descriptor,500 * 1024 * 1024); fs.closeSync(descriptor);
  const { validateUploadedFiles } = require('../middleware/upload');
  const originalRead = fs.readFileSync;
  const originalReadBytes = fs.readSync;
  let bytes = 0;
  fs.readFileSync = function(target,...args) { if (target === file) throw new Error('整文件读取被禁止'); return originalRead.call(fs,target,...args); };
  fs.readSync = function(fd, buffer, offset, length, position) { bytes += length; return originalReadBytes.call(fs,fd,buffer,offset,length,position); };
  try {
    let error;
    validateUploadedFiles({file:{path:file,originalname:'large.mp4'}}, {}, (err) => { error=err; });
    assert.equal(error,undefined); assert.equal(bytes,16);
  } finally { fs.readFileSync=originalRead; fs.readSync=originalReadBytes; }
});
