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
    const Runtime = readClass('../runtime/0.1.9-alpha/extension.js', 'Tilero', {
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
    const Entry = readClass('../production/extension.js', 'TileroExtension', {Extension, Runtime});
    const extension = new Entry();
    assert.equal(extension.enable(), undefined);
    extension.enable();
    assert.equal(extension.disable(), undefined);
    extension.disable();
    assert.deepEqual(events, [['construct', 'test', '/mock/runtime'], 'enable', 'disable']);
});
