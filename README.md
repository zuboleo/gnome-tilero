# Tilero

Monitor-first automatic tiling for GNOME Shell 50 / 51 on Wayland. Current version: **0.1.9-alpha**. No extra runtime dependencies beyond GNOME; Python 3 is used for optional hot updates.

**Alpha warning:** the geometry and allocator tests pass, JavaScript syntax and GSettings schema have been validated. This release has not been independently validated in a live GNOME Shell 50 / 51 session. Earlier versions have been tested by the user on GNOME 50.6, with outstanding monitor-transfer issues; see the manual checklist. Save work and disable other tilers before enabling it. No GNOME session changes are made by installation itself.

## Migrate from Auto Tiling 0.1.8-alpha

Tilero is the renamed project, with a new extension UUID and GSettings path.
It is a separate extension from GNOME's point of view. Disable the old extension
before enabling Tilero. To copy existing preferences (optional, before enabling Tilero):

```sh
gnome-extensions disable auto-tiling@local.dev
dconf dump /org/gnome/shell/extensions/auto-tiling/ > ~/auto-tiling-settings.ini
dconf load /org/gnome/shell/extensions/tilero/ < ~/auto-tiling-settings.ini
```

Install Tilero as described below. After confirming it works, remove the old
extension with `gnome-extensions uninstall auto-tiling@local.dev`.
The old runtime updater cannot install this renamed release. A normal install
and session restart are required once. The tiling algorithm is unchanged.

## Install on Fedora

Download the matching `.shell-extension.zip` from a published GitHub release, or build it locally with `make pack`.

```sh
gnome-shell --version
gnome-extensions install --force ~/Downloads/tilero-0.1.9-alpha.shell-extension.zip
```

Log out of GNOME and log back in, then:

```sh
gnome-extensions enable tilero@zuboleo.github.io
gnome-extensions info tilero@zuboleo.github.io
gnome-extensions prefs tilero@zuboleo.github.io
```

In Settings → Multitasking → Multi-Monitor, select **Workspaces on all displays**. If GNOME is configured to use workspaces on the primary monitor only, this prototype intentionally tiles only the primary monitor so it does not mix workspaces with sticky secondary windows. Do not run other automatic tiling extensions concurrently.

## Turn off / remove

```sh
gnome-extensions disable tilero@zuboleo.github.io
gnome-extensions uninstall tilero@zuboleo.github.io
```

Disable leaves windows in their current positions. If the shell becomes unusable, switch to a TTY (Ctrl+Alt+F3), log in, and run `gsettings set org.gnome.shell disable-user-extensions true`. Log back in. This disables all user extensions; restore the setting only after removing the problematic one.

## Development

The installed source is under `~/.local/share/gnome-shell/extensions/tilero@zuboleo.github.io/`. For a separate source directory, clone the repository and edit the source there.

```sh
sudo dnf install git make zip glib2 nodejs python3
make test
make pack
```

The installable ZIP is generated in `dist/`. `make install` builds and installs it. Node.js is only required for tests, not to run the extension. For compatible runtime-only updates use the versioned update procedure below; for changes to the bootstrap or schema, reinstall with `gnome-extensions install --force` and log out and in. Changing JavaScript modules and just toggling an extension off/on may not reload the modules on Wayland.

Safer first test in a nested session (Fedora: `sudo dnf install mutter-devkit` if missing):

```sh
dbus-run-session gnome-shell --devkit --wayland
```

This runs a separate Shell session, but may not expose the physical multi-monitor arrangement. Test on the real desktop after confirming basic startup. Debug log:

```sh
journalctl --user -b -f -o cat | grep --line-buffered -Ei 'tilero|gnome-shell|JS ERROR'
```

If logs are absent, use `journalctl -b /usr/bin/gnome-shell -f -o cat`. GNOME Looking Glass: Alt+F2, enter `lg` (Extensions tab).

## Behavior

