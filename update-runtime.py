#!/usr/bin/env python3
"""Stage an immutable runtime release, then atomically switch its manifest.
Only for trusted Auto Tiling ZIPs with an identical bootstrap and schema.
Run as the desktop user, never with sudo.
"""
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
import tempfile
import zipfile


def install(archive, root):
    root = Path(root)
    with zipfile.ZipFile(archive) as z:
        manifest = z.read('runtime.json')
        release = json.loads(manifest)
        version = release['version']
        if not re.fullmatch(r'\d+\.\d+\.\d+-alpha', version) or release.get('loaderApi') != 1:
            raise ValueError('Unsupported runtime manifest; use a normal installation')
        meta = json.loads(z.read('metadata.json'))
        if meta['uuid'] != 'auto-tiling@local.dev' or meta['version-name'] != version or meta['version'] != release['build']:
            raise ValueError('Unexpected extension or release metadata')
        for name in ['extension.js', 'stylesheet.css', 'schemas/org.gnome.shell.extensions.auto-tiling.gschema.xml']:
            if (root/name).read_bytes() != z.read(name):
                raise ValueError(f'{name} changed: normal installation and a session restart required')
        prefix = f'runtime/{version}/'
        names = [n for n in z.namelist() if n.startswith(prefix) and not n.endswith('/')]
        if len(names) != len(set(names)) or not all(prefix+n in names for n in ['extension.js','layout.js','icons/sweep-0-symbolic.svg']):
            raise ValueError('Incomplete or duplicate runtime files')
        runtime = root/'runtime'
        runtime.mkdir(exist_ok=True)
        target = runtime/version
        if target.exists():
            # Reusing a version path for different bytes would defeat the module cache.
            if any(not (root/n).is_file() or (root/n).read_bytes()!=z.read(n) for n in names):
                raise ValueError('This version path already contains different code; use a new release version')
        else:
            temp = Path(tempfile.mkdtemp(prefix='.stage-',dir=runtime))
            try:
                for n in names:
                    relative = PurePosixPath(n[len(prefix):])
                    if relative.is_absolute() or '..' in relative.parts or '\\' in n:
                        raise ValueError('Unsafe ZIP path')
                    out = temp.joinpath(*relative.parts)
                    out.parent.mkdir(parents=True,exist_ok=True)
                    out.write_bytes(z.read(n))
                temp.rename(target)
            finally:
                if temp.exists(): shutil.rmtree(temp)
        # Keep the running bootstrap untouched; the manifest is the commit point.
        for name, data in [('prefs.js',z.read('prefs.js')),('metadata.json',z.read('metadata.json')),('runtime.json',manifest)]:
            with tempfile.NamedTemporaryFile(dir=root,delete=False) as f:
                f.write(data)
                temp_name=f.name
            os.chmod(temp_name,0o644)
            os.replace(temp_name,root/name)
        print(f'Staged {version}. Select Reload Extension in the Auto Tiling panel menu.')

if __name__ == '__main__':
    if len(sys.argv)!=2:
        sys.exit('Usage: python3 update-runtime.py /path/to/new.shell-extension.zip')
    try:
        if os.geteuid()==0: raise ValueError('Run as the desktop user, without sudo')
        install(sys.argv[1],Path(__file__).resolve().parent)
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        sys.exit(f'Update refused: {error}')
