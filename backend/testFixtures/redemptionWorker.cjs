const app=require('../app');const server=app.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
process.on('message',message=>{if(message==='stop')server.close(()=>process.exit(0));});
