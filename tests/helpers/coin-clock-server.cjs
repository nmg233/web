// Isolated browser fixture only. Never imported by the application/teaching tools.
if(process.env.NODE_ENV!=='test'||!process.argv[2])throw Error('Test-only clock requires disposable test process');
const fs=require('node:fs'),OriginalDate=Date,clockFile=process.argv[2];
const now=()=>OriginalDate.parse(fs.readFileSync(clockFile,'utf8'));
// Scope the injected clock to coin calculations. JWTs, refresh cleanup and all
// other application dates retain real time, so this replay is independent of today's date.
const modulePath=require.resolve('../../backend/services/studentCoins'),coins=require(modulePath);
require.cache[modulePath].exports={...coins,...coins.createCoinService(()=>new OriginalDate(now()))};
require('../../scripts/local-server.cjs');
