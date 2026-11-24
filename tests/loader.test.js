import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../extension.js',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'').replace('export default class','class').replace('await import(','await loadModule(');
function fixture(){
    let release={version:'0.1.8-alpha',build:8,loaderApi:1};let fail=false,delayed=null;const events=[];
    class Runtime{constructor(host,r){this.release=r;}enable(state){events.push(['enable',this.release.version,state]);if(fail&&this.release.version===release.version)throw Error('failed');}disable(){events.push(['disable',this.release.version]);}snapshot(){return {tiles:['a','b']};}}
    const Gio={File:{new_for_path:path=>({load_contents:()=>[true,new TextEncoder().encode(JSON.stringify(release))],get_uri:()=>path})}};
    const Main={notify:()=>{},notifyError:()=>{}};
    const loadModule=()=>delayed??Promise.resolve({default:Runtime});
    const Loader=new Function('Extension','Gio','Main','loadModule',`${source}\nreturn AutoTilingLoader;`)(class{},Gio,Main,loadModule);const ext=new Loader();ext.path='/mock';
    return {ext,events,change:()=>{release={version:'0.1.9-alpha',build:9,loaderApi:1};},fail:()=>{fail=true;},delay:p=>{delayed=p;},Runtime};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('loader swaps runtime using snapshot and unique release path',async()=>{const f=fixture();f.ext.enable();await tick();f.change();f.ext.reload();await tick();assert.deepEqual(f.events,[['enable','0.1.8-alpha',undefined],['disable','0.1.8-alpha'],['enable','0.1.9-alpha',{tiles:['a','b']}]]);assert.equal(f.ext._release.version,'0.1.9-alpha');});
test('same-version reload does not restart active runtime',async()=>{const f=fixture();f.ext.enable();await tick();f.ext.reload();await tick();assert.equal(f.events.length,1);});
test('disable during pending import cannot enable stale runtime',async()=>{const f=fixture();let resolve;f.delay(new Promise(r=>{resolve=r;}));f.ext.enable();f.ext.disable();resolve({default:f.Runtime});await tick();assert.deepEqual(f.events,[]);});
test('failed runtime start restores previous version and snapshot',async()=>{const f=fixture();f.ext.enable();await tick();f.change();f.fail();f.ext.reload();await tick();assert.equal(f.ext._release.version,'0.1.8-alpha');assert.deepEqual(f.events.at(-1),['enable','0.1.8-alpha',{tiles:['a','b']}]);});
