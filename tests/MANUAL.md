# Manual acceptance tests — GNOME Shell 50 / 51 / Wayland

Not executed in the build environment. Test with all other tilers disabled and Workspaces on all displays enabled.

- [ ] Enable with no windows. Panel icon and preferences open; no Shell errors.
- [ ] On two monitors, open 1–9 ordinary windows; allocation 1,2,1,2,1,2,1,2 then floating.
- [ ] Close only the second monitor's last window: first monitor does not change. New window fills the empty monitor.
- [ ] Open and close modal Commit and file chooser dialogs in VS Code; no tile count or frame changes; hint stays with parent.
- [ ] Create five workspaces; close a window on workspace five; geometry on workspace one is unchanged; switch repeatedly.
- [ ] Open 9th window as floating; close a tile; floating remains where it was. Super+G can add it to a free tile.
- [ ] Maximize and restore; fullscreen and exit; hint hidden during fullscreen. Minimize restores neighbor expansion; restore tries previous slot.
- [ ] Drag tile onto other tile, drag across monitors, drag shared edge. No oscillation or unintended workspace migration.
- [ ] Set vertical monitor, negative monitor offsets, mixed resolution and fractional scaling. Verify work areas and gaps.
- [ ] Add app via installed apps and by WM_CLASS; new app windows float; remove and manually tile again.
- [ ] Change accent color in system settings, border radius/width, floating hint, gap and animation options.
- [ ] Open fixed-size / minimum-size constrained app; it floats if no tile fits and does not repeatedly resize.
- [ ] Enable/disable via menu and extension manager; windows stay put on disable; no orphan border, timers or duplicate menu icons.
- [ ] Overview, lock screen, native workspace transfer, shortcut changes, panel menu and settings all behave normally.

## 0.1.2 transfer regression
- [ ] With one tile on each monitor, drag the first onto the second. First stays empty; second splits into two.
- [ ] With two tiles on monitor A, move one to B. Remaining tile fills A with outer gap.
- [ ] Repeat with B's existing window maximized, and with native maximize on drop; restore maximized windows and confirm tile membership is correct.
- [ ] Drag onto a monitor with four tiles. Moved window stays floating on B, A reflows.
- [ ] Repeat with another workspace populated; its layout stays unchanged.

## 0.1.3 ownership regression
- [ ] Drag A onto occupied monitor B; wait at least two seconds. Existing B windows never migrate to A.
- [ ] Repeat in both directions with one, two and three windows on destination, including maximized destination.
- [ ] Repeat using extension directional shortcuts (Super+Alt+arrows). Native GNOME monitor-move shortcuts are not supported for tiled windows in this build.
- [ ] Repeat with animation disabled and enabled; verify actual monitor placement remains stable after delayed Wayland commits.

## Workspace transfer (0.1.4)
- With two monitors and at least three workspaces, move a tiled window with Super+Shift+Page Down and back with Super+Shift+Page Up. Its monitor stays the same; source and destination tiles update, other groups remain unchanged.
- Repeat using Activities overview and drag a window to another workspace.
- Move a window into a workspace with four tiles on its monitor. The transferred window stays floating; no existing tile moves to another monitor.
- Repeat with a floating window and a maximized tiled window; restore the maximized window and verify its destination tile.
- Move the last window from a dynamic workspace and ensure no unrelated group is rearranged.

## 0.1.5 transfer / version regression
- Confirm About and the top-panel menu report 0.1.5-alpha (build 6).
- On monitor A place ChatGPT and Chromium; on B place terminal. Drag Chromium to B. A has only ChatGPT, full working area; B has terminal and Chromium in halves. Repeat in reverse and after two seconds.
- Repeat when destination or dragged window was maximized; it returns to a tile on the destination. Native maximize/restore without a monitor transfer still works.
- Check native edge-tiling preference before enabling, while active, and after disabling; original value is restored.
- If a transfer fails, enable About → Debug monitor transfers and capture the local journal.

## 0.1.6 regression scenarios
- Open two windows on each of two monitors. Drag one from A to B. A becomes one full-work-area tile; B has one half and two quarters. Repeat in reverse.
- Close a maximized normal app, then reopen it. It should tile if capacity and minimum size permit. Native F11 fullscreen must remain untouched.
- Enable About → Debug monitor transfers; record layout-plan, grab-end, transfer-after, apply, verify and transfer-rejected events if a scenario fails.

## 0.1.9 acceptance

- Install once normally and log back in; About shows 0.1.9-alpha, panel menu shows running 0.1.9-alpha.
- At widths 1, 2, 3 and 4 inspect dark client edge and outline on Chromium/PWA and native GNOME. Check zero and 8 logical pixel gaps and no layout changes on focus switch. Disable Active Hint to remove reserve.
- Verify icon color matches other symbolic indicators and opacity animation runs only on layout events. Respect disabled animation settings.
- Repeat monitor transfer 2+2 → 1+3, workspace transfer, modal dialogs, minimization and maximization. Actual compositor behavior is not covered by Node tests.

## Production submission preview

- [ ] Install the EGO preview on GNOME 50; confirm no Reload Extension menu; diagnostic logging is opt-in. Repeat on GNOME 51 before declaring support.
- [ ] Enable/disable 20 times, including during an active grab, an animation and pending window admission. Check journal, shortcuts, panel icon, hint, and native edge-tiling restoration.
- [ ] Open and close preferences repeatedly; check for signal warnings.
- [ ] Run the existing monitor/workspace/dialog/restore acceptance tests in both sessions. Check idle memory and CPU before and after repeated enable/disable.
- [ ] Inspect ZIP: standard entry point, no updater or tools, required XML and compiled schema. Confirm maintainer license approval before submission.

## 0.1.10 popup regression
- [ ] On GTK apps, open a menu crossing the focus border, move pointer between submenus and close it. The menu must stay above the hint; normal hint appearance returns without retile or focus change. Repeat on floating windows, context menus, Chromium and XWayland.
- [ ] Install with standard GNOME tooling; confirm no reload menu or updater in either archive.

## 0.1.13 Active Hint boundary regression
- [ ] Maximize/restore a normal tiled and floating window on each monitor; the outline remains inside the work area, including below the top panel.
- [ ] Drag a floating window partially outside a monitor; the outline is bounded, and its normal offset returns when the window moves back. Repeat on a monitor with negative coordinates and zero outer gap. Check popup stacking and ordinary 8 px gaps remain correct.
