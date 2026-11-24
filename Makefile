UUID := tilero@zuboleo.github.io
VERSION := $(shell python3 -c 'import json; print(json.load(open("metadata.json"))["version-name"])')
ZIP := dist/tilero-$(VERSION).shell-extension.zip
.PHONY: pack pack-production test install clean
pack:
	python3 tools/pack-production.py

pack-production:
	python3 tools/pack-production.py --ego

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
