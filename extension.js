import Gio from 'gi://Gio';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Stable bootstrap: each release lives at a distinct module URI, avoiding GJS's
// session-long ES module cache. No private GNOME extension-manager APIs.
export default class AutoTilingLoader extends Extension {
    enable(){this._enabled=true;this._generation=(this._generation??0)+1;this._load(this._generation,false);}
    disable(){this._enabled=false;this._generation=(this._generation??0)+1;this._runtime?.disable();this._runtime=null;this._release=null;}
    reload(){if(!this._enabled)return;this._load(++this._generation,true);}
    _readRelease(){const [ok,bytes]=Gio.File.new_for_path(`${this.path}/runtime.json`).load_contents(null);if(!ok)throw Error('Cannot read runtime manifest');const release=JSON.parse(new TextDecoder().decode(bytes));if(release.loaderApi!==1||!/^\d+\.\d+\.\d+-alpha$/.test(release.version)||!Number.isInteger(release.build))throw Error('Unsupported runtime manifest');return release;}
    async _load(generation,reloading){
        try{
            const release=this._readRelease();
            if(this._release?.version===release.version&&this._runtime){Main.notify('Auto Tiling',`Already running ${release.version}`);return;}
            const path=`${this.path}/runtime/${release.version}`;
            const {default:Runtime}=await import(Gio.File.new_for_path(`${path}/extension.js`).get_uri());
            if(!this._enabled||this._generation!==generation)return;
            const next=new Runtime(this,release,path),previous=this._runtime,previousRelease=this._release;
            const snapshot=previous?.snapshot();
            previous?.disable();
            try{next.enable(snapshot);this._runtime=next;this._release=release;}
            catch(error){this._runtime=null;this._release=null;if(previous){previous.enable(snapshot);this._runtime=previous;this._release=previousRelease;}throw error;}
            if(reloading)Main.notify('Auto Tiling',`Running ${release.version}`);
        }catch(error){console.error('[Auto Tiling] runtime load failed',error);if(this._enabled&&this._generation===generation)Main.notifyError('Auto Tiling',String(error));}
    }
}
