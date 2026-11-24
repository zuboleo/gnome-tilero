// SPDX-License-Identifier: GPL-2.0-or-later
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import Runtime from './runtime/extension.js';

// Standard GNOME entry point. No dynamic imports or development updater.
export default class TileroExtension extends Extension {
    enable() {
        if (this._runtime)
            return;
        const release = {
            version: this.metadata['version-name'],
            build: this.metadata.version,
        };
        const runtime = new Runtime(this, release, `${this.path}/runtime`);
        runtime.enable();
        this._runtime = runtime;
    }

    disable() {
        const runtime = this._runtime;
        this._runtime = null;
        runtime?.disable();
    }
}
