import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as layout from '../layout.js';

// Exercise actual extension methods with a deterministic Mutter stand-in.
// This is not a compositor integration test; geometry commits here are synchronous.
const source=readFileSync(new URL('../runtime/extension.js',import.meta.url),'utf8')
    .replace(/^import .*;\s*$/gm,'').replace('export default class Tilero','class Tilero');
const Meta={GrabOp:{MOVING:1,MOVING_UNCONSTRAINED:1025,KEYBOARD_MOVING:257,RESIZING_E:8193}};
const geometry=[{x:0,y:0,width:1920,height:1080},{x:1920,y:0,width:1920,height:1080}];
function fixture(){
    const mock={display:{get_monitor_geometry:m=>geometry[m],get_n_monitors:()=>2},get_pointer:()=>[...mock.pointer],pointer:[2200,400]};
    const Klass=new Function('Extension','Meta','global','GLib',...Object.keys(layout),`${source}\nreturn Tilero;`)(class {},Meta,mock,{get_monotonic_time:()=>10000000},...Object.values(layout));
    const ext=new Klass(), ws={get_work_area_for_monitor:m=>geometry[m]}, otherWs={get_work_area_for_monitor:m=>geometry[m]};
    const pending=[],dirty=new Set();
    Object.assign(ext,{_records:new Map(),_groups:new Map(),_grab:null,_active:()=>true,_eligible:()=>true,_order:()=>[0,1],_settings:{get_int:()=>8},_mark:g=>dirty.add(g),_cancel:()=>{},_later:(_ms,fn)=>{pending.push(fn);return pending.length;},_pulse:()=>{},_updateHint:()=>{},_apply:(r,t)=>{r.w.frame={...t};r.w.monitor=r.g.m;}});
    function add(m,workspace=ws){const w={monitor:m,frame:{...geometry[m]},max:false,full:false,minimized:false,get_monitor(){return this.monitor;},get_frame_rect(){return this.frame;},workspace,get_workspace(){return this.workspace;},is_maximized(){return this.max;},is_fullscreen(){return this.full;},unmaximize(){this.max=false;},move_to_monitor(m){this.monitor=m;}};
        const g=ext._group(workspace,m),r={w,g,workspace,mode:'tiled'};g.items.push(r);ext._records.set(w,r);ext._layout(g);return r;}
    function flush(){while(pending.length)pending.shift()();while(dirty.size){const groups=[...dirty];dirty.clear();groups.forEach(g=>ext._layout(g));}}
    function drag(r,m,{max=false,reported=m}={}){ext._grabBegin(r.w,Meta.GrabOp.MOVING);r.w.monitor=reported;r.w.max=max;mock.pointer=[geometry[m].x+250,400];ext._grabEnd(r.w);flush();}
    return {ext,ws,otherWs,mock,add,flush,drag,dirty};
}
test('drag to occupied monitor inserts; source is empty, not swapped',()=>{const {add,drag}=fixture();const a=add(0),b=add(1),src=a.g,dst=b.g;drag(a,1);assert.deepEqual(src.items,[]);assert.deepEqual(dst.items,[b,a]);assert.equal(a.g,dst);assert.equal(b.w.monitor,1);assert.equal(a.w.frame.width,948);});
test('remaining window expands to full work area after transfer; other workspace untouched',()=>{const {add,drag,otherWs}=fixture();const a=add(0),b=add(1),c=add(0),other=add(0,otherWs),before={...other.w.frame};drag(c,1);assert.deepEqual(a.g.items,[a]);assert.deepEqual(a.w.frame,layout.tiles(geometry[0],1)[0]);assert.deepEqual(b.g.items,[b,c]);assert.deepEqual(other.w.frame,before);});
test('native maximized drop still updates ownership and expands source',()=>{const {add,drag,ext,flush}=fixture();const a=add(0),b=add(1),c=add(0);drag(c,1,{max:true});assert.equal(c.g,b.g);assert.equal(c.w.max,false);assert.deepEqual(a.w.frame,layout.tiles(geometry[0],1)[0]);assert.deepEqual(c.w.frame,layout.tiles(geometry[1],2)[1]);});
test('drop uses pointer monitor when compositor still reports source',()=>{const {add,drag}=fixture();const a=add(0),b=add(1);drag(a,1,{reported:0});assert.equal(a.g,b.g);assert.equal(a.w.monitor,1);});
test('full destination leaves moved window floating and source expands',()=>{const {add,drag}=fixture();const a=add(0),c=add(0),dst=add(1).g;add(1);add(1);add(1);drag(c,1);assert.equal(c.g,null);assert.equal(c.mode,'floating');assert.equal(c.w.monitor,1);assert.equal(dst.items.length,4);assert.deepEqual(a.w.frame,layout.tiles(geometry[0],1)[0]);});
test('same-monitor drop still swaps tiles',()=>{const {add,ext,mock,flush}=fixture();const a=add(0),b=add(0);ext._grabBegin(a.w,Meta.GrabOp.MOVING);mock.pointer=[1500,400];ext._grabEnd(a.w);flush();assert.deepEqual(a.g.items,[b,a]);});
test('ambient monitor change of maximized window restores its original monitor without changing ownership',()=>{const {add,ext,flush}=fixture();const a=add(0),b=add(1),c=add(0);c.w.max=true;c.w.monitor=1;ext._monitorChanged(c.w);flush();assert.equal(c.g,a.g);assert.equal(c.w.monitor,0);assert.deepEqual(b.g.items,[b]);});

