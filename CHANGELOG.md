# Changelog

## 0.1.8-alpha — Hot Reload and appearance

First installation of the stable bootstrap requires one normal session restart.
For subsequent releases with the same bootstrap, stylesheet and GSettings XML,
run (as your desktop user, no sudo):

```sh
python3 ~/.local/share/gnome-shell/extensions/auto-tiling@local.dev/update-runtime.py ~/Downloads/NEW.shell-extension.zip
```

Then select **Reload Extension** in the top panel menu. The running version is
shown in that menu, the installed version in About. The loader uses an immutable
versioned module directory, snapshots tile membership, ratios, floating state and
paused workspaces, cleans up the old instance, and attempts rollback if starting
the new runtime fails. No reload of modified files at an already imported URI is
promised. Changes to the bootstrap, stylesheet or settings schema require the
normal installation procedure. Previously loaded code stays cached until logout;
old release directories are intentionally retained. Close and reopen settings to
see updated installed metadata. This mechanism needs live GNOME 50/51 testing.

The focus outline extends 1 logical pixel at widths 1–2, and 2 pixels at widths
3 and above. Outer and inner gap each reserve that offset when Active Hint is
enabled (there is only one focus outline). The visible gap next to the outline
matches the requested gap; inactive-to-inactive gaps include the reserve.
Focus changes never alter geometry. Windows are not clipped. A symbolic icon
with a short opacity sweep replaces the fixed gray SVG and respects animations.

## 0.1.6-alpha

- Newly admitted maximized windows are restored and tiled after a bounded settling period; real fullscreen stays native.
- Cross-monitor transfer invalidates stale placement requests for both affected groups; monitor transition and resize are separate operations.
- For a three-window layout, try alternative assignments of the full-size half if minimum sizes prevent the default placement. Never evict a sibling to another monitor.
- More diagnostic events: layout-plan, prepare-monitor, verify-ok/mismatch, transfer-rejected, grab-ignored, admit-unmaximize.
- New tests cover 2+2 → 1+3 in both directions, size constraints and admission of maximized windows.
- GNOME 50/51 runtime testing remains necessary.

## 0.1.5-alpha

- About page and running version in the panel menu, both read the extension metadata.
- Explicit cross-monitor insertion clears native maximize states on the destination (fullscreen is left native). Defer layout writes during the drag; recheck source and destination after release.
- Suppress Mutter edge tiling while global auto tiling is enabled and restore the original value on ordinary disable. This is a desktop-wide Mutter setting; after an abnormal shell crash it may need manual restoration if it had been enabled before: `gsettings set org.gnome.mutter edge-tiling true`.
- Apply absolute window geometry first; one bounded retry on a late Wayland configure mismatch. Do not discard a tile purely because its monitor has not changed yet.
- Optional local diagnostic logging: Preferences → About → Debug monitor transfers. Run `journalctl -b /usr/bin/gnome-shell -f -o cat | grep --line-buffered 'Auto Tiling'` and reproduce the issue. No window titles or content are logged.
- Live GNOME testing still required; mocked compositor tests cannot reproduce all native window events.

## 0.1.4-alpha
- Native GNOME workspace transfers (keyboard shortcuts and Activities overview) reconcile the moved window with its destination workspace while preserving the assigned monitor for tiled windows. The source group expands its remaining tiles; the destination group inserts only the moved window.
- Full or incompatible destination groups leave the moved window floating. Existing floating windows remain floating. Maximized tiled windows keep their native state and reserve a destination tile if available.
- Unchanged work areas no longer trigger global layout passes when dynamic workspaces are added or removed.
- Added ten workspace regression tests; 33 Node tests pass and JS syntax checks pass. The unchanged compiled settings schema is reused from 0.1.3 because glib-compile-schemas is unavailable in this build environment. Live GNOME validation remains required.

## 0.1.3-alpha
- Monitor ownership changes only on explicit drag/drop or the extension's directional shortcuts. Ambient Mutter monitor notifications can no longer insert a window into another monitor's group. Unexpected geometry drift is reconciled against its assigned monitor.
- Ignore workspace notifications when the actual workspace has not changed. Cancel stale reconciliation callbacks on detach/transfer.
- Use the extension's Super+Alt+arrow shortcuts (or dragging) for tiled monitor moves; native GNOME monitor-move shortcuts are not treated as explicit transfers in this version.
- Added regression tests for late monitor notifications affecting both the moved and unrelated windows. Live Shell testing still required.

## 0.1.2-alpha
- Moving a tiled window to another monitor inserts it instead of swapping with an existing window. Both affected monitor layouts are recalculated, including drops that Mutter maximizes.
- Pointer-driven drops use the monitor under the pointer; keyboard transfers use the window monitor.
- A full or incompatible destination accepts the moved window as floating. Maximized/fullscreen windows retain native geometry until restored.
- Same-monitor dragging still swaps tiles. No other workspaces are changed.
- Added mocked integration regression tests; real GNOME 50/51 testing remains required.

## 0.1.1-alpha

- Declare GNOME 50 and 51 compatibility, with the same UUID and settings schema.
- Guard the GNOME 51-only reduced-motion API, keeping animation available on GNOME 50 when system animations are enabled.
- Runtime testing is still required on both versions.
