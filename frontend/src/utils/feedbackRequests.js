// A definite 409 can rebase after explicit rechecking. An unknown result must
// keep its original identity so the server can acknowledge the same write.
export function createFeedbackRequests(){
 const entries=new Map(),conflicts=new Set();let last=null;
 return{
  meta(revision,payload={},draftKey){
   last=draftKey?'draft:'+draftKey:'action:'+JSON.stringify(payload);
   if(!entries.has(last))entries.set(last,{expectedRevision:revision,request_key:draftKey||crypto.randomUUID()});
   return {...entries.get(last)};
  },
  conflicted(){if(last)conflicts.add(last);},
  rechecked(revision){for(const name of conflicts)entries.set(name,{expectedRevision:revision,request_key:crypto.randomUUID()});conflicts.clear();},
  acknowledged(){if(last){entries.delete(last);conflicts.delete(last);}last=null;},
 };
}
