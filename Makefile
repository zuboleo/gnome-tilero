UUID := tilero@zuboleo.github.io
VERSION := $(shell python3 -c 'import json; print(json.load(open("runtime.json"))["version"])')
ZIP := dist/tilero-$(VERSION).shell-extension.zip
.PHONY: pack test install clean
pack:
	glib-compile-schemas --strict schemas
	mkdir -p dist
	rm -f $(ZIP)
	zip -r $(ZIP) metadata.json extension.js runtime.json runtime layout.js prefs.js stylesheet.css schemas tests README.md CHANGELOG.md Makefile package.json update-runtime.py

test:
	node --test tests/*.test.js
	find runtime -name '*.js' -exec node --check {} \;
	node --check extension.js
	node --check layout.js
	node --check prefs.js
	glib-compile-schemas --strict --dry-run schemas

install: pack
	gnome-extensions install --force $(ZIP)

clean:
	rm -rf dist schemas/gschemas.compiled
