import Clutter from 'gi://Clutter';
import St from 'gi://St';

// All actors and timers belong to Tilero. No client actor properties are changed.
const HOLD_MS = 400;
const FADE_MS = 150;
const MAX_MS = 700;
export class StartupCover {
    constructor({group, actor, radius, light, later, cancel, finish}) {
        this.group = group;
        this.actor = actor;
        this._later = later;
        this._cancel = cancel;
        this._finish = finish;
        this._timers = [];
        const colors = light ? ['#e0e3e9', '#f4f5f7', '#d5dce8'] :
            ['#292c34', '#3b414e', '#303440'];
        const style = (start, end) => `border-radius: ${radius}px; background-color: ${start}; background-gradient-start: ${start}; background-gradient-end: ${end}; background-gradient-direction: horizontal;`;
        this._base = new St.Widget({reactive: false, can_focus: false, style: style(colors[0], colors[2])});
        this._sheen = new St.Widget({reactive: false, can_focus: false, opacity: 0, style: style(colors[1], colors[0])});
        try {
            this._base.add_child(this._sheen);
            group.insert_child_above(this._base, actor);
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    update(frame, hint) {
        if (!this._base)
            return;
        this._base.set_position(frame.x, frame.y);
        this._base.set_size(frame.width, frame.height);
        this._sheen.set_position(0, 0);
        this._sheen.set_size(frame.width, frame.height);
        // Avoid restack feedback; a visible hint may occupy the adjacent slot.
        const children = this.group.get_children();
        const a = children.indexOf(this.actor);
        const b = children.indexOf(this._base);
        if (b !== a + 1 && !(b === a + 2 && children[a + 1] === hint))
            this.group.set_child_above_sibling(this._base, this.actor);
    }

    start() {
        if (!this._base || this._timers.length)
            return;
        this._sheen.ease({opacity: 255, duration: HOLD_MS,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD});
        this._timers.push(this._later(HOLD_MS, () => {
            this._base?.ease({opacity: 0, duration: FADE_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: () => this._finish?.()});
        }));
        // Failsafe if a compositor transition never completes.
        this._timers.push(this._later(MAX_MS, () => this._finish?.()));
    }

    destroy() {
        const base = this._base;
        this._base = null;
        const sheen = this._sheen;
        this._sheen = null;
        this._finish = null;
        for (const id of this._timers)
            this._cancel(id);
        this._timers = [];
        if (base) {
            sheen?.remove_all_transitions();
            base.remove_all_transitions();
            base.destroy();
        }
        this.actor = null;
        this.group = null;
    }
}
