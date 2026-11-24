import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

function fixture() {
    const timers = new Map();
    const actor = {};
    const children = [actor];
    let nextId = 0, finished = 0;
    class Widget {
        constructor(props) {Object.assign(this, props); this.children = [];}
        add_child(child) {this.children.push(child);}
        set_position(x,y) {this.position = [x,y];}
        set_size(w,h) {this.size = [w,h];}
        ease(opts) {this.transition = opts;}
        remove_all_transitions() {this.transition?.onStopped?.();}
        destroy() {this.destroyed = true; const i = children.indexOf(this); if(i >= 0) children.splice(i,1);}
    }
    const group = {
        get_children: () => [...children],
        insert_child_above(c,a) {children.splice(children.indexOf(a)+1,0,c);},
        set_child_above_sibling(c,a) {children.splice(children.indexOf(c),1); children.splice(children.indexOf(a)+1,0,c);},
    };
    const source = readFileSync(new URL('../runtime/startup-cover.js',import.meta.url),'utf8')
        .replace(/^import .*;\s*$/gm,'').replace('export class','class');
    const Cover = new Function('St','Clutter',source+'\nreturn StartupCover;')({Widget},
        {AnimationMode:{EASE_IN_OUT_QUAD:1,EASE_OUT_QUAD:2}});
    let cover;
    cover = new Cover({group, actor, radius:8, light:false,
        later:(ms,fn)=>{timers.set(++nextId,{ms,fn});return nextId;},
        cancel:id=>timers.delete(id),
        finish:()=>{finished++;cover.destroy();}});
    const run = ms => {for(const [id,t] of timers)if(t.ms===ms){timers.delete(id);t.fn();return;}};
    return {cover, actor, children, timers, run, finished:()=>finished};
}

test('gradient cover tracks window frame without changing the client',()=>{
    const f=fixture();
    const base=f.cover._base;
    f.cover.update({x:10,y:20,width:400,height:250});
    assert.deepEqual(base.position,[10,20]);
    assert.deepEqual(base.size,[400,250]);
    assert.equal(base.reactive,false);
    assert.deepEqual(f.actor,{});
    f.cover.destroy();
    assert.deepEqual(f.children,[f.actor]);
});
test('gradient hold and fade have a hard timeout',()=>{
    const f=fixture(); const base=f.cover._base;
    f.cover.start(); assert.deepEqual([...f.timers.values()].map(t=>t.ms),[400,700]);
    f.run(400); assert.equal(base.transition.duration,150);
    f.run(700); assert.equal(f.finished(),1);
    assert.equal(f.timers.size,0); assert.equal(base.destroyed,true);
});
test('early disable cancels transition and both timers without reentry',()=>{
    const f=fixture(); f.cover.start(); f.run(400);
    const base=f.cover._base; f.cover.destroy(); f.cover.destroy();
    assert.equal(f.finished(),0); assert.equal(f.timers.size,0); assert.equal(base.destroyed,true);
});
