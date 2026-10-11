import {useEffect,useRef,useState} from 'react';
import {beginGesture,moveGesture,endGesture,cancelGesture,consumeGestureClick} from './robotGesture.js';
const KEY='pbl:robot-position:v1';
export function robotBounds(){const v=window.visualViewport;return {left:v?.offsetLeft||0,top:v?.offsetTop||0,width:v?.width||innerWidth,height:v?.height||innerHeight};}
export function clampRobot(p,b,size){const minX=b.left+12,maxX=Math.max(minX,b.left+b.width-size-12),minY=b.top+Math.min(132,Math.max(12,b.height-size-32)),maxY=Math.max(minY,b.top+b.height-size-20);return{x:Math.min(maxX,Math.max(minX,p.x)),y:Math.min(maxY,Math.max(minY,p.y))};}
const defaultPosition=b=>({x:b.left+b.width-102,y:b.top+b.height-120});
export default function useRobotPosition(size){
 const [position,setPosition]=useState(()=>{const b=robotBounds();let p=defaultPosition(b);try{const saved=JSON.parse(localStorage.getItem(KEY));if(Number.isFinite(saved?.x)&&Number.isFinite(saved?.y))p=saved;}catch{/* UI preference is optional. */}return clampRobot(p,b,size);});
 const gesture=useRef({drag:null,blocked:null}),current=useRef(position);
 const moveTo=p=>{const next=clampRobot(p,robotBounds(),size);current.current=next;setPosition(next);return next;};
 const persist=p=>{try{localStorage.setItem(KEY,JSON.stringify(p));}catch{/* No teaching/reward storage dependency. */}};
 useEffect(()=>{const resize=()=>{setPosition(p=>{const next=clampRobot(p,robotBounds(),size);current.current=next;return next;});};resize();window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);return()=>{window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);};},[size]);
 return {position,reset(){const p=moveTo(defaultPosition(robotBounds()));persist(p);},
  pointerDown(e){if(beginGesture(gesture.current,e,current.current))e.currentTarget.setPointerCapture(e.pointerId);},
  pointerMove(e){const p=moveGesture(gesture.current,e);if(p)moveTo(p);},
  pointerUp(e){const d=gesture.current.drag,tap=d?.pointer===e.pointerId&&!d.moved&&e.pointerType==='touch';if(endGesture(gesture.current,e))persist(current.current);return tap;},
  pointerCancel(){cancelGesture(gesture.current);persist(current.current);},
  lostPointerCapture(){if(gesture.current.drag){cancelGesture(gesture.current);persist(current.current);}},
  consumeClick(e){return consumeGestureClick(gesture.current,e);}
 };
}
