// Isolated browser fixture only. Never imported by the application/teaching tools.
if(process.env.NODE_ENV!=='test'||!process.argv[2])throw Error('Test-only clock requires disposable test process');
const fs=require('node:fs'),OriginalDate=Date,clockFile=process.argv[2];
const now=()=>OriginalDate.parse(fs.readFileSync(clockFile,'utf8'));
global.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[now()]));}static now(){return now();}};
require('../../scripts/local-server.cjs');