test('existing maximized destination is restored to split after explicit insertion',()=>{const {add,drag,ext,flush}=fixture();const a=add(0),b=add(1),c=add(0);b.w.max=true;drag(c,1);assert.equal(b.w.max,false);assert.deepEqual(b.g.items,[b,c]);assert.deepEqual(a.w.frame,layout.tiles(geometry[0],1)[0]);assert.deepEqual(b.w.frame,layout.tiles(geometry[1],2)[0]);});

// Simulate compositor side effects, including late notifications after the grab finishes.
test('late monitor notification for unrelated destination window cannot exchange windows',()=>{const {add,drag,ext,flush}=fixture();const a=add(0),b=add(1),src=a.g,dst=b.g;drag(a,1);b.w.monitor=0;ext._monitorChanged(b.w);flush();assert.deepEqual(src.items,[]);assert.deepEqual(dst.items,[b,a]);assert.equal(b.w.monitor,1);assert.equal(a.w.monitor,1);});
test('late monitor notification for moved window cannot undo explicit transfer',()=>{const {add,drag,ext,flush}=fixture();const a=add(0),b=add(1),src=a.g;drag(a,1);a.w.monitor=0;ext._monitorChanged(a.w);flush();assert.deepEqual(src.items,[]);assert.deepEqual(b.g.items,[b,a]);assert.equal(a.w.monitor,1);});
test('workspace-changed without actual workspace change cannot reallocate any window',()=>{const {add,drag,ext,flush}=fixture();const a=add(0),b=add(1),src=a.g;drag(a,1);b.w.monitor=0;ext._workspaceChanged(b);ext._monitorChanged(b.w);flush();assert.deepEqual(src.items,[]);assert.deepEqual(b.g.items,[b,a]);assert.equal(b.w.monitor,1);});
test('monitor notifications from own placement do not schedule a transfer',()=>{const {add,ext,flush}=fixture();const a=add(0),b=add(1);b.applyingUntil=11000000;b.w.monitor=0;ext._monitorChanged(b.w);flush();assert.deepEqual(a.g.items,[a]);assert.deepEqual(b.g.items,[b]);});
test('notification for old ownership cannot affect a later explicit transfer',()=>{const {add,ext,flush}=fixture();const a=add(0),b=add(1),src=a.g;a.w.monitor=1;ext._monitorChanged(a.w);ext._transfer(a,1,null);flush();assert.deepEqual(src.items,[]);assert.deepEqual(b.g.items,[b,a]);});


