# Video Visor

Local desktop video editor, screen recorder and file tools for macOS (Electron 45, Apple Silicon).

## Download and install

1. Download **Video Visor-0.15.0-arm64.dmg** from [Releases](https://github.com/ankitbanait-05/video-visor/releases/latest).
2. Open the DMG and drag **Video Visor** onto **Applications**.
3. Open Video Visor from Applications. The app is not signed with an Apple Developer ID yet, so macOS blocks the first launch:
   - Click **Done** on the warning (don't move it to the Bin).
   - Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to "Video Visor was blocked".
   - Open the app again and confirm **Open**. macOS remembers this, so you only do it once.

   **Or, in one step:** after dragging the app to Applications, run this once in Terminal, then open the app normally:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/Video Visor.app"
   ```

   It removes the "downloaded from the internet" mark that macOS uses to block apps without a Developer ID.

**Requires:** a Mac with Apple silicon (M1 or later) and macOS 14 (Sonoma) or later. Intel Macs are not supported yet.

### Windows (preview)

Download **Video-Visor-…-win-x64-setup.exe** from [Releases](https://github.com/ankitbanait-05/video-visor/releases/latest) (or the portable **…-win-x64.zip**) and run it. The installer is not code-signed yet, so Windows SmartScreen may say "Windows protected your PC": click **More info → Run anyway**.

Windows 10 or 11, 64-bit. The editor, recording, export, captions and most file tools work as on the Mac. Not on Windows yet (they use a macOS-only helper): background removal, text from images (OCR), PDF to image, PDF compress / protect / unlock / repair, PDF summary / compare / markdown, Screenshot and tracking blur.
Everything runs on your Mac: recordings, edits and file tools stay local.

---

This project was **recovered from the released `Video Visor-0.14.0-arm64.dmg`** on 14 Nov 2026, because the original project folder was not available. The app's code ships as readable JavaScript, HTML and CSS, so `src/` is the real source. A Dev build made from it matches the release file for file.

## Layout

| Path | What | In git |
|---|---|---|
| `src/` | The app's code: `main.cjs` (main process), `editor.js` (editor + timeline), `shell.js` (home, tools, settings), `runtime*.js`, `engines/` (export, tools, timeline models), `recorder/`, `ai/`, `connector/`, fonts, music | Yes |
| `package.json` | App name, version and dependency list | Yes |
| `tools/` | Python scripts to restore, pack and build (no Node.js needed) | Yes |
| `Video-Visor-QA-findings.md` | QA findings and the full change list, in execution order | Yes |
| `vendor/` | Third-party libraries, Electron runtime, native tracker / PDF tool, Whisper speech model (~640 MB) | No: restore from the DMG |
| `dist/` | Build output | No |

## First-time setup

Restores `vendor/` from the release DMG. Your `src/` is never overwritten:

```bash
python3 -I tools/restore_from_dmg.py "/path/to/Video Visor-0.14.0-arm64.dmg"
```

## Build

Dev build: named "Video Visor Dev", with its own data folder (`~/Library/Application Support/Video Visor Dev`), so it never touches real projects:

```bash
python3 -I tools/build.py
```

Release build (uses the real data folder), with a DMG:

```bash
python3 -I tools/build.py --release --dmg
```

A build takes about 10 seconds. Builds are signed ad hoc, which works on this Mac only. To share with colleagues, sign and notarise with the company's Developer ID (once: `xcrun notarytool store-credentials PROFILE`):

```bash
python3 -I tools/build.py --release --dmg --identity "Developer ID Application: Company (TEAMID)" --notarize PROFILE
```

The version is written only in `package.json`. To tell installed copies about a new version, set `"updateFeed"` there to an https URL of a JSON file such as `{"version":"0.16.0","url":"https://…/Video Visor.dmg","notes":"…"}`.

## Checks and helper tools

| Command | What it does |
|---|---|
| `python3 -I tools/preview/serve.py 8766` | The app in a browser with a stand-in backend; then `await (await import('/__preview/qa.js')).run([0, 20])` in its console runs the regression checks in batches |
| `VV_BENCH=1 VV_BENCH_ONLY=export,audio,tools "dist/Video Visor Dev.app/Contents/MacOS/Video Visor"` | Real-engine checks in the Dev build (export speed, sound mix, file tools, recovery…; see `src/bench.cjs`) |
| `python3 -I tools/theme_dark.py` | Regenerates the dark theme and minimum text size from the stylesheets; run after changing CSS |
| `python3 -I tools/dead_code.py` | Lists functions nothing calls (`--remove` deletes them) |
| `tools/preview/contrast.js` | In the preview console: lists text with too little contrast on the current screen |

## Not recoverable from the DMG

These are kept as compiled binaries in `vendor/` and work as they are. Changing them would need their original source or a rewrite:
- `vendor/resources/native-bin/visor-utilities` (blur tracking, PDF text, OCR, background removal)
- `vendor/resources/speech/whisper-cli` and its model

The third-party libraries in `vendor/node_modules` are the exact versions that shipped. Updating them later needs Node.js and npm.
