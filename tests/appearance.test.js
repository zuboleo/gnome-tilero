import test from 'node:test';
import assert from 'node:assert/strict';
import {hintOffset,hintRect,effectiveGaps,tiles,resizedRatios,defaultRatios} from '../runtime/layout.js';
const a={x:0,y:32,width:1920,height:1048};
test('outward hint is 1px for width 1–2, 2px for width 3 and higher',()=>{assert.deepEqual([0,1,2,3,4,8,12].map(hintOffset),[0,1,1,2,2,2,2]);});
test('expanded focus outline covers original frame edge',()=>{assert.deepEqual(hintRect({x:10,y:10,width:100,height:100},3),{x:8,y:8,width:104,height:104});});
test('single outline leaves exact configured space to work area and neighbor',()=>{for(const w of [1,2,3,4,12])for(const gap of [0,8,16]){const g=effectiveGaps(gap,gap,w);const [first,second]=tiles(a,2,g.outer,g.inner);const h=hintRect(first,w);assert.equal(h.x-a.x,gap);assert.equal(second.x-h.x-h.width,gap);}});
test('no focus compensation when hints disabled',()=>{assert.deepEqual(effectiveGaps(8,8,3,false),{outer:8,inner:8,offset:0});});
test('manual resize uses compensated gap and retains ratio',()=>{const {outer,inner}=effectiveGaps(8,8,3);const rs=tiles(a,2,outer,inner);const after={...rs[0],width:Math.round((a.width-2*outer-inner)*.7)};assert.ok(Math.abs(resizedRatios(a,rs,0,after,outer,inner,defaultRatios()).main-.7)<.001);});

test('maximized window outline stays in the work area on every edge',()=>{
    for(const width of [1,2,3,4,12])
        assert.deepEqual(hintRect(a,width,a),a);
});
test('top panel limits only the top outward offset',()=>{
    assert.deepEqual(hintRect({x:100,y:32,width:600,height:400},3,a),
        {x:98,y:32,width:604,height:402});
});
test('normal tile keeps its offset and exact gaps with bounds enabled',()=>{
    for(const width of [1,2,3,4,12])for(const gap of [0,8,16]){
        const g=effectiveGaps(gap,gap,width);
        for(const tile of tiles(a,4,g.outer,g.inner))
            assert.deepEqual(hintRect(tile,width,a),hintRect(tile,width));
    }
});
test('negative coordinates and portrait monitor are supported',()=>{
    const area={x:-1080,y:-200,width:1080,height:1900};
    assert.deepEqual(hintRect({x:-1080,y:100,width:500,height:700},4,area),
        {x:-1080,y:98,width:502,height:704});
});
test('partly offscreen window outline is bounded without moving the frame',()=>{
    const frame={x:-10,y:20,width:400,height:500};
    assert.deepEqual(hintRect(frame,3,a),{x:0,y:32,width:392,height:490});
    assert.deepEqual(frame,{x:-10,y:20,width:400,height:500});
});
test('no visible outline when frame is outside or work area is invalid',()=>{
    assert.equal(hintRect({x:-100,y:100,width:100,height:100},3,a),null);
    assert.equal(hintRect({x:100,y:100,width:100,height:100},3,{...a,width:0}),null);
    assert.equal(hintRect({x:1918,y:100,width:100,height:100},3,a),null);
});
