const crypto=require('node:crypto');
function contentRevision(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
module.exports={contentRevision};
