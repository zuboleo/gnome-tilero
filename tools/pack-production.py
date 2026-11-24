#!/usr/bin/env python3
"""Package the single standard GNOME extension, without development files."""
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
    parser.add_argument("--ego", action="store_true", help="Submission preview; defaults to GNOME 50 only")
    parser.add_argument("--shell-version", choices=("50", "51"), action="append")
    args = parser.parse_args()
    metadata = json.loads((ROOT / "metadata.json").read_text())
    version = metadata["version-name"]
    if args.ego:
        metadata.pop("version", None)
        metadata["shell-version"] = args.shell_version or ["50"]
    elif args.shell_version:
        metadata["shell-version"] = args.shell_version
    suffix = "ego.zip" if args.ego else "shell-extension.zip"
    output = ROOT / "dist" / f"tilero-{version}.{suffix}"
    output.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="tilero-") as temp:
        stage = Path(temp)
        (stage / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
        for name in ("extension.js", "prefs.js", "stylesheet.css", "LICENSE"):
            shutil.copy2(ROOT / name, stage / name)
        target = stage / "runtime"
        target.mkdir()
        for name in ("extension.js", "layout.js"):
            shutil.copy2(ROOT / "runtime" / name, target / name)
        icons = target / "icons"
        icons.mkdir()
        for frame in range(13):
            name = f"sweep-{frame}-symbolic.svg"
            shutil.copy2(ROOT / "runtime" / "icons" / name, icons / name)
        schemas = stage / "schemas"
        schemas.mkdir()
        schema = metadata["settings-schema"] + ".gschema.xml"
        shutil.copy2(ROOT / "schemas" / schema, schemas / schema)
        subprocess.run(["glib-compile-schemas", "--strict", str(schemas)], check=True)
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(stage.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(stage).as_posix())
    print(output)


if __name__ == "__main__":
    main()
