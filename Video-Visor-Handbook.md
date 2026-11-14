# Video Visor improvement handbook

Written after testing 0.15 (Phases 0–12) as both an editor and a product reviewer. Nothing in this document is built yet. Agree on it first, then work through it phase by phase.

**Priority:** **P0** means broken or misleading; fix first. **P1** means a clear improvement people will notice. **P2** means polish.
**Size:** **S** is under half a day. **M** is one to two days. **L** is three days or more.

---

## 1. The problems you reported

### 1.1 Changing speed looks stuck at 99% (P0, S)

**What happens.** The render itself is quick. A 32-second recording at 3456 × 2234 changes to 4× in about 4 seconds. The problem comes after:

- The progress dialog opens as soon as the first progress message arrives ([runtime.js:98](src/runtime.js:98)).
- When the render finishes, `applySpeedV15` ([editor.js:1229](src/editor.js:1229)) updates the clip but never closes the dialog.
- The bar stays at 99% (the progress is capped at 99 until the file is done), and you have to close it by hand.

**Why a new file appears in Media.** This is by design: a speed change renders a sped-up copy (`speed-<id>.mp4`) and adds it to the project's media. The original is kept, which is how "Normal" goes back. But:

- The copy shows up in Media with a random name.
- Every new choice of speed makes another copy. Your screenshot shows three.
- Old copies stay in the media list (Settings → Storage only clears copies no project uses).

**Fix.**
1. Close the dialog when the speed is applied, failed or cancelled.
2. Show speed copies under their clip's name (for example "Product demo · 2×"), or hide them from Media entirely. I recommend hiding them: they are an internal detail.
3. Delete the previous speed copy for a clip when a new speed replaces it, if nothing else uses it.
4. Remember copies by source, range and speed, so choosing 2× → 4× → 2× reuses the first 2× copy instead of rendering again.
5. Show the result straight away: preview the new speed by playing the original faster (a playback-rate change) while the copy renders in the background. The panel shows "Preparing 2×…" without blocking. Constant speeds can work like this; speed curves keep the short wait.

### 1.2 Export is slow (P0, L): plan in section 2

### 1.3 Collapsed timeline rows are dark in light mode (P0, S)

**Cause.** When Captions, Text & graphics or Effects is collapsed, a thin strip row (`.v10-strip`) is drawn. Its base colour is dark (`#161a20`, [editor-v10.css:73](src/editor-v10.css:73)), and the light theme only overrides its hover colour.

**Same problem found in the scan:** the transition preview tiles (`.v5-transition-demo`) are also dark in light mode.

**Scan results.** I checked every main screen and every editor panel in both themes, plus a selected clip and the export dialog: text contrast and surfaces that don't match the theme. Apart from these two (and the video canvas, which is meant to be dark), both themes are clean.

**Process fix.** The light theme is a hand-written override layer, so every new dark rule can leak through. Add a check to the preview suite that fails on dark surfaces in light mode and light surfaces in dark mode, so this can't come back unnoticed. The recorder window and dialogs opened from inside panels need the same check.

---

## 2. Export speed plan

### Where the time goes today

Every export, even a plain cut of one recording, draws each frame in a hidden browser window, captures it and sends it to the encoder.

Measured in the real app (20 s at 1080p30 with one title):

| Step | ms per frame |
|---|---|
| Move the video to the exact frame (seek) | 9.6 |
| Draw (including waiting for the frame) | 12.7 |
| Capture the window | 6.9 |
| Convert and send to the encoder | 1.9 |
| **Total** | **≈ 26 (1.3× real time)** |

Your recordings are 60 fps at about 3.5K, so there are twice the frames and over three times the pixels. A 2-minute export can take 5 minutes or more. Hardware encoding is already on; it isn't the bottleneck.

### The plan, in the order I'd build it

