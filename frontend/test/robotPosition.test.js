import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clampRobot} from '../src/student/space/useRobotPosition.js';
test('机器人可见边界包含视觉视口偏移，缩屏和键盘压缩后重新夹紧',()=>{
 const b={left:0,top:0,width:390,height:844};assert.deepEqual(clampRobot({x:-30,y:-30},b,64),{x:12,y:132});assert.deepEqual(clampRobot({x:1000,y:1000},b,64),{x:314,y:760});
 const keyboard={left:5,top:160,width:360,height:180},p=clampRobot({x:999,y:999},keyboard,64);assert.ok(p.x>=keyboard.left&&p.x+64<=keyboard.left+keyboard.width);assert.ok(p.y>=keyboard.top&&p.y+64<=keyboard.top+keyboard.height);
});