- New normal windows fill the primary monitor first, then free monitors, then the least occupied monitor, up to four tiles each. Secondary monitors sorted by X, then Y, then index. No automatic transfers on close.
- Existing eligible windows are distributed at enable, separately by workspace, in stable sequence order. Initially maximized normal windows may be unmaximized; fullscreen is left alone.
- Layout: 1 full work area, 2 halves, 3 one half plus two quarter-sized tiles, 4 quarters. Portrait first splits top/bottom. Ratios can be adjusted by dragging shared edges.
- Window dialogs, transients, non-resizable and sticky windows are excluded. Ignore applications by desktop ID or WM_CLASS. Overflow remains floating; it is not automatically promoted when a tile is freed. A client refusing the requested geometry is released after a one-shot check, not resized in a loop.
- Drag tiled windows onto other tiles to swap; between monitors to insert (floating if full or incompatible). Native workspace transfers are respected. Maximize/fullscreen reserve tile, minimize frees it; restored window tries saved slot, then another available slot in same workspace, otherwise floating.
- Focus only changes Active Hint; transient focus follows its parent. Hint is hidden in fullscreen, overview and locked session. Border extends outside the frame with an automatic width-dependent offset, rounded independently from app corners. No clipping or modifications to client corners.
- Default outer/inner gaps 8 logical px; border 3 px, radius 8 px, system accent color. Floating hints optional. Animation is conservative: compositor translation for synchronous same-size moves; resizing is immediate; panel icon animates when layouts apply. Honors reduced motion.
- Top panel: global and per-workspace toggles, floating toggle, ignore active app, settings. Workspace toggles are session-only.

## Default shortcuts

| Shortcut | Action |
| --- | --- |
| Super+T | Toggle auto tiling |
| Super+G | Toggle focused window tiled/floating |
| Super+Alt+arrows | Swap/move tiled window |
| Super+Shift+Page Up / Page Down | Native GNOME: move window to previous / next workspace |

Change or disable in preferences. Avoid GNOME or other extension shortcut conflicts.

## Development acceptance checklist

See `tests/MANUAL.md`. Known limitations: no hotplug recovery or monitor connector persistence; no animation of client resizing; no custom rounding of actual application windows. Application classification depends on Mutter metadata; apps with malformed transient metadata may require ignore-list entries. Real Wayland asynchronous geometry, focus overlay stacking, drag behavior, and preferences must be verified on GNOME 50 and 51.

## Source modules

- `extension.js`: stable GJS bootstrap and hot reload.
- `runtime.json`: active immutable runtime version.
- `runtime/<version>/extension.js`: lifecycle, events, isolated workspace/monitor state, filtering, placement, focus border, panel and shortcuts.
- `runtime/<version>/layout.js`: pure layout and monitor ordering; no GNOME imports. Root `layout.js` re-exports the current version for tests.
- `prefs.js`: GTK4/libadwaita preferences.
- `schemas/`: GSettings XML; compiled schema generated by the build.
- `runtime/<version>/icons/`: symbolic animation frames.
- `update-runtime.py`: compatible runtime update installer.
- `tests/`: Node geometry tests and manual GNOME acceptance checklist.

API references: https://gjs.guide/extensions/ ; https://gjs.guide/extensions/upgrading/gnome-shell-51.html ; https://mutter.gnome.org/meta/ . Implementation is original; not a fork of another extension.


## Hot reload (experimental)

The first installation of the Tilero bootstrap requires a normal session restart. For subsequent compatible releases:

```sh
python3 ~/.local/share/gnome-shell/extensions/tilero@zuboleo.github.io/update-runtime.py ~/Downloads/NEW.shell-extension.zip
```

Choose **Reload Extension** from the panel menu. About displays installed metadata; the panel displays the running version. Changes to the bootstrap, stylesheet or GSettings XML require normal installation and a session restart. Each runtime version must use a unique directory and must never be overwritten with different code.

See [CHANGELOG.md](CHANGELOG.md) for release history and [tests/MANUAL.md](tests/MANUAL.md) for real-session acceptance tests.