| # | Change | Expected gain | Size |
|---|---|---|---|
| E1 | **Direct path for plain stretches.** Wherever the timeline has no text, graphics, captions, zoom or blur, build the video with FFmpeg directly (cut, scale, fade, speed) instead of drawing frames in the browser. Only stretches with graphics go through the browser. The pieces are joined at the end. | 5–15× on typical "recording + a few titles" projects | L |
| E2 | **Graphics drawn separately and laid on top.** For stretches with graphics, draw only the graphics layer (transparent) in the browser and let FFmpeg lay it over the decoded video. That removes the 9.6 ms seek, which is the slowest step. Graphics that don't change are drawn once and reused. | 2–4× on stretches with graphics | L |
| E3 | **Capture without the window step.** Use offscreen rendering, which hands over each painted frame directly, instead of `capturePage` + `toBitmap`. | About 25% | M |
| E4 | **Render in parallel.** Split long exports into 2–3 chunks rendered in separate hidden windows, then join them. Apple-silicon Macs have the cores for it. | 1.8–2.5× on long exports | M |
| E5 | **Sensible frame rate.** Screen recordings at 60 fps export at 30 fps unless chosen otherwise (the Custom setting stays). Most shared screen demos don't need 60. | 2× for those exports | S |
| E6 | **Re-use unchanged parts.** Keep rendered chunks keyed by their content; exporting again after a small change re-renders only what changed. | Large for "fix a typo and export again" | M |
| E7 | **Honest progress.** Show both stages (picture, then sound), and a time estimate based on the measured speed of the first seconds. | Feels faster; avoids "stuck" | S |

**Plain stretches with no graphics.** These can also skip re-encoding when the source already matches the export settings. They are cut on keyframes and only the joins are re-encoded, so a plain trimmed recording exports in seconds.

**Order:** E7 and E5 first (quick), then E1 (largest gain), then E3, E2, E4 and E6. Each step is checked against the current output for picture match (PSNR against the browser render) and sound sync, using the existing benchmark (`VV_BENCH_ONLY=export,audio`).

**Expected result:** a 2-minute 1440p screen recording with a few titles exports in under a minute (today about 5). A plain trimmed recording exports in seconds.

---

## 3. Keyframes (new feature, P1, L)

**My view:** your idea is the right one. A diamond next to each property is the standard pattern in Premiere, After Effects, Resolve and CapCut, so anyone who has edited before will recognise it. It is also the simplest model to explain.

**How it works:**

- **Where:** in the clip panel (and the text/graphic and overlay panels), each animatable property gets a small diamond before its slider: Position X, Position Y, Scale, Rotation and Opacity. Crop and volume can follow later.
- **Diamond states:**
  - Hollow: no animation.
  - Filled: a keyframe exists at the playhead.
  - Half / outline-blue: the property is animated, but not at this exact time.
- **Turning it on:** click the hollow diamond. The property is now animated, and a keyframe is added at the playhead with the current value.
- **Adding keyframes:** move the playhead and change the slider. A keyframe is added automatically (auto-key once a property is animated, like CapCut). This is the "change the property and the keyframe is added" flow you described.
- **Moving between keyframes:** small ◀ ▶ arrows next to the diamond jump to the previous or next keyframe. Clicking a filled diamond removes that keyframe.
- **Easing:** the default is "Smooth" (ease in-out). A per-keyframe choice of Linear, Smooth, Ease in or Ease out is available by right-clicking the diamond. No curve editor in the first version.
- **On the timeline:** a selected clip shows small diamonds along its bottom edge. You can drag them to change timing and press Delete to remove one.
- **On the canvas:** while a clip is selected, dragging it on the preview at a new time adds a position keyframe. A thin path line shows where it moves.
- **"Remove animation":** at the bottom of the clip panel, to clear all keyframes in one step.
- **Presets:** "Ken Burns (slow zoom)", "Slide in", "Pop in", "Zoom to point". Each adds a ready set of keyframes, which most colleagues will use more than hand-made ones.

**Why this is practical here:** the export draws every frame with the same code as the preview. Keyframe values worked out in one place show up identically in the export, with no separate export work. (With E1, a clip that has keyframes simply takes the browser path.)

**Effect on existing features:** "Focus & zoom" regions become a preset on top of keyframes later. They don't need to change now.

---

## 4. Preview zoom (P1, M)

There is no way to zoom into the preview today.

