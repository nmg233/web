import policy from '../../../shared/uploadPolicy.json' with {type:'json'};
export function videoUploadHint(serverPolicy){const extensions=serverPolicy?.replayExtensions||['.mp4','.webm'];return `支持 ${extensions.map(x=>x.toLowerCase()==='.webm'?'WebM':x.replace('.','').toUpperCase()).join('、')}，单个视频最大 ${serverPolicy?.replayLimitLabel||policy.replayMaxLabel}`;}
