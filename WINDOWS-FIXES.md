# Windows fixes — HIGH-priority batch (branch `windows-high-fixes`)

From the Windows 11 test pass of 16 Nov 2026. Seven fixes, one commit each, on top of `main` at 78c5278.
Nothing is pushed, the version is unchanged, and `main` is untouched.

| # | Fix | Commit | Files |
|---|-----|--------|-------|
| 1 | Export no longer fails on titles/captions containing "Mac" or "⌘" | `98c7e36` | `src/platform-text.js` |
| 2 | Visual C++ runtime shipped with the speech engine and onnxruntime | `0156b83` | `.github/workflows/windows.yml` |
| 3 | Tool output files are no longer locked until the app quits | `5348750` | `src/main.cjs`, `src/engines/tools.cjs`, `src/engines/win-helper.cjs`, `src/connector/host.cjs`, `src/engines/file-response.cjs` |
| 4 | Windows paths shown correctly in the page; "Show in File Explorer" | `41b144d` | `src/runtime.js`, `src/shell.js`, `src/runtime-v13.js` |
| 5 | Single-instance lock | `e89e825` | `src/main.cjs` |
| 6 | Word timings keep zero-length words | `171ba41` | `src/engines/transcript.cjs`, `tools/transcript_test.cjs` (new) |
| 7 | Compress PDF really compresses on Windows | `af921f8` | `src/engines/win-helper.cjs`, `src/engines/tools.cjs`, `src/shell.js` |

How things were tested here: no Python and no installer build on this PC, so the checks are Node scripts against the repo's
`src`, the test-pass tools harness (`video-visor-testing/drv/tools_e2e.cjs`) pointed at the repo's engine code with libraries
from the installed 0.15.0 app (`ELECTRON_RUN_AS_NODE=1 "Video Visor.exe" …`), and `node --check` on every changed `.js`/`.cjs`.
The installed app and `%APPDATA%\video-visor` were not modified.

---

## 1. Export fails if a title or caption contains "Mac" or "⌘"

**What changed** (`src/platform-text.js`)
- Returns immediately under `?render`, so the offscreen export renderer is never touched.
- Never rewrites user content. Text and `title`/`aria-label`/`placeholder` attributes are skipped inside:
  `#ed-canvas`, `#ed-layers`, `#ed-captions`, `#ed-clips`, the element/audio tracks, `.ed-layer`, `.ed-transcript-row`,
  caption lists/text, media cards (`.v5-media*`), project cards/list (`.v10-project`, `#v20-projects`), file lists and tool
  results (`#v-filelist`, `.v15-file(s)`, `.v15-result`, `.v15-clip-name`), job rows (`.v10-job`, `.v13-job`),
  `.projecttitle`, `pre`/`code` (connector config, address and token that the Copy buttons copy), `canvas`, `video`,
  `contenteditable`, and anything marked `data-no-platform-text`. Form-field values are never rewritten (placeholders still are).
- Because the connector's `pre.v13-code` blocks are no longer rewritten, the Copy buttons copy the original text.

**Verified**: a page loading the new script in the in-app browser (Chromium, `navigator.platform` = Win32):
UI text, tooltips and placeholders are rewritten ("Press ⌘K on this Mac" → "Press Ctrl+K on this PC", including nodes added later).
A layer whose text is rewritten every 10 ms ("Recorded on my Mac N"), a media card name, a `pre` config block, contenteditable
text, an input value and a `data-no-platform-text` block all stay as written. With `?render` nothing is rewritten.

**Still to check on a Windows build**: export a project with a title "Recorded on my Mac" and a caption with "⌘" (should export).
Check the editor canvas shows "Mac" as typed, and the connector Copy buttons paste the original text.

## 2. Speech engine and background removal need the VC++ runtime

**What changed** (`.github/workflows/windows.yml`)
- The whisper.cpp step now copies only `whisper-cli.exe`, `whisper.dll` and `ggml*.dll`. The app only runs `whisper-cli.exe`
  (checked in `src/`). Tests, demos, servers and parakeet are no longer shipped.
- New step **"Bundle the Visual C++ runtime next to the speech engine and onnxruntime"**: copies `msvcp140.dll`, `msvcp140_1.dll`,
  `msvcp140_2.dll`, `msvcp140_atomic_wait.dll`, `msvcp140_codecvt_ids.dll`, `vcruntime140.dll`, `vcruntime140_1.dll`,
  `concrt140.dll` and `vcomp140.dll` into `speech-win/` and `node_modules/onnxruntime-node/bin/napi-v6/win32/x64/`. It takes them
  from Visual Studio's `VC\Redist\MSVC\<latest>\x64\Microsoft.VC*.CRT|OpenMP` (found with vswhere), falling back to `System32`, and
  logs each file's version. It fails the build if any are missing.
