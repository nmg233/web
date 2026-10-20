// No query strings, response bodies, error messages, stacks or credentials in logs.
function errorSummary(err){return {name:'Error',code:/^[A-Z][A-Z0-9_]{1,48}$/.test(err?.code||'')?err.code:'INTERNAL_ERROR'};}
function responseSummary(req,status){return {event:'api_response',method:['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(req.method)?req.method:'OTHER',route:typeof req.route?.path==='string'?req.route.path.replace(/[^A-Za-z0-9_/:.*-]/g,'').slice(0,160):'unmatched',status:Number(status)};}
module.exports={errorSummary,responseSummary};
