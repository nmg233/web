function dimensions(b,ext){
 if(ext==='.png'&&b.length>=45&&b.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&b.toString('ascii',12,16)==='IHDR'&&b.includes(Buffer.from('IEND')))return[b.readUInt32BE(16),b.readUInt32BE(20)];
 if(['.jpg','.jpeg'].includes(ext)&&b.length>100&&b[b.length-2]===255&&b[b.length-1]===217){
  let offset=2;while(offset+4<b.length){if(b[offset]!==255)return null;const marker=b[offset+1];if(marker===0xda)break;if(marker===0xff){offset++;continue;}const size=b.readUInt16BE(offset+2);if(size<2||offset+size+2>b.length)return null;if([0xc0,0xc1,0xc2].includes(marker)&&size>=8)return[b.readUInt16BE(offset+7),b.readUInt16BE(offset+5)];offset+=size+2;}
 }
 if(ext==='.webp'&&b.length>=30&&b.readUInt32LE(4)+8===b.length){
  const type=b.toString('ascii',12,16);
  if(type==='VP8L'&&b[20]===47){const bits=b.readUInt32LE(21);return[1+(bits&0x3fff),1+((bits>>>14)&0x3fff)];}
  if(type==='VP8 '&&b.subarray(23,26).toString('hex')==='9d012a')return[b.readUInt16LE(26)&0x3fff,b.readUInt16LE(28)&0x3fff];
  if(type==='VP8X')return[1+b.readUIntLE(24,3),1+b.readUIntLE(27,3)];
 }
 return null;
}
function validateCover(b,ext){const size=dimensions(b,ext);return size&&size.every(n=>n>0)&&size[0]*size[1]<=16000000;}
module.exports={validateCover};