- New step **"Test the speech engine (inside the packaged app)"**: checks that the DLLs are in the package, makes a 2 s tone with
  the bundled ffmpeg, runs `whisper-cli` the way the app does (`-ojf -of <base>`), and fails unless `transcript.json` is written
  and parses.

**Verified here**: imports checked with `peimports.cjs` on the installed build. whisper-cli/whisper/ggml import
MSVCP140, VCRUNTIME140(_1), and ggml-base/ggml-cpu-* also VCOMP140. onnxruntime.dll imports MSVCP140(_1, _ATOMIC_WAIT) and VCRUNTIME140(_1).
`onnxruntime_binding.node` imports MSVCP140/VCRUNTIME140(_1). No other native module in app.asar.unpacked imports the VC runtime,
and qpdf already ships its own. The YAML parses (js-yaml) and every `pwsh` step parses with the PowerShell parser.
All nine DLLs exist in this PC's System32. The new smoke command, run against the installed app, exits 0 and writes valid JSON.

**Still to check**:
- The CI run: watch the new step's log for the DLL sources and versions, and the speech smoke test.
- **Clean-PC test** (Windows Sandbox or a fresh VM *without* the VC++ redistributable; first check `C:\Windows\System32\vcruntime140_1.dll`
  is absent): install the CI installer, then run Captions (speech) and Remove background. Both should work.
- The installer size should drop noticeably because the whisper.cpp extras are gone.

## 3. Tool output files stay locked until the app quits

**Cause found**: sharp's libvips operation cache. `register()` reads every image tool result back
(`sharp(file).metadata()`) to make its thumbnail, and the cache kept that file open. Reproduced with the installed sharp:
after convert → read back, renaming the WebP fails with `EBUSY`. With `sharp.cache(false)` it is free.
The `visor://media` stream was *not* the cause: Node opens read streams with delete-sharing, so a file being streamed can still be
moved (tested).

**What changed**
- `sharp.cache(false)` wherever sharp is loaded: `register()` in `main.cjs` (plus once for the whole main process 1.5 s after
  start-up), `engines/tools.cjs`, `engines/win-helper.cjs` (PDF thumbnail and background removal), `connector/host.cjs`.
- `engines/file-response.cjs`: the media stream is destroyed when the page aborts its request (and nothing is opened for a request
  that is already aborted). This is fd hygiene for seeks and closed thumbnails. Cancelling the body already destroyed the stream via
  `Readable.toWeb`.

**Verified**: the tools harness, run against the repo's engines with a "can every output be renamed right away?" check after
each tool and its read-back, gave 2 locked files before (`photo café-edited.webp`, `graphic-edited.webp`: EBUSY) and 0 after,
across 38 tool runs. A `file-response` unit test covers abort mid-stream, body cancel, a range request (206 + Content-Range), and
an already-aborted request.

**Still to check**: in the app, convert an image to WebP, then move or delete the result in File Explorer while the app is still open.

## 4. Renderer splits file paths on '/'

