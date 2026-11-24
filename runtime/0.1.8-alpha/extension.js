import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {LIMIT, defaultRatios, monitorOrder, candidates, tiles, contains, sameRect, directionalIndex, resizedRatios, effectiveGaps, hintRect} from './layout.js';

const KEYS=['toggle-tiling','toggle-floating','swap-left','swap-right','swap-up','swap-down'];
const rect = r => ({x:r.x,y:r.y,width:r.width,height:r.height});
export default class AutoTiling {
    constructor(host, release, path) {this._host=host;this.metadata={...host?.metadata,'version-name':release?.version,version:release?.build};this.path=path;this.uuid=host?.uuid;}
    getSettings(){return this._host.getSettings();}
    openPreferences(){return this._host.openPreferences();}
    snapshot(){return {paused:[...this._paused],groups:[...this._groups.values()].flatMap(m=>[...m.values()].map(g=>({ws:g.ws,m:g.m,ratios:{...g.ratios},items:g.items.map(r=>r.w)}))),records:[...this._records.values()].map(r=>({w:r.w,mode:r.mode,saved:r.saved,workspace:r.workspace}))};}
    enable(snapshot=null) {
        this._settings=this.getSettings(); this._tracker=Shell.WindowTracker.get_default();
        this._records=new Map(); this._groups=new Map(); this._paused=new Set();
        this._signals=[]; this._sources=new Set(); this._dirty=new Set(); this._keys=[]; this._animations=new Map();
        this._alive=true; this._nativeEdge=null; this._grab=null; this._lastFocus=null; this._flushId=0;
        try {
            this._hint=new St.Widget({style_class:'auto-tiling-hint',reactive:false,can_focus:false,visible:false});
            global.window_group.add_child(this._hint);
            this._syncNativeEdge();
            this._buildPanel();
            console.log(`[Auto Tiling] enabled ${this.metadata['version-name']}`);
            this._connect(global.display,'window-created',(_d,w)=>this._watch(w,false));
            this._connect(global.display,'notify::focus-window',()=>this._focusChanged());
            this._connect(global.display,'grab-op-begin',(_d,w,op)=>this._grabBegin(w,op));
            this._connect(global.display,'grab-op-end',(_d,w)=>this._grabEnd(w));
            this._connect(global.display,'window-entered-monitor',(_d,_m,w)=>this._monitorChanged(w));
            this._connect(global.display,'workareas-changed',()=>this._workareasChanged());
            this._connect(global.workspace_manager,'active-workspace-changed',()=>{this._updatePanel();this._updateHint();});
            this._connect(global.workspace_manager,'workspace-removed',()=>this._prune());
            this._connect(Main.overview,'showing',()=>this._hint.hide());
            this._connect(Main.overview,'hidden',()=>this._updateHint());
            this._connect(Main.sessionMode,'updated',()=>this._updateHint());
            this._connect(this._settings,'changed',(_s,key)=>this._settingChanged(key));
            const actions=[()=>this._settings.set_boolean('auto-tiling',!this._enabled()),()=>this._toggleFloating(global.display.focus_window),()=>this._swapDirection(-1,0),()=>this._swapDirection(1,0),()=>this._swapDirection(0,-1),()=>this._swapDirection(0,1)];
            KEYS.forEach((key,i)=>{Main.wm.addKeybinding(key,this._settings,Meta.KeyBindingFlags.NONE,Shell.ActionMode.NORMAL,actions[i]);this._keys.push(key);});
            // One initial pass, separately for each actual workspace. Stable sequence = opening order.
            const windows=global.get_window_actors().map(a=>a.meta_window).filter(Boolean).sort((a,b)=>a.get_stable_sequence()-b.get_stable_sequence());
            if(snapshot)this._restoreSnapshot(snapshot,windows);else for(const w of windows)this._watch(w,true);
            this._focusChanged();
        } catch(e) {this.disable();throw e;}
    }
    disable() {
        this._alive=false;
        this._restoreNativeEdge();
        for(const id of this._sources??[])GLib.Source.remove(id);
        this._sources?.clear();
        for(const key of this._keys??[])Main.wm.removeKeybinding(key);
        for(const [o,id] of this._signals??[])try{o.disconnect(id);}catch{}
        for(const r of this._records?.values()??[])this._disconnectRecord(r);
        for(const a of this._animations?.keys()??[])this._stopAnimation(a);
        this._hint?.destroy();this._panel?.destroy();
        this._records?.clear();this._groups?.clear();this._dirty?.clear();this._paused?.clear();
        this._hint=null;this._panel=null;this._settings=null;this._tracker=null;this._primaryOnly=null;this._grab=null;this._lastFocus=null;
    }
    _connect(o,s,fn,record=null){const id=o.connect(s,(...args)=>{if(!this._alive)return;try{fn(...args);}catch(e){console.error('[Auto Tiling]',e);}});(record?record.signals:this._signals).push([o,id]);return id;}
    _later(ms,fn){let id=0;const run=()=>{this._sources.delete(id);if(this._alive)try{fn();}catch(e){console.error('[Auto Tiling]',e);}return GLib.SOURCE_REMOVE;};id=ms?GLib.timeout_add(GLib.PRIORITY_DEFAULT,ms,run):GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE,run);this._sources.add(id);return id;}
    _cancel(id){if(id&&this._sources.delete(id))GLib.Source.remove(id);}
    _disconnectRecord(r){this._cancel(r.readyId);this._cancel(r.verifyId);this._cancel(r.monitorId);this._cancel(r.stateId);for(const [o,id] of r.signals)try{o.disconnect(id);}catch{}r.signals=[];}
    // Do not run Mutter edge snapping and our own drag/drop placement together.
    // Restore the original user value (including an unset/default value) when paused/disabled.
    _syncNativeEdge(){
        if(!this._enabled()){this._restoreNativeEdge();return;}
        if(this._nativeEdge)return;
        const settings=new Gio.Settings({schema_id:'org.gnome.mutter'});
        if(!settings.get_boolean('edge-tiling'))return;
        this._nativeEdge={settings,previous:settings.get_user_value('edge-tiling')};
        settings.set_boolean('edge-tiling',false);
    }
    _restoreNativeEdge(){const saved=this._nativeEdge;this._nativeEdge=null;if(!saved)return;
        try{if(!saved.settings.get_boolean('edge-tiling')){if(saved.previous)saved.settings.set_value('edge-tiling',saved.previous);else saved.settings.reset('edge-tiling');}}catch(e){console.error('[Auto Tiling] restore edge-tiling',e);}
    }
    _trace(event,r=null,extra={}){
        if(!this._settings?.get_boolean?.('debug-transfers'))return;
        try{const identify=x=>({id:x.w.get_stable_sequence?.(),app:x.w.get_wm_class?.(),owner:x.g?.m??null,actual:x.w.get_monitor(),mode:x.mode,max:x.w.is_maximized(),fullscreen:x.w.is_fullscreen(),minSize:x.w.get_min_size?.(),frame:rect(x.w.get_frame_rect())});
        console.log(`[Auto Tiling] ${event} ${JSON.stringify({window:r?identify(r):null,...extra})}`);}catch(e){console.warn('[Auto Tiling] diagnostics unavailable',e);}
    }
    _traceGroups(event,r,groups,extra={}){this._trace(event,r,{...extra,groups:groups.map(g=>({monitor:g.m,windows:g.items.map(x=>({id:x.w.get_stable_sequence?.(),app:x.w.get_wm_class?.(),actual:x.w.get_monitor(),max:x.w.is_maximized(),fullscreen:x.w.is_fullscreen(),frame:rect(x.w.get_frame_rect()),minSize:x.w.get_min_size?.()}))}))});}
    _enabled(){return this._settings.get_boolean('auto-tiling');}
    _active(ws){return this._enabled()&&ws&&!this._paused.has(ws);}
    _motion(){
        const settings=St.Settings.get();
        if(!this._settings.get_boolean('animate')||settings.enable_animations===false)return false;
        // ReducedMotion was introduced in GNOME 51. On 50, respect enable_animations alone.
        if(St.ReducedMotion!==undefined&&settings.reducedMotion===St.ReducedMotion.REDUCE)return false;
        return true;
    }
    _ids(w){return [...new Set([this._tracker.get_window_app(w)?.get_id(),w.get_gtk_application_id(),w.get_wm_class(),w.get_wm_class_instance()].filter(Boolean).map(s=>s.toLowerCase()))];}
    _ignored(w){const list=this._settings.get_strv('ignored-apps').map(x=>x.toLowerCase());return this._ids(w).some(x=>list.includes(x));}
    _normal(w){return w.get_window_type()===Meta.WindowType.NORMAL&&!w.get_transient_for()&&!w.is_attached_dialog()&&!w.is_override_redirect()&&!w.is_skip_taskbar();}
    _eligible(w){return this._normal(w)&&!w.is_on_all_workspaces()&&(this._special(w)||(w.allows_move()&&w.allows_resize()))&&!this._ignored(w)&&Boolean(w.get_workspace());}
    _special(w){return w.is_fullscreen()||w.is_maximized();}
    _order(ws){const n=global.display.get_n_monitors(),primary=global.display.get_primary_monitor();
        // GNOME's primary-only workspaces make secondary windows sticky; never migrate into those.
        const primaryOnly=this._primaryOnly??=new Gio.Settings({schema_id:'org.gnome.mutter'});
        if(n>1&&primaryOnly.get_boolean('workspaces-only-on-primary'))return [primary];
        return monitorOrder(Array.from({length:n},(_,index)=>({...rect(global.display.get_monitor_geometry(index)),index})),primary);
    }
    _group(ws,m,create=true){if(!ws)return null;let map=this._groups.get(ws);if(!map&&create){map=new Map();this._groups.set(ws,map);}let g=map?.get(m);if(!g&&create){g={ws,m,items:[],ratios:defaultRatios(),lastArea:null};map.set(m,g);}return g;}
    _area(g){return rect(g.ws.get_work_area_for_monitor(g.m));}
    _gaps(){return effectiveGaps(this._settings.get_int('outer-gap'),this._settings.get_int('inner-gap'),this._settings.get_int('hint-width'),this._settings.get_boolean?.('active-hint')??false);}
    _tiles(g,n=g.items.length){const {outer,inner}=this._gaps();return tiles(this._area(g),n,outer,inner,g.ratios);}
    _fits(r,t){try{const v=r.w.get_min_size?.();if(Array.isArray(v)){const [ok,w,h]=v.length===3?v:[true,...v];if(ok&&(w>t.width||h>t.height))return false;}}catch{}return true;}
    _canUse(g,items){if(items.length>LIMIT)return false;const ts=this._tiles(g,items.length);return items.every((r,i)=>this._fits(r,ts[i]));}
    _insertion(g,r){const items=[...g.items,r];if(this._canUse(g,items))return items;
        // In a 3-tile layout only slot 1 is full-height (full-width in portrait).
        // Try the other choices for the half before refusing the newcomer.
        if(items.length===3){for(const i of [0,2]){const proposed=[...items];[proposed[i],proposed[1]]=[proposed[1],proposed[i]];if(this._canUse(g,proposed))return proposed;}}
        return null;}
    _clearPlacement(r){this._cancel(r.verifyId);r.verifyId=0;this._cancel(r.monitorId);r.monitorId=0;r.target=null;}
    _restoreSnapshot(snapshot,windows){
        const live=new Set(windows), saved=new Map(snapshot.records.map(r=>[r.w,r]));
        const workspaces=new Set(Array.from({length:global.workspace_manager.n_workspaces},(_,i)=>global.workspace_manager.get_workspace_by_index(i)));
        for(const ws of snapshot.paused)if(workspaces.has(ws))this._paused.add(ws);
        for(const w of windows)this._watch(w,true,true);
        for(const w of windows){const r=this._records.get(w),prev=saved.get(w);if(prev&&prev.workspace===w.get_workspace()){r.mode=prev.mode==='tiled'?'pending':prev.mode;r.saved=prev.saved;}}
        for(const old of snapshot.groups){if(!workspaces.has(old.ws)||!this._order(old.ws).includes(old.m))continue;const g=this._group(old.ws,old.m);g.ratios=old.ratios;
            for(const w of old.items){if(!live.has(w)||w.get_workspace()!==old.ws||!this._eligible(w)||w.minimized)continue;const r=this._records.get(w);g.items.push(r);r.g=g;r.mode='tiled';}
            this._mark(g);}
        for(const r of this._records.values())if(r.mode==='pending'&&!r.g)this._admit(r);
        this._updatePanel();
    }
    _watch(w,existing,defer=false){if(!w||this._records.has(w))return;
        const r={w,workspace:w.get_workspace(),signals:[],g:null,mode:'pending',saved:null,target:null,readyId:0,verifyId:0,monitorId:0,stateId:0};this._records.set(w,r);
        this._connect(w,'unmanaged',()=>this._forget(r),r);
        this._connect(w,'workspace-changed',()=>this._workspaceChanged(r),r);
        for(const s of ['notify::minimized','notify::fullscreen','notify::maximized-horizontally','notify::maximized-vertically'])this._connect(w,s,()=>this._queueState(r),r);
        for(const s of ['position-changed','size-changed'])this._connect(w,s,()=>{if(this._focusRoot()===w)this._updateHint();},r);
        for(const s of ['notify::window-type','notify::skip-taskbar','notify::wm-class','notify::on-all-workspaces','notify::transient-for'])this._connect(w,s,()=>this._queueState(r),r);
        if(existing){if(!defer)this._admit(r);return;}
        // Waiting for the mapped actor avoids classifying an unfinished transient as a normal window.
        let attempts=0;const wait=()=>{if(!this._records.has(w)||r.mode!=='pending')return;const actor=w.get_compositor_private();
            if(actor&&actor.mapped){r.readyId=this._later(80,()=>this._admit(r));}
            else if(++attempts<25)r.readyId=this._later(40,wait);
            else this._admit(r);};r.readyId=this._later(40,wait);
    }
    _admit(r){r.readyId=0;if(r.mode!=='pending')return;const w=r.w;r.workspace=w.get_workspace();
        if(!this._eligible(w)){r.mode='excluded';return;}
        if(w.minimized){r.mode='minimized';return;}
        if(!this._active(w.get_workspace())){r.mode='inactive';return;}
        // Real fullscreen (F11/video) remains native. A newly mapped window
        // restored in maximized state is instead a normal candidate for tiling.
        if(w.is_fullscreen()){r.mode='special';this._trace('admit-fullscreen',r);return;}
        if(w.is_maximized()||w.get_maximize_flags?.()){
            r.admitAttempts=(r.admitAttempts??0)+1;
            if(r.admitAttempts>3){r.mode='special';this._trace('admit-unmaximize-failed',r);return;}
            this._trace('admit-unmaximize',r,{attempt:r.admitAttempts});w.unmaximize();
            r.readyId=this._later(120,()=>this._admit(r));return;
        }
        this._allocate(r);}
    _allocate(r,preferred=null,index=null){const ws=r.w.get_workspace();r.workspace=ws;if(!this._active(ws)||!this._eligible(r.w)||r.w.minimized||this._special(r.w))return false;
        const order=this._order(ws);let list=candidates(order,m=>this._group(ws,m,false)?.items.length??0);
        if(preferred!==null&&order.includes(preferred))list=[preferred,...list.filter(m=>m!==preferred)];
        for(const m of list){const g=this._group(ws,m);const pos=m===preferred&&index!==null?Math.min(index,g.items.length):g.items.length;let items=[...g.items];items.splice(pos,0,r);if(!this._canUse(g,items)){if(index!==null)continue;items=this._insertion(g,r);if(!items)continue;}
            g.items=items;r.g=g;r.mode='tiled';r.saved=null;this._trace('allocate',r);this._mark(g);return true;}
        r.mode='floating';r.saved=null;this._trace('allocate-floating',r,{reason:'no-compatible-tile'});return false;
    }
    _detach(r,mode){if(mode!=='closed')this._trace('detach',r,{nextMode:mode});const g=r.g;if(g){const i=g.items.indexOf(r);if(i>=0)g.items.splice(i,1);r.g=null;r.target=null;this._mark(g);}this._cancel(r.verifyId);r.verifyId=0;this._cancel(r.monitorId);r.monitorId=0;r.mode=mode;}
    _forget(r){this._detach(r,'closed');this._disconnectRecord(r);this._records.delete(r.w);if(this._grab?.r===r)this._releaseGrab(this._grab);if(this._lastFocus===r.w)this._lastFocus=null;this._updateHint();}
    _mark(g){if(!g)return;this._dirty.add(g);if(!this._flushId)this._flushId=this._later(0,()=>{this._flushId=0;const groups=[...this._dirty];this._dirty.clear();for(const group of groups){try{this._layout(group);}catch(e){console.error('[Auto Tiling] layout',e);}}this._updateHint();});}
    _workareasChanged(){
        // Dynamic workspace creation/removal also emits workareas-changed. Do not
        // reapply unrelated layouts unless their actual usable rectangle changed.
        for(const map of this._groups.values())for(const g of map.values())
            if(g.items.length&&g.m>=0&&g.m<global.display.get_n_monitors()&&(!g.lastArea||!sameRect(g.lastArea,this._area(g))))this._mark(g);
    }
    _layout(g){if(this._groups.get(g.ws)?.get(g.m)!==g||!this._active(g.ws)||g.m<0||g.m>=global.display.get_n_monitors()||!g.items.length)return;
        if(this._grab?.r.g?.ws===g.ws){this._grab.deferred.add(g);return;}
        g.lastArea=this._area(g);const expected=this._tiles(g);this._traceGroups('layout-plan',null,[g],{tiles:expected});let invalid=false;
        for(const [i,r] of [...g.items].entries()){
            if(r.w.get_workspace()!==g.ws){this._workspaceChanged(r);invalid=true;continue;}
            if(!this._eligible(r.w)||r.w.minimized||!this._fits(r,expected[i])){if(r.w.minimized)r.saved={ws:g.ws,m:g.m,index:i};this._detach(r,r.w.minimized?'minimized':this._eligible(r.w)?'floating':'excluded');invalid=true;}
        }
        if(invalid)return;
        for(const [i,r] of g.items.entries()){if(r.w.is_fullscreen()||r.w.is_maximized())continue;this._apply(r,expected[i]);}this._pulse(g.items.length);
    }
    _apply(r,t,retry=false,monitorPrepared=false){const w=r.w;
        if(!r.g||w.is_fullscreen()||w.is_maximized())return;
        if(w.get_maximize_flags?.())w.unmaximize();
        const old=rect(w.get_frame_rect());r.target=t;
        if(sameRect(old,t)&&w.get_monitor()===r.g.m)return;
        r.applyingUntil=GLib.get_monotonic_time()+1000000;
        this._trace('apply',r,{target:t,retry});
        // Separate the monitor transition from the resize. Do not queue two
        // conflicting Wayland configure requests in the same call stack.
        if(!monitorPrepared&&w.get_monitor()!==r.g.m){
            const owner=r.g;this._cancel(r.verifyId);r.verifyId=0;
            this._trace('prepare-monitor',r,{destination:owner.m,retry});w.move_to_monitor(owner.m);
            r.verifyId=this._later(120,()=>{r.verifyId=0;
                if(r.g!==owner||r.target!==t||!this._active(owner.ws)||w.minimized||this._special(w))return;
                if(this._grab?.r.g?.ws===owner.ws){this._grab.deferred.add(owner);return;}
                this._apply(r,t,retry,true);});return;
        }
        w.move_resize_frame(true,t.x,t.y,t.width,t.height);
        this._cancel(r.verifyId);r.verifyId=this._later(500,()=>{r.verifyId=0;
            if(!r.g||r.target!==t||this._grab?.r===r||!this._active(r.g.ws)||this._special(w)||w.minimized)return;
            const actual=rect(w.get_frame_rect());
            if(!sameRect(actual,t,4)||w.get_monitor()!==r.g.m){
                this._trace('verify-mismatch',r,{target:t,retry});
                if(!retry){this._apply(r,t,true);return;}
                if(w.get_monitor()!==r.g.m){this._trace('monitor-repair-failed',r,{target:t});return;}
                // Only an actual size constraint is a reason to float; keep ownership
                // if the compositor refuses a position, rather than silently reallocating.
                if(actual.width>t.width+4||actual.height>t.height+4)this._detach(r,'floating');
            }else this._trace('verify-ok',r,{target:t});this._updateHint();});
        // A short compositor translation only for same-size moves. No scale or clone of live clients.
        if(this._motion()&&gActive(r.g)&&old.width===t.width&&old.height===t.height){const a=w.get_compositor_private();if(a&&sameRect(rect(w.get_frame_rect()),t,4)&&!a.get_transition('translation-x')&&!a.get_transition('translation-y')&&a.translation_x===0&&a.translation_y===0){
            a.translation_x=old.x-t.x;a.translation_y=old.y-t.y;this._animations.set(a,true);
            a.ease({translation_x:0,translation_y:0,duration:this._settings.get_int('animation-duration'),mode:Clutter.AnimationMode.EASE_OUT_QUAD,onStopped:()=>this._animations?.delete(a)});
        }}
        function gActive(g){return g?.ws===global.workspace_manager.get_active_workspace();}
    }
    _stopAnimation(a){try{a.remove_transition('translation-x');a.remove_transition('translation-y');a.translation_x=0;a.translation_y=0;}catch{}this._animations.delete(a);}
    _queueState(r){this._cancel(r.stateId);r.stateId=this._later(50,()=>{r.stateId=0;this._stateChanged(r);});}
    _stateChanged(r){if(r.mode==='pending'||r.mode==='closed'||this._grab?.r===r)return;const w=r.w;
        if(w.get_workspace()!== (r.g?.ws??r.workspace))this._workspaceChanged(r);
        if(!this._eligible(w)){if(r.g)this._detach(r,'excluded');else r.mode='excluded';this._updateHint();return;}
        if(w.minimized){if(r.g){r.saved={ws:r.g.ws,m:r.g.m,index:r.g.items.indexOf(r)};this._detach(r,'minimized');}this._updateHint();return;}
        if(this._special(w)){this._updateHint();return;}
        if(r.g){this._mark(r.g);}else if(r.mode==='minimized'||r.mode==='special'||r.mode==='excluded'||r.mode==='inactive'){const saved=r.saved;if(this._active(w.get_workspace()))this._allocate(r,saved?.ws===w.get_workspace()?saved.m:null,saved?.index??null);}
        this._updateHint();
    }
    _workspaceChanged(r){
        if(r.mode==='closed')return;
        const w=r.w,ws=w.get_workspace(),src=r.g,previous=src?.ws??r.workspace;
        // Native monitor changes may emit this signal without a workspace move.
        if(!ws||ws===previous)return;
        this._trace('workspace-change',r,{from:previous?.index?.(),to:ws.index?.()});
        r.workspace=ws;
        if(r.mode==='pending')return;
        // A workspace transfer changes only this record. Retain the source monitor
        // for tiled windows, even if Mutter briefly reports a different monitor.
        const mode=r.mode,monitor=src?.m??w.get_monitor();
        if(this._grab?.r===r)this._releaseGrab(this._grab);
        if(src)this._detach(r,'inactive');
        r.saved=null;
        if(!this._eligible(w)){r.mode='excluded';this._updateHint();return;}
        if(mode==='floating'){r.mode='floating';this._updateHint();return;}
        if(w.minimized){r.mode='minimized';r.saved={ws,m:monitor,index:null};this._updateHint();return;}
        if(!src&&mode!=='inactive'&&mode!=='minimized'){
            // Preserve special/excluded windows that had no tile before the move.
            r.mode=mode;this._updateHint();return;
        }
        if(!this._active(ws)){r.mode='inactive';this._updateHint();return;}
        // Unlike automatic admission, a user-directed workspace move does not
        // search other monitors for capacity or evict any existing tile.
        if(this._order(ws).includes(monitor)){
            const dst=this._group(ws,monitor),items=[...dst.items,r];
            if(this._canUse(dst,items)){
                dst.items=items;r.g=dst;r.mode='tiled';this._mark(dst);
                this._updateHint();return;
            }
        }
        r.mode='floating';this._updateHint();
    }
    _monitorChanged(w){const r=this._records.get(w);if(!r?.g||this._grab?.r===r)return;
        // An observed monitor is NOT a transfer request. Only a completed grab or our
        // explicit move shortcut may change a tiled window's monitor ownership.
        // Verify late notifications too: the compositor may physically move a sibling.
        this._trace('monitor-event',r);
        this._cancel(r.monitorId);const owner=r.g;
        r.monitorId=this._later(1100,()=>{r.monitorId=0;
            if(r.g!==owner||!this._active(owner.ws)||w.get_workspace()!==owner.ws)return;
            if(this._grab){this._grab.deferred.add(owner);return;}
            if(w.get_monitor()===owner.m)return;
            // Repair the physical position without altering any group membership.
            if(this._special(w)){r.applyingUntil=GLib.get_monotonic_time()+1000000;w.move_to_monitor(owner.m);}
            else this._mark(owner);
        });
    }
    _transfer(r,m,other){const src=r.g;if(!src||!this._active(src.ws)||!this._order(src.ws).includes(m))return false;
        const dst=this._group(src.ws,m);
        if(dst===src){
            if(other&&other!==r){const a=src.items.indexOf(r),b=src.items.indexOf(other),proposed=[...src.items];
                if(a>=0&&b>=0){[proposed[a],proposed[b]]=[proposed[b],proposed[a]];if(this._canUse(src,proposed))src.items=proposed;}}
            this._mark(src);return true;
        }
        const si=src.items.indexOf(r);if(si<0)return false;
        this._traceGroups('transfer-before',r,[src,dst],{destination:m});
        const a=src.items.filter(item=>item!==r),b=this._insertion(dst,r);
        // An explicit monitor transfer is an insertion, not a swap. Never move an unrelated window back.
        this._clearPlacement(r);
        if(!b){
            this._traceGroups('transfer-rejected',r,[src,dst],{destination:m,reason:dst.items.length>=LIMIT?'full':'size-constraint',tiles:dst.items.length< LIMIT?this._tiles(dst,dst.items.length+1):[]});
            // Full/incompatible destination: honor the user's monitor choice as a floating window.
            this._detach(r,'floating');
            if(r.w.get_monitor()!==m)r.w.move_to_monitor(m);
            return true;
        }
        for(const item of [...a,...b])this._clearPlacement(item);
        src.items=a;dst.items=b;r.g=dst;
        // Cross-monitor insertion means the destination must split, not keep a
        // native maximized window covering its new sibling. Fullscreen stays native.
        for(const item of dst.items){if(!item.w.is_fullscreen()&&(item.w.is_maximized()||item.w.get_maximize_flags?.()))item.w.unmaximize();}
        if(r.w.is_fullscreen()&&r.w.get_monitor()!==m)r.w.move_to_monitor(m);
        this._traceGroups('transfer-after',r,[src,dst]);
        this._mark(src);this._mark(dst);
        // A delayed native unmaximize/Wayland commit may arrive after the first layout.
        this._later(180,()=>{if(r.g===dst){this._mark(src);this._mark(dst);this._traceGroups('transfer-settled',r,[src,dst]);}});
        return true;
    }
    _grabBegin(w,op){const r=this._records.get(w);if(!r?.g||!this._active(r.g.ws)){this._trace('grab-ignored',r??null,{op,reason:'not-tiled'});return;}
        this._cancel(r.verifyId);r.verifyId=0;this._cancel(r.monitorId);r.monitorId=0;
        if(this._grab)this._releaseGrab(this._grab);
        this._grab={r,op,old:rect(w.get_frame_rect()),g:r.g,deferred:new Set()};
        this._trace('grab-begin',r,{op});
    }
    _releaseGrab(grab){if(this._grab!==grab)return;this._grab=null;for(const g of grab.deferred)this._mark(g);}
    _grabEnd(w){const grab=this._grab;if(!grab||grab.r.w!==w)return;
        const r=grab.r,[px,py]=global.get_pointer();
        // Keep the grab guard until Mutter has completed native snap/maximize and its monitor updates.
        this._later(0,()=>{
            if(this._grab!==grab)return;this._releaseGrab(grab);
            if(!r.g||!this._active(r.g.ws))return;
            const after=rect(w.get_frame_rect()),g=r.g;
            const pointerMoving=grab.op===Meta.GrabOp.MOVING||grab.op===Meta.GrabOp.MOVING_UNCONSTRAINED;
            const moving=pointerMoving||grab.op===Meta.GrabOp.KEYBOARD_MOVING;
            let m=w.get_monitor();
            if(pointerMoving){const under=this._order(g.ws).find(i=>contains(rect(global.display.get_monitor_geometry(i)),px,py));if(under!==undefined)m=under;}
            this._trace('grab-end',r,{op:grab.op,pointer:[px,py],destination:m,moving,geometry:this._order(g.ws).map(i=>({monitor:i,...rect(global.display.get_monitor_geometry(i))}))});
            // Do this before the maximize check: even a maximized drop must leave its old group.
            if(moving&&m!==g.m&&this._order(g.ws).includes(m)){this._transfer(r,m,null);return;}
            if(this._special(w)){this._mark(g);return;}
            if(moving){const rs=this._tiles(g);let j=rs.findIndex(t=>contains(t,px,py));
                if(j<0||!pointerMoving)j=rs.findIndex(t=>contains(t,after.x+after.width/2,after.y+after.height/2));
                this._transfer(r,g.m,g.items[j]);
            }else{const proposed=resizedRatios(this._area(g),this._tiles(g),g.items.indexOf(r),after,this._gaps().outer,this._gaps().inner,g.ratios);const old=g.ratios;g.ratios=proposed;if(!this._canUse(g,g.items))g.ratios=old;this._mark(g);}
        });
    }
    _swapDirection(dx,dy){const r=this._records.get(global.display.focus_window);if(!r?.g||!this._active(r.g.ws)||this._special(r.w))return;const g=r.g,j=directionalIndex(this._tiles(g),g.items.indexOf(r),dx,dy);if(j>=0){this._transfer(r,g.m,g.items[j]);return;}const dir=dx<0?Meta.DisplayDirection.LEFT:dx>0?Meta.DisplayDirection.RIGHT:dy<0?Meta.DisplayDirection.UP:Meta.DisplayDirection.DOWN;const m=global.display.get_monitor_neighbor_index(g.m,dir);if(m>=0)this._transfer(r,m,null);}
    _toggleFloating(w){const r=this._records.get(w);if(!r||!this._active(w.get_workspace())||!this._eligible(w)||this._special(w)||w.minimized)return;if(r.g)this._detach(r,'floating');else this._allocate(r,w.get_monitor());this._updateHint();}
    _prune(){const live=new Set(Array.from({length:global.workspace_manager.n_workspaces},(_,i)=>global.workspace_manager.get_workspace_by_index(i)));for(const ws of this._groups.keys())if(!live.has(ws)){for(const g of this._groups.get(ws).values())this._dirty.delete(g);this._groups.delete(ws);this._paused.delete(ws);}}
    _resume(ws=null){const all=[...this._records.values()].filter(r=>!ws||r.w.get_workspace()===ws).sort((a,b)=>a.w.get_stable_sequence()-b.w.get_stable_sequence());for(const r of all){if(r.g)this._mark(r.g);else if(r.mode==='inactive'||r.mode==='pending'||r.mode==='special'||r.mode==='excluded'){if(this._eligible(r.w)&&!r.w.minimized&&!this._special(r.w))this._allocate(r);}}}
    _settingChanged(k){if(k==='auto-tiling'){this._syncNativeEdge();if(this._enabled())this._resume();this._updatePanel();}
        else if(k==='ignored-apps'){for(const r of this._records.values()){if(r.g&&this._ignored(r.w))this._detach(r,'excluded');}}
        else if(['outer-gap','inner-gap','hint-width','active-hint'].includes(k))for(const m of this._groups.values())for(const g of m.values())this._mark(g);
        if(k==='animate'&&!this._motion()){this._cancel(this._pulseId);this._pulseId=0;this._setIcon(0);}
        this._updateHint();}
    _focusRoot(){let w=global.display.focus_window;const seen=new Set();while(w&&!seen.has(w)){seen.add(w);const p=w.get_transient_for();if(!p)break;w=p;}return w;}
    _focusChanged(){const w=this._focusRoot();if(w&&this._normal(w))this._lastFocus=w;this._updateHint();}
    _updateHint(){if(!this._hint)return;const w=this._focusRoot(),r=this._records.get(w);if(!w||!this._normal(w)||!this._active(w.get_workspace())||!this._settings.get_boolean('active-hint')||Main.overview.visible||Main.sessionMode.isLocked||w.minimized||w.is_fullscreen()||(!r?.g&&!this._settings.get_boolean('hint-floating'))||!w.showing_on_its_workspace()){this._hint.hide();return;}
        const a=w.get_compositor_private();if(!a||a.get_parent()!==global.window_group){this._hint.hide();return;}
        const t=w.get_frame_rect(),width=this._settings.get_int('hint-width'),radius=this._settings.get_int('hint-radius'),c=this._settings.get_string('hint-color');const color=/^#[0-9a-f]{6}$/i.test(c)?`border-color:${c};`:'';
        // Extend outward; the remaining stroke overlaps the dark client edge.
        this._hint.set_style(`border-width:${width}px;border-radius:${radius}px;${color}`);const h=hintRect(t,width);this._hint.set_position(h.x,h.y);this._hint.set_size(h.width,h.height);global.window_group.set_child_above_sibling(this._hint,a);this._hint.show();
    }
    _buildPanel(){this._panel=new PanelMenu.Button(0,'Auto Tiling',false);this._icon=new St.Icon({style_class:'system-status-icon'});this._panel.add_child(this._icon);this._setIcon(0);
        this._globalSwitch=new PopupMenu.PopupSwitchMenuItem('Auto tiling',this._enabled());this._globalSwitch.connect('toggled',(_o,v)=>this._settings.set_boolean('auto-tiling',v));this._panel.menu.addMenuItem(this._globalSwitch);
        this._workspaceSwitch=new PopupMenu.PopupSwitchMenuItem('Tile this workspace',true);this._workspaceSwitch.connect('toggled',(_o,v)=>{const ws=global.workspace_manager.get_active_workspace();if(v){this._paused.delete(ws);this._resume(ws);}else this._paused.add(ws);this._updateHint();});this._panel.menu.addMenuItem(this._workspaceSwitch);
        this._panel.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());this._panel.menu.addAction('Toggle floating window',()=>this._toggleFloating(this._lastFocus));this._panel.menu.addAction('Ignore active application',()=>{const w=this._lastFocus;if(!w)return;const id=this._ids(w)[0];if(id){const list=this._settings.get_strv('ignored-apps');if(!list.includes(id))this._settings.set_strv('ignored-apps',[...list,id]);}});this._panel.menu.addAction('Settings',()=>this.openPreferences());this._panel.menu.addAction('Reload Extension',()=>this._host.reload());const versionRow=new PopupMenu.PopupMenuItem(`Version ${this.metadata['version-name']}`,{reactive:false,can_focus:false});this._panel.menu.addMenuItem(versionRow);Main.panel.addToStatusArea(this.uuid,this._panel);this._updatePanel();}
    _setIcon(i){if(this._icon){this._icon.gicon=Gio.FileIcon.new(Gio.File.new_for_path(`${this.path}/icons/sweep-${i}-symbolic.svg`));}}
    _pulse(_count){if(!this._motion())return;this._cancel(this._pulseId);let frame=1;const next=()=>{if(!this._icon)return;this._setIcon(frame++);if(frame<=12)this._pulseId=this._later(38,next);else{this._pulseId=0;this._setIcon(0);}};next();}
    _updatePanel(){if(!this._panel)return;this._globalSwitch.setToggleState(this._enabled());this._workspaceSwitch.setToggleState(!this._paused.has(global.workspace_manager.get_active_workspace()));if(this._enabled())this._icon.remove_style_class_name('auto-tiling-indicator-off');else this._icon.add_style_class_name('auto-tiling-indicator-off');}
}