- **Pinch to zoom** on the trackpad over the preview (and ⌘ + scroll on a mouse). Zoom centres on the pointer.
- **Moving around:** two-finger scroll moves the view while zoomed. Space + drag also pans, as in design tools.
- **Zoom menu** in the bar under the preview, next to "16:9 · Fit": Fit, 50%, 100%, 200% and 400%, with a "Fit" button to get back.
- **Shortcuts:** ⌘ + / ⌘ − to zoom, ⌘ 0 to fit.
- **Scope:** zoom only changes your view. It never changes the video. The playhead controls stay where they are.

---

## 5. File tools redesign (P1, M)

You're right that the right-hand "Output settings" column wastes space and the text is noise.

**New layout (one column):**

1. **Header.** Back to the group, then the tool name. Remove the "Local processing" badge and the sub-text unless it tells you something you need.
2. **Files area (full width).**
   - Before any file is added, a large drop zone with "Choose files".
   - Once files are added, the drop zone shrinks to a small "Add more" button. Each file shows as a card with a **thumbnail** (image, video frame, first PDF page or waveform), name, size and ×.
   - Reorder arrows appear only where order matters (Merge PDFs, Images to PDF).
3. **Settings strip under the files.** Only the settings that tool has (format, quality, size…), in one row, collapsed behind "Format & quality" when there are more than two.
4. **One primary button named after the result:**

   | Tool | Button |
   |---|---|
   | Video frame to image | Save frame |
   | Trim | Save trimmed video |
   | Video to GIF | Make GIF |
   | Compress | Compress video |
   | Remove background | Remove background |
   | Merge PDFs | Merge PDFs |
   | Sign PDF | Save signed PDF |

   "Process files" goes everywhere.

**Remove:**
- "Save these settings as a preset".
- "Processing runs locally. Choose an output folder."
- "Files stay on this device."
- "Foreground extraction runs on this Mac…" (say it once in Settings or the About text).

**Wrong file types.** Files the tool can't use are refused when added, with a clear message. Today a video can sit in the Remove background list and fail only when processed.

**Results.** Show the result in the page, not in a dialog: a thumbnail of the output, with **Open**, **Show in Finder** and **Save another**.
- The current "Files ready" dialog has three buttons of different weights stacked unevenly. It goes away.
- For background removal, show before and after side by side on a checkerboard.

**Small fix:** the status line at the bottom of the window kept the editor's last message ("4 caption segments generated…") on tool pages. *Fixed in Phase 13.*

---

## 6. Editor review: other findings

### Clarity (P1)

1. **The tab highlight doesn't match the panel.** When you select a clip, the panel changes to "Clip", but the old tab (for example "Style") stays highlighted. Highlight nothing, or show a "Clip" breadcrumb, while the clip panel is open.
2. **Speed is under Effects, but it needs a selected clip.** Move Speed into the clip panel; it already has a Speed row there, so keep only that one. Keep Effects for things added to the timeline (zoom, blur, cover).
3. **Too many top-level tabs (8).** Merge Adjustments into the clip panel (colour is a clip property) and Style into Text & graphics. That leaves six: **Media, Text & graphics, Captions, Audio, Effects, Transitions**.
4. **Undo and redo** sit between the tabs and Magic Edit. Move them to the left of the project name, where most editors put them, and show the shortcut in the tooltip.
5. **Media cards.** Each card has Add, Overlay and Delete. Make dragging to the timeline the main action, keep **Add** as a button, and move Overlay and Delete into a "⋯" menu, to cut the visual noise per card.
6. **Timeline.** "Show all tracks" and "Fit timeline" read as the same kind of button. Use icon buttons with tooltips on the right and keep Split, Delete and Snap on the left.

### Editing power (P1–P2, in rough order of value)

1. **Keyframes** (section 3) and **preview zoom** (section 4).
2. **Ripple delete and gap closing** (P1, M). Deleting a clip should close the gap by default, with ⌥ to leave the gap.
3. **J / K / L playback and I / O marks** (P1, S). The standard editor keys for shuttling and marking a range.
4. **Multi-select and group move** on the timeline (P1, M). ⇧-click and drag a box to select several items, then move or delete them together.
5. **Copy and paste attributes** (P2, M). Copy a clip's position, scale or colour and paste it onto other clips.
6. **Markers** (P2, S). Press M to drop a marker; markers can become chapters.
7. **Audio waveform zoom and volume line on clips** (P2, M). Drag the volume line on the clip itself, like other editors.
8. **Snapping feedback** (P2, S). A vertical guide line when snapping to the playhead or another clip's edge.