**What changed**
- `window.vvPath` at the top of `src/runtime.js` (bootstrap loads it before `shell.js` and `runtime-v13.js`):
  `base` / `dir` split on `/[\\/]/`; `dir` gives `C:\` for drive-root files and `/` for Mac root.
  `isAbs` uses `/^(\/|[A-Za-z]:[\\/]|\\\\)/`. `home` shortens `/Users/<name>` and `C:\Users\<name>` to `~`. `revealLabel()` gives
  "Show in File Explorer" when `native.platform==='win32'`, else "Show in Finder".
- Used in `toolResultV15` (name, folder line, asset match for thumbnails/Open on multi-file results, home shortening, reveal label),
  `v10Job` (absolute-path test, name, folder, reveal label), the export-complete dialog in `runtime.js`, and the render queue in
  `runtime-v13.js` (name, reveal label). All 4 visible "Show in Finder" labels now use `revealLabel()`; the remaining mention
  is a code comment. No other path splitting was found (the remaining `split('/')` calls are aspect ratios like `16/9`).

**Verified**: a unit script loads the real `vvPath` and `v10Job` from the repo files and checks Windows, Mac, UNC, drive-root and
bare-name paths, home shortening, labels for win32 and darwin, a job row with a `C:\` path (Open and Show buttons present,
correct name and folder), and a non-path job. 34 checks pass.

**Still to check**: in the app, a multi-file tool result (e.g. PDF to images) shows names, folders and thumbnails. Jobs have
Open/"Show in File Explorer", and the export dialog and render queue show the file name only.

## 5. No single-instance lock

**What changed** (`src/main.cjs`, after `userData` is set so `VIDEO_VISOR_TEST_HOME` test folders keep their own instance):
`if(!app.requestSingleInstanceLock()){app.quit();return;}`. The top-level `return` (valid in CommonJS) means a second process never
registers handlers, opens windows or starts the connector. On `second-instance` the window is restored, shown and focused. Then
any media paths in argv (resolved against the second launch's working folder, flags skipped, existing files only, known
media extensions, no duplicates) are imported with `importMany` and added to the open project via `window.nativeImport(false, assets)`.

**Verified**: the lock block was run from the repo's `main.cjs` against a fake `app`/`win`. No lock → `app.quit()` and the rest
of main is skipped. Lock → the handler is registered. A second launch with
`[exe, --flag, relative.mp4, absolute café.jpg, report.pdf, missing.mp4, Hindi-named .mp4, duplicate]` → restore/show/focus, then
it imports exactly the three existing media files. A plain second launch only focuses. `node --check src/main.cjs` passes.

**Still to check** (needs the real app): launch twice from the Start menu (one window, comes to the front). Run
`"Video Visor.exe" "C:\path\clip.mp4"` while open (clip added to the open project). Check the connector keeps its port.

## 6. Word timings drop words

**What changed** (`src/engines/transcript.cjs`): new `timeTokens()`. Zero-length text tokens are kept. A run of them shares
the time up to the next token's start (at most 0.5 s each). If there is no room, each gets 40 ms, taken from the following
word when it is long enough. A last-in-segment zero-length word runs to the segment end. A final pass keeps words sorted and
non-overlapping. Special `[_…]` tokens and empty text are still ignored, and clamping to the media length is unchanged.

**Verified**: `node tools/transcript_test.cjs` has 14 checks, including the exact `" This@3200 | is@3200 | a@3200"` sequence,
spreading, the 0.5 s cap, segment end, a zero-length suffix ("Ankit" + "'s"), unchanged normal timings, clamping and two segments.
The old parser fails it. Real data: `speech.wav` transcribed with the installed Windows whisper-cli using the app's arguments had
11 zero-length tokens. The old parser lost 9 of 29 words; the new one keeps all 29, with valid, ordered timings.

**Still to check**: word-by-word captions and edit-by-text on a Windows transcription.

## 7. PDF compress doesn't compress on Windows

**What changed**
- `engines/win-helper.cjs` → `compressPdf()`:
  - pdf-lib walks image XObjects. It re-encodes 8-bit DeviceRGB, DeviceGray and ICCBased (1 or 3 components) images with
    `/DCTDecode` or `/FlateDecode` (including PNG predictors 10–15), using sharp to JPEG (mozjpeg) at the preset quality, resized to
    the preset's longest side.
  - It skips small images, CMYK/Indexed/other colour spaces, `/Decode`, image masks and colour-key masks, and any image that
    doesn't get at least 5% smaller. Soft masks are kept.
  - Then qpdf runs with `--object-streams=generate --compress-streams=y --recompress-flate --compression-level=9`. That result
    is compared with qpdf on the untouched file, and the smaller one is kept.
  - If nothing is smaller than the input, the **original bytes** are saved and the note says the PDF was already optimised. If
    pdf-lib can't open the PDF (e.g. encrypted), it falls back to qpdf only.
- Option names: the UI (`shell.js`) sends only `v-option: 'Optimize for screen'` → quality 70, max 2000 px. Also accepted
  for later: `Recommended` (same), `Strong compression`/`Strong` (q55, 1500 px), `Less compression`/`Light` (q85, 3000 px).
  Unknown values use the default.
- The helper returns `{ paths, note }`. `tools.cjs` passes `note` on, and `toolResultV15` shows it under "Saved", e.g.
  "Compressed from 1.3 MB to 217 KB (84% smaller, 3 images re-encoded)." The Mac path (native helper) is unchanged.

**Verified** (installed qpdf, sharp and pdf-lib; repo engine code):
- `report with photos.pdf`: 1,394,079 → 222,120 bytes. Images are 2000×1500 JPEG. Page renders match (mean diff 0.35/255).
- Strong: 120,268 bytes.
- Compressing the result again: unchanged, with the "already optimised" note.
- `form.pdf` (2 KB, no images): byte-identical, with the "already optimised" note.
- A synthetic PDF with Flate RGB, Flate RGB with a soft mask, and Flate grey with a PNG Up predictor: 5.2 MB → 1.2 MB. All three
  re-encoded, the mask kept, renders match (mean diff 3.6/255).
- `tools.cjs` → `processTool('pcompress')` returns the path and note.
- Full tools harness, after all seven fixes: see "Whole-batch check" below.

**Still to check**: in the app, compress a scanned PDF and a text-only PDF, and check the note shows. Open the results in a PDF
viewer such as Edge or Acrobat. Signed PDFs lose their signatures when compressed (the whole file is rewritten); this was
already true with qpdf.

---

## Whole-batch check

The test-pass harness (`drv/tools_e2e.cjs`), with engine code loaded from this branch, ran every file tool on
`media/My Test Files (Win)`. Results: 38 OK. The 7 errors are the same as on unmodified `main`: 5 deliberate error cases, plus
`frame-last` and `ocr-image`, whose inputs the engine rejects as designed. 0 output files were locked (2 on `main`).
`pcompress` gives 222,120 bytes, 3 pages. `node --check` passes on every changed file.

The verification scripts are in this session's scratchpad, not the repo; `tools/transcript_test.cjs` is the only new test in
the repo. To run the harness against a repo checkout, load `tools.cjs`/`probe.cjs` from `<repo>/src/engines`, and set
`NODE_PATH=<resources>/app.asar/node_modules` so the engines find sharp, pdf-lib and the rest.

## Second batch: MEDIUM / LOW (done 17 Nov 2026)

| # | Fix | Commit |
|---|-----|--------|
| 8 | Console windows no longer flash: windowsHide on the 8 ffmpeg runs that lacked it (export ×5, direct export, thumbnails, pause detection) |  |
| 9 | No Mac wording left: Windows Settings steps for camera/microphone, "taskbar tray", AI keys "encrypted with your Windows account", 'this PC' in text sent to AI assistants, Ctrl+Shift+2 in the tray tooltip, Windows privacy link, Hindi falls back to Nirmala UI |  |
| 10 | Shortcuts: Ctrl+Y redo, Ctrl+click multi-select, Edit → Undo/Redo act on the project on Windows, Ctrl+wheel zooms 25% per notch |  |
| 11 | Managed AI keys read from %ProgramData%Video Visormanaged.json; connector accepts a drive root (E:) |  |
| 12 | Exports use the GPU encoder when present (NVIDIA NVENC → Intel QuickSync → AMD AMF), x264 fallback; speed changes skip VideoToolbox on Windows |  |
| 13 | Dialogs titled "Video Visor" (data folder unchanged), file-type filters in Open dialogs, one entry per microphone, recorder panel fits at 175% |  |
| 14 | Text swap never loops and never touches timeline text (regression from #9, found while testing; the released 0.15.0 did not freeze) |  |

"Render progress stuck at 0%" needed no change: progress is wired; it only stayed at 0% in renders that failed with bug #1.

### How the second batch was checked
A runnable copy of the branch was made from the installed 0.15.0 app (its  swapped for an
 folder holding this branch's ), started on a fresh profile and driven through its own page:
- A project with a title "Recorded on my Mac with ⌘ shortcuts" plus word captions exports; the frame shows the title as typed;
  progress counts 0 → 96 → done; the file has no x264 signature (NVENC on this PC).
- Image converter: the Open dialog offers "Images / All supported files / All files"; the result shows name, ,
  thumbnail, Open and "Show in File Explorer"; the output could be renamed while the app was open.
- A second launch on the same profile exits by itself (exit 0) and leaves one window.
- An import error box is titled "Video Visor".
- Recorder: one entry per microphone; the panel is 651 px tall with 651 px of content (no scrolling); hint says Ctrl+Shift+2 / tray.
- Editor (Ctrl+A, Delete, then Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z): 2 → 0 → 2 → 0 → 2 → 0 clips.
- Opening and closing the recorder twice: the main window stays responsive.
- Captions on the spoken test file: every word present ("This is a test …", "We are checking …").
- All 45 tool cases of the test-pass harness, run on the branch code: same pass/fail per tool as the released app;
  Compress PDF 1,394,080 → 222,120 bytes.
- Unit scripts: ,  (new) pass;  on every changed file.

### Still to check on a CI-built installer
- Everything above once more on the real installer, plus a clean-PC test (no VC++ runtime) for #2.
- #12 on an Intel-only and an AMD PC (only NVIDIA and QuickSync were present here).
- #11 managed keys with a real %ProgramData% file; the connector with Claude Desktop and a drive-root folder.
- The Edit menu Undo/Redo by mouse (the keys were tested; the menu clicks were not).