// Native workspace transfer: only the selected record changes workspace ownership.
function moveWorkspace(ext,r,ws){r.w.workspace=ws;ext._workspaceChanged(r);}
test('workspace move expands source and inserts into destination on same monitor',()=>{const {ext,add,ws,otherWs,flush}=fixture();const a=add(0),b=add(0),c=add(0,otherWs),d=add(1,otherWs),before={...d.w.frame};moveWorkspace(ext,b,otherWs);flush();assert.deepEqual(a.g.items,[a]);assert.deepEqual(a.w.frame,layout.tiles(geometry[0],1)[0]);assert.deepEqual(c.g.items,[c,b]);assert.equal(b.g.ws,otherWs);assert.deepEqual(d.w.frame,before);assert.equal(b.w.monitor,0);});
test('workspace move from secondary monitor stays on secondary monitor',()=>{const {ext,add,otherWs,flush}=fixture();const a=add(1),b=add(1),c=add(0,otherWs);moveWorkspace(ext,a,otherWs);flush();assert.equal(a.g.m,1);assert.equal(a.g.ws,otherWs);assert.deepEqual(c.g.items,[c]);assert.deepEqual(b.w.frame,layout.tiles(geometry[1],1)[0]);});
test('full workspace destination does not search other monitors or evict',()=>{const {ext,add,otherWs,flush}=fixture();const a=add(0),b=add(0),dst=add(0,otherWs).g;add(0,otherWs);add(0,otherWs);add(0,otherWs);const before=[...dst.items];moveWorkspace(ext,a,otherWs);flush();assert.equal(a.g,null);assert.equal(a.mode,'floating');assert.deepEqual(dst.items,before);assert.equal(ext._group(otherWs,1,false),undefined);assert.deepEqual(b.w.frame,layout.tiles(geometry[0],1)[0]);});
test('floating window stays floating across workspaces and repeated signals',()=>{const {ext,add,otherWs,flush}=fixture();const a=add(0),b=add(0,otherWs);ext._detach(a,'floating');moveWorkspace(ext,a,otherWs);ext._workspaceChanged(a);flush();assert.equal(a.g,null);assert.equal(a.mode,'floating');assert.deepEqual(b.g.items,[b]);});
test('maximized tiled window moves reservation and returns to destination tile',()=>{const {ext,add,otherWs,flush}=fixture();const a=add(0),b=add(0),c=add(0,otherWs);a.w.max=true;moveWorkspace(ext,a,otherWs);flush();assert.equal(a.w.max,true);assert.deepEqual(c.g.items,[c,a]);assert.deepEqual(b.g.items,[b]);a.w.max=false;ext._stateChanged(a);flush();assert.deepEqual(a.w.frame,layout.tiles(geometry[0],2)[1]);});
test('layout before native workspace signal reconciles membership instead of dropping window',()=>{const {ext,add,otherWs,flush}=fixture();const a=add(0),b=add(0),c=add(0,otherWs);a.w.workspace=otherWs;ext._layout(b.g);ext._workspaceChanged(a);flush();assert.deepEqual(b.g.items,[b]);assert.deepEqual(c.g.items,[c,a]);});
test('move into paused workspace leaves window inactive and expands source',()=>{const {ext,add,otherWs,flush}=fixture();const a=add(0),b=add(0);ext._active=ws=>ws!==otherWs;moveWorkspace(ext,a,otherWs);flush();assert.equal(a.mode,'inactive');assert.equal(a.g,null);assert.deepEqual(b.w.frame,layout.tiles(geometry[0],1)[0]);});
test('dynamic workspace notification without changed areas does not retile',()=>{const {ext,add,otherWs,dirty}=fixture();add(0);add(1,otherWs);ext._workareasChanged();assert.equal(dirty.size,0);});
test('genuine changed work area only marks affected group',()=>{const {ext,add,otherWs,dirty}=fixture();const a=add(0),b=add(1,otherWs);otherWs.get_work_area_for_monitor=m=>({...geometry[m],height:1000});ext._workareasChanged();assert.deepEqual([...dirty],[b.g]);assert.equal(dirty.has(a.g),false);});
test('rapid workspace moves do not duplicate a record or alter unrelated group',()=>{const {ext,add,ws,otherWs,flush}=fixture();const a=add(0),b=add(0),c=add(0,otherWs);moveWorkspace(ext,a,otherWs);moveWorkspace(ext,a,ws);flush();assert.deepEqual(b.g.items,[b,a]);assert.deepEqual(c.g.items,[c]);});

// Exact report: ChatGPT + Chromium on A, terminal on B; native snap and a late
// physical movement of the terminal are simulated separately from membership.
test('reported three-window scenario retains terminal on B and splits both windows',()=>{const {add,drag,ext,flush}=fixture();const chat=add(0),browser=add(0),terminal=add(1);drag(browser,1,{max:true});terminal.w.monitor=0;terminal.w.max=true;ext._monitorChanged(terminal.w);flush();assert.deepEqual(chat.g.items,[chat]);assert.deepEqual(terminal.g.items,[terminal,browser]);assert.equal(browser.w.max,false);assert.equal(terminal.w.monitor,1);assert.deepEqual(chat.w.frame,layout.tiles(geometry[0],1)[0]);});
test('layouts on destination wait until active drag is finished',()=>{const {add,ext,mock,flush}=fixture();const a=add(0),b=add(1),c=add(0);ext._grabBegin(c.w,Meta.GrabOp.MOVING);ext._layout(b.g);assert.equal(ext._grab.deferred.has(b.g),true);mock.pointer=[2200,400];ext._grabEnd(c.w);flush();assert.deepEqual(a.g.items,[a]);assert.deepEqual(b.g.items,[b,c]);});
test('resize crossing a monitor boundary cannot change ownership',()=>{const {add,ext,flush}=fixture();const a=add(0),b=add(1);ext._grabBegin(a.w,Meta.GrabOp.RESIZING_E);a.w.monitor=1;ext._grabEnd(a.w);flush();assert.equal(a.g.m,0);assert.deepEqual(b.g.items,[b]);});
test('native edge setting is restored to original explicit value or default',()=>{const ext=fixture().ext;for(const previous of [null,{value:true}]){let restored='';const settings={get_boolean:()=>false,set_value:(k,v)=>{restored=v;},reset:()=>{restored='default';}};ext._nativeEdge={settings,previous};ext._restoreNativeEdge();assert.equal(restored,previous??'default');assert.equal(ext._nativeEdge,null);}});