### Reliability and performance (P1)

1. **Speed copies, edit copies and previews pile up** (see 1.1). Settings → Storage shows them, but nothing cleans them automatically. Delete copies no project uses after 7 days.
2. **Long recordings preview smoothly only after an edit copy is made.** Show a small "Optimising for smooth playback…" note in the Media card instead of nothing.

---

## 7. Home, Projects, Settings, Recorder

- **Home and Projects overlap.** Home shows the same cards as Projects. Make Home a short start page: New video, Record screen, Draft with AI, the last 4 projects and the 4 most-used tools. Keep the full list in Projects, with search and sort (Edited, Name, Duration).
- **Project cards.** "Render…", "Rename", "Duplicate" and "Delete" are always visible. Move them into a "⋯" menu, so a click on the card opens the project and nothing else.
- **Settings.** Group it into General, Appearance, Storage, AI and About. Today Storage and Appearance sit in one long page.
- **Recorder.** These still need a check by hand, on a real Mac with the permission turned off:
  - Recording with Mac sound.
  - The permission message.
  - Recovery after a crash.
  - The recorder window in dark mode.

  Add a countdown (3-2-1) and a visible "Stop" shortcut in the menu bar while recording.

---

## Phase 13 status

| Item | Status |
|---|---|
| Speed dialog stuck at 99% | Fixed: it closes when the speed is applied, fails or is cancelled. |
| Speed copies in Media | Hidden from Media (the recommended choice). |
| Choosing a speed you already tried | Reuses the earlier copy: 0 ms instead of 1.6 s in the benchmark. |
| Old speed copies | Kept so Undo still works. Settings → Storage removes copies no project uses. |
| Showing the new speed while the copy renders (1.1, step 5) | Not done; moved to Phase 16 with the other editor work. |
| Light-mode collapsed rows and transition tiles | Fixed. A new preview check fails on any surface in the other theme's colour. |
| Status line on tool pages | Cleared when changing pages. |
| Wrong file types in tools | Refused when added, with a message saying which files the tool takes. |
| Frame-tool ruler showing "00:00.0" twice | Not a bug: the label was "00:06.0", misread from a low-resolution screenshot. |
| Transition tiles all disabled after switching from a project with more clips | Found while testing and fixed: the panel remembered a clip boundary that no longer existed. |
| Empty "no footage yet" projects | Not a real-app problem: New video only creates a project once footage is chosen. Your workspace has none; the ones seen came from preview tests. |

## Phase 14 status

Measured in the real app (`VV_BENCH_ONLY=export`). "Before" is the export window for every frame; "after" is Phase 14.

| Project | Before | After | Picture vs. before |
|---|---|---|---|
| Your recording (32 s, 3456 × 2234, a title for 5 s) at 1080p | 41.8 s | 9.3 s (4.5×) | 37.3 dB |
| The same at 1.5× speed | 28.1 s | 6.8 s (4.2×) | 37.3 dB |
| Test pattern (20 s, 1080p, a title for 5 s) | 15.8 s | 5.1 s (3.1×) | 39.9 dB |
| Test pattern, two clips with a cut | 11.2 s | 5.4 s (2.1×) | 40.4 dB |

(Above 35 dB the pictures look the same; the small difference is how Chrome and FFmpeg scale.) With **Automatic** frame rate, a 60 fps recording also exports half as many frames, so it is roughly twice as fast again.

