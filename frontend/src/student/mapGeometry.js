// These segments live wholly outside the clickable node rectangles. Learning
// order is the DOM order, independently of the visual snake's row direction.
export function mapSegments(nodes,{width,narrow=false,clearance=9,laneInset=10}){
 const point=(x,y)=>`${Math.round(x*100)/100} ${Math.round(y*100)/100}`;
 return nodes.slice(1).map((node,i)=>{
  const previous=nodes[i];let start,end,d,kind;
  if(narrow){
   start={x:previous.left+previous.width/2,y:previous.bottom+clearance};end={x:node.left+node.width/2,y:node.top-clearance};
   const middle=(start.y+end.y)/2;d=`M ${point(start.x,start.y)} C ${point(start.x,middle)} ${point(end.x,middle)} ${point(end.x,end.y)}`;kind='vertical';
  }else if(previous.row===node.row){
   const direction=node.left>previous.left?1:-1;
   start={x:direction===1?previous.right+clearance:previous.left-clearance,y:previous.padY};end={x:direction===1?node.left-clearance:node.right+clearance,y:node.padY};
   const middle=(start.x+end.x)/2;d=`M ${point(start.x,start.y)} C ${point(middle,start.y)} ${point(middle,end.y)} ${point(end.x,end.y)}`;kind='row';
  }else{
   const right=previous.row%2===0,lane=right?width-laneInset:laneInset;
   start={x:right?previous.right+clearance:previous.left-clearance,y:previous.padY};end={x:right?node.right+clearance:node.left-clearance,y:node.padY};
   const radius=Math.min(18,Math.abs(lane-start.x),Math.abs(lane-end.x),(end.y-start.y)/4);
   const side=right?1:-1;
   d=`M ${point(start.x,start.y)} L ${point(lane-side*radius,start.y)} Q ${point(lane,start.y)} ${point(lane,start.y+radius)} L ${point(lane,end.y-radius)} Q ${point(lane,end.y)} ${point(lane-side*radius,end.y)} L ${point(end.x,end.y)}`;kind=right?'turn-right':'turn-left';
  }
  return {from:previous.id,to:node.id,kind,start,end,d};
 });
}
