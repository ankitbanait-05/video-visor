"""Recreate the Video Visor project from a released DMG.

    python3 -I tools/restore_from_dmg.py "/path/to/Video Visor-0.14.0-arm64.dmg"

Writes, relative to the project folder:
    package.json, src/             the app's own code (tracked in git)
    vendor/node_modules/           third-party libraries (not tracked; restored from the DMG)
    vendor/runtime/Video Visor.app the Electron runtime shell, without the app code
    vendor/resources/              native-bin/ (tracker, PDF utilities) and speech/ (Whisper + model)
    vendor/unpack-rules.json       which files the release kept outside app.asar

src/ and package.json are only written when they don't exist yet, so your edits are never
overwritten. Pass --force-src to overwrite them.
"""
import json
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import asar  # noqa: E402


def mount(dmg):
    out = subprocess.run(["hdiutil", "attach", "-nobrowse", "-readonly", "-noautoopen", "-plist", dmg],
                         check=True, capture_output=True).stdout
    for entity in plistlib.loads(out)["system-entities"]:
        if entity.get("mount-point"):
            return entity["mount-point"]
    raise SystemExit("Could not mount " + dmg)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force_src = "--force-src" in sys.argv
    if len(args) != 1 or not args[0].endswith(".dmg"):
        raise SystemExit(__doc__)
    point = mount(os.path.abspath(args[0]))
    try:
        apps = [n for n in os.listdir(point) if n.endswith(".app")]
        app = os.path.join(point, apps[0])
        res = os.path.join(app, "Contents", "Resources")
        vendor = os.path.join(ROOT, "vendor")
        os.makedirs(vendor, exist_ok=True)

        with tempfile.TemporaryDirectory() as tmp:
            stage = os.path.join(tmp, "app")
            unpacked = asar.extract(os.path.join(res, "app.asar"), stage, os.path.join(res, "app.asar.unpacked"))
            # Third-party libraries
            shutil.rmtree(os.path.join(vendor, "node_modules"), ignore_errors=True)
            shutil.move(os.path.join(stage, "node_modules"), os.path.join(vendor, "node_modules"))
            # The app's own code
            for name in ("src", "package.json"):
                dest = os.path.join(ROOT, name)
                if os.path.exists(dest) and not force_src:
                    print("kept existing", name)
                    continue
                if os.path.isdir(dest):
                    shutil.rmtree(dest)
                elif os.path.exists(dest):
                    os.remove(dest)
                shutil.move(os.path.join(stage, name), dest)
                print("restored", name)

        dirs = sorted({os.path.dirname(p) for p in unpacked})
        with open(os.path.join(vendor, "unpack-rules.json"), "w") as f:
            json.dump({"files": sorted(unpacked), "dirs": dirs}, f, indent=1)

        # Runtime shell: the release app without its code and bundled tools
        runtime = os.path.join(vendor, "runtime", os.path.basename(app))
        shutil.rmtree(runtime, ignore_errors=True)
        os.makedirs(os.path.dirname(runtime), exist_ok=True)
        subprocess.run(["ditto", app, runtime], check=True)
        for name in ("app.asar", "app.asar.unpacked", "native-bin", "speech"):
            path = os.path.join(runtime, "Contents", "Resources", name)
            if os.path.isdir(path):
                shutil.rmtree(path)
            elif os.path.exists(path):
                os.remove(path)

        for name in ("native-bin", "speech"):
            dest = os.path.join(vendor, "resources", name)
            shutil.rmtree(dest, ignore_errors=True)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            subprocess.run(["ditto", os.path.join(res, name), dest], check=True)
        print("restored vendor/ (libraries, runtime, native tools, speech model)")
    finally:
        subprocess.run(["hdiutil", "detach", point], capture_output=True)


if __name__ == "__main__":
    main()
