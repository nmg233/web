import policy from '../../../shared/uploadPolicy.json' with {type:'json'};
export function videoUploadLimits(serverPolicy){
 const bytes=serverPolicy?.replayLimitBytes,legacyBytes=serverPolicy?.replayLimitMB*1024*1024;
 const maxBytes=Number.isSafeInteger(bytes)&&bytes>0?bytes:Number.isSafeInteger(legacyBytes)&&legacyBytes>0?legacyBytes:policy.replayMaxBytes;
 // The byte limit, not editable copy or a stale label, is authoritative.
 const label=maxBytes===policy.replayMaxBytes?policy.replayMaxLabel:maxBytes%(1024*1024)===0?`${maxBytes/1024/1024}MiB`:`${maxBytes.toLocaleString('en-US')} 字节`;
 return {maxBytes,label};
}
export function videoUploadHint(serverPolicy){const extensions=serverPolicy?.replayExtensions||['.mp4','.webm'];return `支持 ${extensions.map(x=>x.toLowerCase()==='.webm'?'WebM':x.replace('.','').toUpperCase()).join('、')}，单个视频最大 ${videoUploadLimits(serverPolicy).label}`;}
