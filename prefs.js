import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class TileroPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const s=this.getSettings();window.set_default_size(650,710);
        const page=new Adw.PreferencesPage({title:'General',icon_name:'preferences-system-symbolic'});window.add(page);
        const group=new Adw.PreferencesGroup({title:'Tiling',description:'Monitor first, then split. Up to four tiles per monitor.'});page.add(group);
        const toggle=(g,key,title,subtitle='')=>{const row=new Adw.SwitchRow({title,subtitle});g.add(row);s.bind(key,row,'active',Gio.SettingsBindFlags.DEFAULT);return row;};
        const spin=(g,key,title,min,max)=>{const row=new Adw.SpinRow({title,adjustment:new Gtk.Adjustment({lower:min,upper:max,step_increment:1,page_increment:5})});g.add(row);s.bind(key,row,'value',Gio.SettingsBindFlags.DEFAULT);return row;};
        toggle(group,'auto-tiling','Automatic Tiling');spin(group,'outer-gap','Outer Gap (px)',0,64);spin(group,'inner-gap','Inner Gap (px)',0,64);
        const hint=new Adw.PreferencesGroup({title:'Active Hint',description:'Rounded focus border; does not change application window corners.'});page.add(hint);
        toggle(hint,'active-hint','Active Hint');spin(hint,'hint-width','Active Hint Width (px)',1,12);spin(hint,'hint-radius','Active Hint Radius (px)',0,40);
        const color=new Adw.ActionRow({title:'Active Hint Color'});hint.add(color);
        const useSystem=new Gtk.Switch({valign:Gtk.Align.CENTER,active:s.get_string('hint-color')==='system'});const picker=new Gtk.ColorButton({valign:Gtk.Align.CENTER,use_alpha:false});const initial=new Gdk.RGBA();initial.parse(s.get_string('hint-color')==='system'?'#3584e4':s.get_string('hint-color'));picker.set_rgba(initial);picker.sensitive=!useSystem.active;
        color.add_suffix(new Gtk.Label({label:'System'}));color.add_suffix(useSystem);color.add_suffix(picker);
        const saveColor=()=>{const c=picker.get_rgba();const hex=v=>Math.round(v*255).toString(16).padStart(2,'0');s.set_string('hint-color',`#${hex(c.red)}${hex(c.green)}${hex(c.blue)}`);};
        useSystem.connect('notify::active',()=>{picker.sensitive=!useSystem.active;if(useSystem.active)s.set_string('hint-color','system');else saveColor();});picker.connect('color-set',saveColor);
        toggle(hint,'hint-floating','Active Hint on Floating Windows');
        const motion=new Adw.PreferencesGroup({title:'Animation',description:'Short translations for same-size window moves. Resizing is immediate.'});page.add(motion);
        toggle(motion,'animate','Animate Window Movement');spin(motion,'animation-duration','Animation Duration (ms)',50,400);
        const ignorePage=new Adw.PreferencesPage({title:'Ignore List',icon_name:'view-list-symbolic'});window.add(ignorePage);
        const addGroup=new Adw.PreferencesGroup({title:'Add application',description:'Choose an installed app or enter an application ID / WM_CLASS.'});ignorePage.add(addGroup);
        const apps=Gio.AppInfo.get_all().filter(a=>a.should_show()&&a.get_id()).sort((a,b)=>a.get_display_name().localeCompare(b.get_display_name()));
        const model=Gtk.StringList.new(apps.map(a=>`${a.get_display_name()} — ${a.get_id()}`));
        const select=new Adw.ComboRow({title:'Installed applications',model,enable_search:true});addGroup.add(select);
        const addBtn=new Gtk.Button({label:'Add',valign:Gtk.Align.CENTER});select.add_suffix(addBtn);const add=id=>{id=id?.trim().toLowerCase();if(id){const list=s.get_strv('ignored-apps');if(!list.includes(id))s.set_strv('ignored-apps',[...list,id]);}};
        addBtn.connect('clicked',()=>add(apps[select.selected]?.get_id()));
        const manual=new Adw.EntryRow({title:'Application ID or WM_CLASS'});addGroup.add(manual);const manualBtn=new Gtk.Button({label:'Add',valign:Gtk.Align.CENTER});manual.add_suffix(manualBtn);const addManual=()=>{add(manual.text);manual.text='';};manualBtn.connect('clicked',addManual);manual.connect('entry-activated',addManual);
        const exclusions=new Adw.PreferencesGroup({title:'Excluded applications'});ignorePage.add(exclusions);let rows=[];
        const refresh=()=>{for(const r of rows)exclusions.remove(r);rows=[];for(const id of s.get_strv('ignored-apps')){const app=apps.find(a=>a.get_id()?.toLowerCase()===id);const row=new Adw.ActionRow({title:app?.get_display_name()??id,subtitle:app?id:''});if(app?.get_icon())row.add_prefix(new Gtk.Image({gicon:app.get_icon(),pixel_size:28}));const remove=new Gtk.Button({icon_name:'edit-delete-symbolic',tooltip_text:'Remove exception',valign:Gtk.Align.CENTER});remove.connect('clicked',()=>s.set_strv('ignored-apps',s.get_strv('ignored-apps').filter(x=>x!==id)));row.add_suffix(remove);exclusions.add(row);rows.push(row);}};
        const changed=s.connect('changed::ignored-apps',refresh);window.connect('close-request',()=>{s.disconnect(changed);return false;});refresh();
        const shortcutPage=new Adw.PreferencesPage({title:'Keyboard Shortcuts',icon_name:'preferences-desktop-keyboard-shortcuts-symbolic'});window.add(shortcutPage);
        const shortcuts=new Adw.PreferencesGroup({title:'Shortcuts',description:'Use GTK accelerator notation (for example <Super><Alt>Left). Clear a field to disable that shortcut. Avoid existing GNOME shortcuts.'});shortcutPage.add(shortcuts);
        for(const [key,title] of [['toggle-tiling','Toggle Automatic Tiling'],['toggle-floating','Toggle Floating'],['swap-left','Move / swap left'],['swap-right','Move / swap right'],['swap-up','Move / swap up'],['swap-down','Move / swap down']]){
            const row=new Adw.EntryRow({title,text:s.get_strv(key)[0]??''});shortcuts.add(row);const save=new Gtk.Button({label:'Save',valign:Gtk.Align.CENTER});row.add_suffix(save);const commit=()=>{const v=row.text.trim();const [ok,keyval,mods]=Gtk.accelerator_parse(v);if(v&&(!ok||!Gtk.accelerator_valid(keyval,mods))){row.add_css_class('error');return;}row.remove_css_class('error');s.set_strv(key,v?[v]:[]);};save.connect('clicked',commit);row.connect('entry-activated',commit);
            const reset=new Gtk.Button({icon_name:'edit-undo-symbolic',tooltip_text:'Reset shortcut',valign:Gtk.Align.CENTER});row.add_suffix(reset);reset.connect('clicked',()=>{s.reset(key);row.text=s.get_strv(key)[0]??'';row.remove_css_class('error');});
        }
        const aboutPage=new Adw.PreferencesPage({title:'About',icon_name:'help-about-symbolic'});window.add(aboutPage);
        const about=new Adw.PreferencesGroup({title:'Tilero'});aboutPage.add(about);
        const info=(title,value)=>{const row=new Adw.ActionRow({title,subtitle:String(value)});about.add(row);};
        let release;try{const [ok,bytes]=Gio.File.new_for_path(`${this.path}/runtime.json`).load_contents(null);if(ok)release=JSON.parse(new TextDecoder().decode(bytes));}catch{}
        info('Installed Version',release?.version??this.metadata['version-name']??this.metadata.version);
        info('Build',release?.build??this.metadata.version);
        info('Running version','See Version in the top panel menu');
        info('GNOME Shell',this.metadata['shell-version'].join(' / '));
        info('Extension ID',this.metadata.uuid);
        const diagnostics=new Adw.PreferencesGroup({title:'Diagnostics',description:'Log monitor transfers, window IDs, application classes and geometry to the local GNOME Shell journal. No window titles or content.'});aboutPage.add(diagnostics);
        toggle(diagnostics,'debug-transfers','Debug monitor transfers');
    }
}
