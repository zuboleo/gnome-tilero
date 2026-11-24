import test from 'node:test';
import assert from 'node:assert/strict';
import {hintOffset,hintRect,effectiveGaps,tiles,resizedRatios,defaultRatios} from '../runtime/0.1.9-alpha/layout.js';
const a={x:0,y:32,width:1920,height:1048};
test('outward hint is 1px for width 1–2, 2px for width 3 and higher',()=>{assert.deepEqual([0,1,2,3,4,8,12].map(hintOffset),[0,1,1,2,2,2,2]);});
test('expanded focus outline covers original frame edge',()=>{assert.deepEqual(hintRect({x:10,y:10,width:100,height:100},3),{x:8,y:8,width:104,height:104});});
test('single outline leaves exact configured space to work area and neighbor',()=>{for(const w of [1,2,3,4,12])for(const gap of [0,8,16]){const g=effectiveGaps(gap,gap,w);const [first,second]=tiles(a,2,g.outer,g.inner);const h=hintRect(first,w);assert.equal(h.x-a.x,gap);assert.equal(second.x-h.x-h.width,gap);}});
test('no focus compensation when hints disabled',()=>{assert.deepEqual(effectiveGaps(8,8,3,false),{outer:8,inner:8,offset:0});});
test('manual resize uses compensated gap and retains ratio',()=>{const {outer,inner}=effectiveGaps(8,8,3);const rs=tiles(a,2,outer,inner);const after={...rs[0],width:Math.round((a.width-2*outer-inner)*.7)};assert.ok(Math.abs(resizedRatios(a,rs,0,after,outer,inner,defaultRatios()).main-.7)<.001);});
