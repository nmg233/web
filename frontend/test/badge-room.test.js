import test from 'node:test';import assert from 'node:assert/strict';
import {badgeRoomItems,selectedBadge,badgeRoomReturn} from '../src/student/badgeRoomModel.js';
import {beginGesture,moveGesture,endGesture,cancelGesture,consumeGestureClick} from '../src/student/space/robotGesture.js';
import {clampRobot} from '../src/student/space/useRobotPosition.js';
const event=(fields={})=>({button:0,isPrimary:true,pointerId:1,clientX:40,clientY:50,timeStamp:100,...fields});
test('陈列室只组织本人DTO；历史安全快照保留，锁定定义不重复已获课时',()=>{
 const data={grants:[{id:'g1',lesson_id:2,accessible:false,name:'历史'}],locked:[{lessonId:2,definition:{name:'重复'}},{lessonId:3,definition:null},{lessonId:4,definition:{name:'授权定义',art_id:'theory'},checks:[]}],exchanges:[{id:'demo'}]};
 const items=badgeRoomItems(data);assert.equal(items.earned.length,1);assert.equal(items.earned[0].accessible,false);assert.deepEqual(items.locked.map(b=>b.lesson_id),[4]);assert.equal(selectedBadge(items,'grant:g1').name,'历史');assert.equal(selectedBadge(items,'grant:other'),null);assert.deepEqual(badgeRoomItems(null),{earned:[],locked:[]});
});
test('鼠标click与触屏pointerup去重，拖动抑制只消费一次，下一手势及键盘不被残留阻止',()=>{
 const state={};beginGesture(state,event(),{x:80,y:90});assert.equal(moveGesture(state,event({clientX:44})),null);assert.equal(endGesture(state,event({timeStamp:110})),false);assert.equal(consumeGestureClick(state,{detail:1,timeStamp:112}),false);
 beginGesture(state,event({pointerType:'touch'}),{x:80,y:90});assert.deepEqual(moveGesture(state,event({clientX:70})),{x:110,y:90});assert.equal(endGesture(state,event({timeStamp:150})),true);assert.equal(consumeGestureClick(state,{detail:1,timeStamp:151}),true);
 assert.equal(consumeGestureClick(state,{detail:1,timeStamp:152}),false);beginGesture(state,event(),{x:0,y:0});moveGesture(state,event({clientY:100}));endGesture(state,event({timeStamp:180}));assert.equal(consumeGestureClick(state,{detail:0,timeStamp:181}),false);
 beginGesture(state,event(),{x:0,y:0});moveGesture(state,event({clientY:100}));cancelGesture(state);assert.equal(state.drag,null);assert.equal(consumeGestureClick(state,{detail:1,timeStamp:200}),false);
 beginGesture(state,event({pointerType:'touch'}),{x:0,y:0});endGesture(state,event({pointerType:'touch',timeStamp:220}));assert.equal(consumeGestureClick(state,{detail:0,pointerType:'touch',timeStamp:221}),true);
 beginGesture(state,event({pointerType:'touch'}),{x:0,y:0});endGesture(state,event({pointerType:'touch',timeStamp:240}));assert.equal(consumeGestureClick(state,{detail:0,timeStamp:241}),false);
});
test('账号页返回仅允许我的及已校验来源课程，不放行外站、递归或任意路径',()=>{
 const source='/me?returnTo='+encodeURIComponent('/courses/52/lessons/6/learn?stage=1&cardId=9');assert.equal(badgeRoomReturn(source),source);
 for(const value of ['https://evil.invalid/me','//evil.invalid/me','/me/badges','/me?returnTo=//evil.invalid','/me?returnTo=/me/badges',null])assert.equal(badgeRoomReturn(value),'/me');
});
test('次要指针不接管，超时抑制不吞后续点击；短屏及视觉视口夹紧',()=>{
 const state={};assert.equal(beginGesture(state,event({isPrimary:false}),{}),false);beginGesture(state,event(),{x:0,y:0});assert.equal(moveGesture(state,event({pointerId:2,clientX:100})),null);moveGesture(state,event({clientX:100}));endGesture(state,event({timeStamp:200}));assert.equal(consumeGestureClick(state,{detail:1,timeStamp:1000}),false);
 for(const b of [{left:0,top:0,width:360,height:800},{left:0,top:90,width:844,height:260}]){const p=clampRobot({x:9000,y:9000},b,80);assert.ok(p.x+80<=b.left+b.width);assert.ok(p.y+80<=b.top+b.height);assert.ok(p.x>=b.left&&p.y>=b.top);}
});
