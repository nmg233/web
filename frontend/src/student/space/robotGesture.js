export function beginGesture(state,event,position){
 if(event.button!==0||!event.isPrimary)return false;
 state.blocked=null;state.drag={pointer:event.pointerId,x:event.clientX,y:event.clientY,start:position,moved:false};return true;
}
export function moveGesture(state,event){
 const d=state.drag;if(!d||d.pointer!==event.pointerId)return null;
 const dx=event.clientX-d.x,dy=event.clientY-d.y;if(Math.hypot(dx,dy)>6)d.moved=true;
 return d.moved?{x:d.start.x+dx,y:d.start.y+dy}:null;
}
export function endGesture(state,event){
 const d=state.drag;if(!d||d.pointer!==event.pointerId)return false;
 state.blocked=d.moved?{time:event.timeStamp}:event.pointerType==='touch'?{time:event.timeStamp,kind:'touch-tap'}:null;state.drag=null;return d.moved;
}
export function cancelGesture(state){state.drag=null;state.blocked=null;}
export function consumeGestureClick(state,event){
 const block=state.blocked;state.blocked=null;
 const touch=(event.pointerType||event.nativeEvent?.pointerType)==='touch';
 return !!block&&(event.detail!==0||(block.kind==='touch-tap'&&touch))&&event.timeStamp>=block.time&&event.timeStamp-block.time<600;
}
