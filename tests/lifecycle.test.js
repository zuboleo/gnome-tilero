import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

function readClass(path, name, bindings) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
        .replace(/^import .*;\s*$/gm, '')
        .replace('export default class', 'class');
    return new Function(...Object.keys(bindings), source + '\nreturn ' + name + ';')
        (...Object.values(bindings));
}

test('disable frees all tracked resources even if one cleanup fails', () => {
    const calls = [];
    const Runtime = readClass('../runtime/extension.js', 'Tilero', {
        GLib: {Source: {remove(id) {
            calls.push('source:' + id);
            if (id === 1) throw Error('simulated source failure');
        }}},
        Main: {wm: {removeKeybinding(key) { calls.push('key:' + key); }}},
        console: {error() {}},
    });
    const r = new Runtime();
    const object = {disconnect(id) { calls.push('signal:' + id); }};
    const actor = {
        remove_transition(name) { calls.push(name); },
        translation_x: 10, translation_y: 20,
    };
    const widget = name => ({destroy() { calls.push(name); }});
    Object.assign(r, {
        _alive: true, _sources: new Set([1, 2]), _keys: ['toggle-tiling'],
        _signals: [[object, 3]], _records: new Map([[1, {signals: [[object, 4]]}]]),
        _animations: new Map([[actor, true]]), _groups: new Map([[1, 2]]),
        _dirty: new Set([1]), _paused: new Set([1]), _hint: widget('hint'),
        _panel: widget('panel'), _icon: {}, _globalSwitch: {}, _workspaceSwitch: {},
        _flushId: 2, _pulseId: 1, _nativeEdge: null,
    });
    r.disable();
    assert.deepEqual(calls, ['source:1', 'source:2', 'key:toggle-tiling',
        'signal:3', 'signal:4', 'translation-x', 'translation-y', 'hint', 'panel']);
    assert.equal(r._alive, false);
    for (const field of ['_sources', '_records', '_groups', '_dirty', '_paused', '_animations'])
        assert.equal(r[field].size, 0);
    for (const field of ['_hint', '_panel', '_icon', '_globalSwitch', '_workspaceSwitch', '_settings', '_tracker'])
        assert.equal(r[field], null);
    assert.equal(r._flushId, 0);
    assert.equal(r._pulseId, 0);
    assert.equal(actor.translation_x, 0);
    assert.equal(actor.translation_y, 0);
    r.disable();
    assert.equal(calls.length, 9, 'disable is idempotent');
});

test('production entry point is synchronous and does not expose reload', () => {
    const events = [];
    class Runtime {
        constructor(host, release, path) {
            events.push(['construct', release.version, path]);
            assert.equal(typeof host.reload, 'undefined');
        }
        enable() { events.push('enable'); }
        disable() { events.push('disable'); }
    }
    class Extension {
        constructor() { this.metadata = {'version-name': 'test'}; this.path = '/mock'; }
    }
    const Entry = readClass('../extension.js', 'TileroExtension', {Extension, Runtime});
    const extension = new Entry();
    assert.equal(extension.enable(), undefined);
    extension.enable();
    assert.equal(extension.disable(), undefined);
    extension.disable();
    assert.deepEqual(events, [['construct', 'test', '/mock/runtime'], 'enable', 'disable']);
});

test('overlapping mapped popup is above the focus hint; close restores normal layer', () => {
    const calls = [];
    const group = {
        set_child_below_sibling(h, a) { calls.push(['below', h, a]); },
        set_child_above_sibling(h, a) { calls.push(['above', h, a]); },
    };
    const owner = {mapped: true};
    const popup = {mapped: true, meta_window: {
        get_window_type: () => 3, is_override_redirect: () => false,
        get_frame_rect: () => ({x: 80, y: 20, width: 50, height: 50}),
    }};
    const Meta = {WindowType: {NORMAL: 0, POPUP_MENU: 3}};
    const Runtime = readClass('../runtime/extension.js', 'Tilero', {
        Meta, global: {window_group: group, get_window_actors: () => [owner, popup]},
    });
    const runtime = new Runtime();
    runtime._hint = {};
    const frame = {x: 0, y: 0, width: 100, height: 100};
    runtime._stackHint(owner, frame);
    popup.mapped = false;
    runtime._stackHint(owner, frame);
    popup.mapped = true;
    popup.meta_window.get_frame_rect = () => ({x: 200, y: 200, width: 10, height: 10});
    runtime._stackHint(owner, frame);
    assert.deepEqual(calls.map(c => c[0]), ['below', 'above', 'above']);
});

test('focus hint uses actual monitor instead of assigned tile monitor', async()=>{
    const {hintRect}=await import('../runtime/layout.js');
    const calls=[];
    const group={};
    const actor={get_parent:()=>group};
    let monitor=1;
    const workspace={get_work_area_for_monitor(m){
        calls.push(['area',m]);
        return {x:1920,y:32,width:1920,height:1048};
    }};
    const w={
        get_workspace:()=>workspace, get_monitor:()=>monitor,
        get_frame_rect:()=>({x:1920,y:32,width:800,height:600}),
        get_compositor_private:()=>actor, minimized:false,
        is_fullscreen:()=>false, showing_on_its_workspace:()=>true,
    };
    const Runtime=readClass('../runtime/extension.js','Tilero',{
        Main:{overview:{visible:false},sessionMode:{isLocked:false}},
        global:{window_group:group,display:{get_n_monitors:()=>2}},
        hintRect,
    });
    const r=new Runtime();
    Object.assign(r,{
        _focusRoot:()=>w, _records:new Map([[w,{g:{m:0}}]]),
        _normal:()=>true,_active:()=>true,_stackHint:()=>{},
        _settings:{get_boolean:()=>true,get_int:k=>k==='hint-width'?3:8,get_string:()=> 'system'},
        _hint:{set_style(){},set_position(x,y){calls.push(['position',x,y]);},
            set_size(w,h){calls.push(['size',w,h]);},show(){calls.push(['show']);},hide(){calls.push(['hide']);}},
    });
    r._updateHint();
    assert.deepEqual(calls,[['area',1],['position',1920,32],['size',802,602],['show']]);
    monitor=-1;
    r._updateHint();
    assert.deepEqual(calls.at(-1),['hide']);
});