test('real geometry application separates monitor transition from bounded resize retry',()=>{
    const {ext,add,flush}=fixture();const a=add(0),b=add(1);const target=layout.tiles(geometry[1],2)[1];
    // First resize request is ignored; verify retries after the staged monitor move.
    const apply=Object.getPrototypeOf(ext)._apply;ext._apply=apply;ext._motion=()=>false;
    a.g.items.splice(a.g.items.indexOf(a),1);a.g=b.g;b.g.items.push(a);
    let calls=0,moves=0;a.w.move_to_monitor=m=>{moves++;a.w.monitor=m;};
    a.w.move_resize_frame=(_user,x,y,width,height)=>{calls++;if(calls===2){a.w.frame={x,y,width,height};a.w.monitor=1;}};
    ext._apply(a,target);assert.equal(calls,0);assert.equal(moves,1);flush();
    assert.equal(calls,2);assert.equal(moves,1);assert.equal(a.g,b.g);assert.deepEqual(a.w.frame,target);
});


// Regression: two half-sized windows on each monitor, then drag one across.
for(const [from,to] of [[0,1],[1,0]])test(`2+2 becomes 1+3, monitor ${from} to ${to}`,()=>{
    const {add,drag}=fixture();const a=add(from),b=add(from),c=add(to),d=add(to);
    const src=a.g,dst=c.g;drag(b,to);
    assert.deepEqual(src.items,[a]);assert.deepEqual(dst.items,[c,d,b]);
    assert.deepEqual(a.w.frame,layout.tiles(geometry[from],1)[0]);
    assert.deepEqual(dst.items.map(r=>r.w.frame),layout.tiles(geometry[to],3));
    assert.equal(a.w.monitor,from);assert.ok(dst.items.every(r=>r.w.monitor===to));
});
test('2+2 to 1+3 chooses full-height half for existing tall window if necessary',()=>{
    const {add,drag}=fixture();const a=add(0),b=add(0),c=add(1),d=add(1);
    c.w.get_min_size=()=>[true,200,800];drag(b,1);
    assert.deepEqual(a.g.items,[a]);assert.deepEqual(d.g.items,[d,c,b]);
    assert.deepEqual(c.w.frame,layout.tiles(geometry[1],3)[1]);
});
test('2+2 to 1+3 chooses half for newcomer with large minimum height',()=>{
    const {add,drag}=fixture();const a=add(0),b=add(0),c=add(1),d=add(1);
    b.w.get_min_size=()=>[true,200,800];drag(b,1);
    assert.deepEqual(a.g.items,[a]);assert.deepEqual(c.g.items,[c,b,d]);
});
test('incompatible 3-window destination retains both existing windows, newcomer floats',()=>{
    const {add,drag}=fixture();const a=add(0),b=add(0),c=add(1),d=add(1);
    c.w.get_min_size=()=>[true,200,800];d.w.get_min_size=()=>[true,200,800];drag(b,1);
    assert.deepEqual(a.g.items,[a]);assert.deepEqual(c.g.items,[c,d]);assert.equal(b.mode,'floating');
});
function pendingWindow(f,{max=false,full=false}={}){const r=f.add(0);r.g.items.splice(r.g.items.indexOf(r),1);r.g=null;r.mode='pending';r.w.max=max;r.w.full=full;return r;}
test('newly opened maximized window is unmaximized and tiled after settling',()=>{
    const f=fixture(),r=pendingWindow(f,{max:true});f.ext._admit(r);assert.equal(r.mode,'pending');f.flush();assert.equal(r.mode,'tiled');assert.equal(r.w.max,false);
});
test('newly opened true fullscreen window stays native',()=>{
    const f=fixture(),r=pendingWindow(f,{full:true});f.ext._admit(r);f.flush();assert.equal(r.mode,'special');assert.equal(r.w.full,true);assert.equal(r.g,null);
});
test('unmaximize failure is bounded and does not allocate a fake tile',()=>{
    const f=fixture(),r=pendingWindow(f,{max:true});let attempts=0;r.w.unmaximize=()=>{attempts++;};f.ext._admit(r);f.flush();assert.equal(attempts,3);assert.equal(r.mode,'special');assert.equal(r.g,null);
});
test('user maximize of already tiled window preserves reservation',()=>{
    const f=fixture(),r=f.add(0);r.w.max=true;f.ext._stateChanged(r);f.flush();assert.equal(r.w.max,true);assert.equal(r.mode,'tiled');assert.equal(r.g.items[0],r);
});
