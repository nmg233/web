// Isolated test process only. Production app/routes contain no clock override.
const {dailyFortune}=require('../../backend/services/dailyFortune');
let time='2026-12-06T15:59:59.000Z';
require('../../backend/services/dailyFortune').dailyFortune=id=>dailyFortune(id,new Date(time));
const server=require('../../backend/app').listen(Number(process.env.PORT),'127.0.0.1',()=>process.send({ready:true}));
process.on('message',message=>{
  if(message.type==='clock'){time=message.time;process.send({clock:time});}
  if(message.type==='stop')server.close(()=>process.exit(0));
});
