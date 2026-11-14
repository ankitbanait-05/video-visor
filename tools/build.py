"""Build Video Visor from this folder.

    python3 -I tools/build.py          dist/Video Visor Dev.app  (separate data folder: safe for testing)
    python3 -I tools/build.py --release dist/Video Visor.app     (uses the real "video-visor" data folder)
    add --dmg                           also make a .dmg next to the app
    add --identity "Developer ID Application: Company (TEAMID)"   sign for distribution (hardened runtime)
    add --notarize PROFILE              with --dmg: notarise with `xcrun notarytool` (keychain profile made once
                                        with `xcrun notarytool store-credentials PROFILE`) and staple the ticket

The Dev build is named "Video Visor Dev", has its own bundle id and keeps its projects in
~/Library/Application Support/video-visor-dev, so it never touches real projects.

Run tools/restore_from_dmg.py once first to fill vendor/.
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


def arg(flag):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv and sys.argv.index(flag) + 1 < len(sys.argv) else None


def macho_files(app):
    """Every Mach-O binary inside the app, deepest first, so each is signed before what contains it."""
    found = []
    for folder, _dirs, files in os.walk(app):
        for f in files:
            p = os.path.join(folder, f)
            if os.path.islink(p):
                continue
            try:
                with open(p, "rb") as fh:
                    magic = fh.read(4)
            except OSError:
                continue
            if magic in (b"\xcf\xfa\xed\xfe", b"\xca\xfe\xba\xbe", b"\xfe\xed\xfa\xcf", b"\xbe\xba\xfe\xca"):
                found.append(p)
    bundles = [os.path.join(folder, d) for folder, dirs, _ in os.walk(app) for d in dirs if d.endswith((".framework", ".app")) and os.path.join(folder, d) != app]
    return sorted(found, key=lambda p: -p.count(os.sep)), sorted(bundles, key=lambda p: -p.count(os.sep))


def sign(app, identity):
    """0.15 (DS-01): with a Developer ID, every binary is signed with the hardened runtime and a timestamp."""
    if not identity:
        # Ad-hoc signature for running on this Mac. Distribution needs a Developer ID + notarisation (DS-01).
        subprocess.run(["codesign", "--force", "--deep", "--sign", "-", app], check=True, capture_output=True)
        return
    ent = os.path.join(HERE, "entitlements.plist")
    base = ["codesign", "--force", "--timestamp", "--options", "runtime", "--entitlements", ent, "--sign", identity]
    binaries, bundles = macho_files(app)
    for p in binaries + bundles + [app]:
        subprocess.run(base + [p], check=True, capture_output=True)
    subprocess.run(["codesign", "--verify", "--deep", "--strict", app], check=True)


def main():
    release, make_dmg = "--release" in sys.argv, "--dmg" in sys.argv
    identity, profile = arg("--identity"), arg("--notarize")
    vendor = os.path.join(ROOT, "vendor")
    runtime = os.path.join(vendor, "runtime", "Video Visor.app")
    if not os.path.isdir(runtime):
        raise SystemExit("vendor/ is missing. Run: python3 -I tools/restore_from_dmg.py <release.dmg>")
    with open(os.path.join(ROOT, "package.json")) as f:
        pkg = json.load(f)
    with open(os.path.join(vendor, "unpack-rules.json")) as f:
        rules = json.load(f)
    version = pkg["version"]
    name = "Video Visor" if release else "Video Visor Dev"

    dist = os.path.join(ROOT, "dist")
    app = os.path.join(dist, name + ".app")
    shutil.rmtree(app, ignore_errors=True)
    os.makedirs(dist, exist_ok=True)
    subprocess.run(["ditto", runtime, app], check=True)
    res = os.path.join(app, "Contents", "Resources")

    with tempfile.TemporaryDirectory() as tmp:
        stage = os.path.join(tmp, "app")
        shutil.copytree(os.path.join(ROOT, "src"), os.path.join(stage, "src"),
                        ignore=shutil.ignore_patterns(".DS_Store"))
        shutil.copytree(os.path.join(vendor, "node_modules"), os.path.join(stage, "node_modules"),
                        ignore=shutil.ignore_patterns(".DS_Store"))
        build_pkg = dict(pkg)
        if not release:
            build_pkg["name"] = "video-visor-dev"   # Electron derives the data folder from this
            build_pkg["productName"] = name
        with open(os.path.join(stage, "package.json"), "w") as f:
            json.dump(build_pkg, f, indent=2)
        # Same files stay outside the archive as in the release (binaries the app runs directly,
        # the connector bridge, music). New connector files and music tracks follow the same rule.
        release_files = set(rules["files"])
        keep_out = lambda rel: (rel in release_files or rel.startswith("src/connector/")
                                or (rel.startswith("src/music/") and rel.endswith(".m4a")))
        digest = asar.pack(stage, os.path.join(res, "app.asar"), keep_out)

    for tool in ("native-bin", "speech"):
        subprocess.run(["ditto", os.path.join(vendor, "resources", tool), os.path.join(res, tool)], check=True)

    plist_path = os.path.join(app, "Contents", "Info.plist")
    with open(plist_path, "rb") as f:
        info = plistlib.load(f)
    info["ElectronAsarIntegrity"] = {"Resources/app.asar": {"algorithm": "SHA256", "hash": digest}}
    info["CFBundleShortVersionString"] = info["CFBundleVersion"] = version
    # 0.15: macOS asks for this when a recording includes the Mac's own sound.
    info["NSAudioCaptureUsageDescription"] = "Video Visor records your Mac's sound with the screen when you tick Mac sound."
    # 0.15 (DS-03): no "allow any insecure connection" (only local networking, which the assistant connector uses), and no
    # permission texts for things the app never uses.
    info["NSAppTransportSecurity"] = {"NSAllowsLocalNetworking": True}
    for key in ("NSBluetoothAlwaysUsageDescription", "NSBluetoothPeripheralUsageDescription"):
        info.pop(key, None)
    # CFBundleName must stay "Video Visor": Electron finds its "Video Visor Helper" apps by it.
    info["CFBundleDisplayName"] = name
    if not release:
        info["CFBundleIdentifier"] = "com.videovisor.desktop.dev"
    with open(plist_path, "wb") as f:
        plistlib.dump(info, f)

    sign(app, identity)
    print("built", os.path.relpath(app, ROOT), "· version", version, "· signed by " + identity if identity else "· ad-hoc signed")

    if make_dmg:
        dmg = os.path.join(dist, "%s-%s-arm64.dmg" % (name, version))
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(["ditto", app, os.path.join(tmp, name + ".app")], check=True)
            os.symlink("/Applications", os.path.join(tmp, "Applications"))
            if os.path.exists(dmg):
                os.remove(dmg)
            subprocess.run(["hdiutil", "create", "-volname", "%s %s" % (name, version), "-srcfolder", tmp,
                            "-format", "UDZO", "-ov", dmg], check=True, capture_output=True)
        if identity:
            subprocess.run(["codesign", "--force", "--timestamp", "--sign", identity, dmg], check=True, capture_output=True)
        if profile:
            if not identity:
                sys.exit("--notarize needs --identity")
            subprocess.run(["xcrun", "notarytool", "submit", dmg, "--keychain-profile", profile, "--wait"], check=True)
            subprocess.run(["xcrun", "stapler", "staple", dmg], check=True)
            subprocess.run(["xcrun", "stapler", "staple", app], check=True)
        print("built", os.path.relpath(dmg, ROOT))


if __name__ == "__main__":
    main()
