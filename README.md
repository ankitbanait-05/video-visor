# Video Visor

Local desktop video editor, screen recorder and file tools for macOS (Electron 45, Apple Silicon).

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

A build takes about 10 seconds. Builds are signed ad hoc, which works on this Mac only. Sharing with colleagues needs a Developer ID signature and notarisation (change list item DS-01).

## Not recoverable from the DMG

These are kept as compiled binaries in `vendor/` and work as they are. Changing them would need their original source or a rewrite:
- `vendor/resources/native-bin/visor-utilities` (blur tracking, PDF text, OCR, background removal)
- `vendor/resources/speech/whisper-cli` and its model

The third-party libraries in `vendor/node_modules` are the exact versions that shipped. Updating them later needs Node.js and npm.
