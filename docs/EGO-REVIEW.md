# EGO readiness review (draft)

Scope: current Tilero 0.1.9-alpha, GNOME 50 and 51. This is a static review and preparation branch, not an approved release.

## Findings and changes

- Metadata lacked a project URL. Added it; EGO build omits the upload version (assigned by EGO) and defaults to declaring 50 only.
- Existing archive contained Python updater, tests, build scripts and a dynamic bootstrap. Production packaging uses an explicit allowlist and a synchronous entry point; no updater, manifest or reload menu. Detailed tracing is gated to development.
- Core signals and GLib sources were tracked. Cleanup previously stopped at the first unexpected exception; menu switches were not tracked explicitly, and stale actor references/source IDs survived disable. Cleanup now proceeds independently, tracks the switch signals and clears references/IDs. Pruning now also drops paused workspaces without groups.
- Preferences settings connection is disconnected once when closing. Verify the actual preferences lifecycle.
- Native Mutter edge-tiling changes are necessary for the current drag behavior; the original user value is restored on normal disable. A failed settings write is now logged without claiming ownership. A Shell crash can still leave the preference changed; test lock/unlock and document this limitation. Do not overwrite user changes silently.
- Reviewed GNOME 50/51 porting notes: synchronous disable, guarded reduced-motion API, no removed vertical property use. Shell and preferences imports are separated. The current Mutter reference describes the API but is not proof that every signal/property is available in both target versions.
- GPL-2.0-or-later proposed; maintainer must approve licensing of the project's own code and assets before publication.

## Remaining release gates

1. Human review of every module, including readability of the currently dense runtime/prefs code, comments, GObject properties, signal signatures, keybinding registration and window actor stacking. Validate against installed 50 and 51 typelibs and avoid speculative APIs. GNOME's AI-generated-code rule requires the maintainer to understand and justify the submitted implementation. No promise of approval.
2. Run CI, examine both archives; execute the manual tests on real Wayland sessions, including repeated enable/disable, lock/unlock, drag, native edge setting restoration, dialogs and workspace isolation. Measure memory/CPU. GNOME 51 not verified.
3. Decide on final license and version. Do not release a changed development runtime under its old immutable version identifier; bump version and update its directory/tests before issuing the next development ZIP.
4. Submit only the reviewed EGO ZIP to https://extensions.gnome.org/upload/ after approval.

References:
- https://gjs.guide/extensions/review-guidelines/review-guidelines.html
- https://gjs.guide/extensions/upgrading/gnome-shell-50.html
- https://gjs.guide/extensions/upgrading/gnome-shell-51.html
- https://mutter.gnome.org/meta/
