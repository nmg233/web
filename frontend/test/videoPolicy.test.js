import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import policy from '../../shared/uploadPolicy.json' with {type:'json'};
import registry from '../../content/student-copy/registry.json' with {type:'json'};
import {systemCopy} from '../src/content/systemCopy.js';
import {videoUploadHint,videoUploadLimits} from '../src/utils/videoPolicy.js';
import {replayFileError} from '../src/utils/replayUpload.js';

test('视频提示采用共享策略和服务端策略，明确1.5GB而不是1.5GiB',()=>{
 assert.equal(policy.replayMaxBytes,1_500_000_000);
 assert.equal(videoUploadHint(),'支持 MP4、WebM，单个视频最大 1.5GB');
 assert.equal(videoUploadHint({replayExtensions:['.webm'],replayLimitLabel:'1.5GB'}),'支持 WebM，单个视频最大 1.5GB');
 assert.equal(replayFileError({name:'lesson.mp4',size:500*1024*1024+1}),'');
 assert.equal(replayFileError({name:'lesson.webm',size:policy.replayMaxBytes}),'');
 assert.match(replayFileError({name:'lesson.mp4',size:policy.replayMaxBytes+1}),/1\.5GB/);
 assert.match(replayFileError({name:'lesson.mp4',size:1.5*1024**3}),/1\.5GB/);
});

test('队列校验和提示使用相同字节上限，缺少旧MB字段或标签过期不能产生矛盾',()=>{
 const current={replayLimitBytes:policy.replayMaxBytes,replayLimitLabel:'500MB'};
 assert.deepEqual(videoUploadLimits(current),{maxBytes:1_500_000_000,label:'1.5GB'});
 assert.match(videoUploadHint(current),/1\.5GB/);
 assert.deepEqual(videoUploadLimits({replayLimitMB:policy.replayMaxBytes/1024/1024}),{maxBytes:1_500_000_000,label:'1.5GB'});
 assert.deepEqual(videoUploadLimits({replayLimitMB:500}),{maxBytes:500*1024*1024,label:'500MiB'});
 assert.match(videoUploadHint({replayLimitMB:500}),/500MiB/);
 assert.deepEqual(videoUploadLimits({}),{maxBytes:1_500_000_000,label:'1.5GB'});
 for(const replayLimitBytes of [0,-1,NaN,Infinity,'1500000000'])assert.equal(videoUploadLimits({replayLimitBytes}).maxBytes,policy.replayMaxBytes);
});

test('运行文案、默认注册表与备用文案均不残留500MB视频提示',()=>{
 const source=fs.readFileSync(new URL('../src/content/uiCopy.jsx',import.meta.url),'utf8');
 const uiCopy=JSON.parse(source.replace(/^export const uiCopy\s*=\s*/,'').replace(/;\s*$/,''));
 for(const [id,entries]of [
  ['maintenance.upload.videoNote',[uiCopy,registry]],
  ['site.c2214999f69ce78a',[systemCopy,registry]],
  ['site.c9e0b965e5d43561',[systemCopy,registry]],
 ])for(const entry of entries){assert.match(entry[id].text,/1\.5GB/);assert.doesNotMatch(entry[id].text,/500\s*M(?:i)?B/i);}
 const generator=fs.readFileSync(new URL('../../scripts/add-step03-copy.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(generator,/500\s*M(?:i)?B/i);
 assert.match(generator,/replayMaxLabel/);
 for(const file of ['admin-workspace/fields.md','course-authorization/material-formats.md','course-rewards/course-fields.md','course-rewards/material-formats.md','mentor-workspace/step-03/guide.md']){
  const text=fs.readFileSync(new URL('../../docs/'+file,import.meta.url),'utf8');
  assert.match(text,/1\.5GB/);assert.match(text,/1,500,000,000/);
  assert.doesNotMatch(text,/500\s*M(?:i)?B/i);
 }
});