| Item | Status |
|---|---|
| E1 Direct path | Done. Stretches with nothing on top of the footage are decoded and encoded by FFmpeg (two at a time) while the export window draws only the stretches with titles, captions, zooms, transitions and so on. The pieces are joined without re-encoding. |
| Safety check | Before a clip uses the direct path, one of its frames is made both ways and compared. A clip that doesn't match (say, because of an effect the planner doesn't know about) stays on the export window. This caught two real mismatches while building it (colour conversion, and a one-pixel offset on your recording), both now fixed. |
| Colour (found while testing) | Every export so far converted colours with the wrong standard (BT.601 instead of BT.709) and didn't label them, which shifted greens and reds slightly. Fixed for all exports: the export now matches its source at 33–35 dB instead of 26 dB. |
| E5 Frame rate | New **Automatic** setting, the default: the footage's frame rate, up to 30 fps. **Match source** keeps 60 fps. Also used by the render queue and the size estimate. |
| E7 Progress | Shows "Step 1 of 2 · Picture · 45% · about 0:20 left", then "Step 2 of 2 · Sound". |
| WebM and GIF | Unchanged path (WebM decodes plain stretches directly but uses one encoder; GIF uses the export window). |
| Not done | E2, E3, E4 and E6 (Phase 18). E4 (parallel windows) matters less now that plain stretches run in parallel already. |

## Phase 15 status

| Item | Status |
|---|---|
| One column | Done. The right-hand "Output settings" column is gone. In order: back arrow and tool name, files, the tool's settings, then one button. |
| Header and text | Done. Removed: "Local processing", the tool's tagline, "Files stay on this device", "Processing runs locally. Choose an output folder.", "Save these settings as a preset", "Foreground extraction runs on this Mac…", "The original stays untouched", "Choose times within your recording". The password note is now just "The password isn't saved." |
| Files | Done. Each file is a card with a thumbnail (a frame for videos and images, the waveform for audio, the first page for PDFs, drawn by Quick Look), plus its length, size and dimensions. Once files are added, the drop area shrinks to "Add more files"; you can still drop files anywhere on the page. Reorder arrows appear only on Merge PDFs and Images to PDF. |
| One-file tools | Frame, Trim, GIF, Trim audio and Sign PDF keep one file: picking several uses the first and says so. |
| Settings | Done. The tool's own settings sit in a strip under the files: two in view, the rest under "More settings". Settings with only one choice stay hidden. |
| Button | Done. Named after the result: "Save frame", "Remove background", "Merge PDFs", "Compress video", "Save signed PDF" and so on. |
| Result | Done. Shown on the page instead of the "Files ready" dialog: a card per output with a thumbnail, Open and Show in Finder, plus "Start again". Remove background shows before and after, side by side on a checkerboard. |
| Video tools | The file card now stays visible above the player (it was hidden). The redundant "Use another video" button is removed, and the hint is shorter. |
| Under the hood | Settings without a name (resize width and height, watermark text and page numbers, frame time) now have one, so moving a field can't send the wrong value to the engine. |

## 8. Decisions needed from you

1. **Speed copies:** hide them from Media (recommended), or show them named after the clip?
2. **Export frame rate:** default 60 fps screen recordings to 30 fps on export (recommended), or keep the source rate?
3. **Tabs:** merge Adjustments into the clip panel and Style into Text & graphics (8 → 6 tabs)?
4. **Keyframes:** start with Position, Scale, Rotation and Opacity plus the four presets (recommended), or include crop and volume in the first version?
5. **Carried over from the QA list:**
   - The company's Apple Developer ID (signing).
   - Intel support.
   - Simple mode.

## 9. Proposed execution phases

| Phase | Content | Size |
|---|---|---|
| 13 | Quick fixes: speed dialog and copies (1.1), light-mode rows and transition tiles plus the theme check (1.3), status line, wrong file types in tools. *Done.* | M |
| 14 | Export speed I: progress (E7), frame-rate default (E5), direct path for plain stretches (E1). *Done.* | L |
| 15 | File tools redesign (section 5). *Done.* | M |
| 16 | Preview zoom (section 4) and editor clarity items 1–6 | M |
| 17 | Keyframes and presets (section 3) | L |
| 18 | Export speed II: offscreen capture (E3), graphics layer (E2), parallel chunks (E4), re-use (E6) | L |
| 19 | Editing power: ripple delete, J/K/L, multi-select, markers | M |
| 20 | Home, Projects, Settings and recorder polish (section 7) | M |

Each phase ends as before: preview checks, real-app benchmarks, one commit, nothing pushed.
