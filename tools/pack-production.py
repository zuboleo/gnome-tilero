#!/usr/bin/env python3
"""Create a GNOME Extensions submission preview using an explicit file allowlist."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shell-version", choices=("50", "51"), action="append",
                        help="List only versions validated in a real session; default: 50")
    args = parser.parse_args()
    manifest = json.loads((ROOT / "runtime.json").read_text())
    metadata = json.loads((ROOT / "metadata.json").read_text())
    version = manifest["version"]
    source = ROOT / "runtime" / version
    metadata.pop("version", None)  # EGO assigns its own upload version.
    metadata["shell-version"] = list(dict.fromkeys(args.shell_version or ["50"]))
    metadata["version-name"] = version
    output = ROOT / "dist" / f"tilero-{version}.ego.zip"
    output.parent.mkdir(exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="tilero-ego-") as temp:
        stage = Path(temp)
        (stage / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
        shutil.copy2(ROOT / "production/extension.js", stage / "extension.js")
        for name in ("prefs.js", "stylesheet.css", "LICENSE"):
            shutil.copy2(ROOT / name, stage / name)
        target = stage / "runtime"
        target.mkdir()
        for name in ("extension.js", "layout.js"):
            shutil.copy2(source / name, target / name)
        icons = target / "icons"
        icons.mkdir()
        for frame in range(13):
            name = f"sweep-{frame}-symbolic.svg"
            shutil.copy2(source / "icons" / name, icons / name)
        schemas = stage / "schemas"
        schemas.mkdir()
        schema = metadata["settings-schema"] + ".gschema.xml"
        shutil.copy2(ROOT / "schemas" / schema, schemas / schema)
        subprocess.run(["glib-compile-schemas", "--strict", str(schemas)], check=True)
        # Stage only runtime resources; never include tests, old runtimes,
        # source build scripts, the development loader or runtime.json.
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(stage.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(stage).as_posix())
    print(output)


if __name__ == "__main__":
    main()
