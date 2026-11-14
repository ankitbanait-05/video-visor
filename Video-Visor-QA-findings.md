# Video Visor 0.14.0 — QA findings and change list

Build tested: `Video Visor-0.14.0-arm64.dmg` · QA: 13–14 Nov 2026 · Status: **ready for execution, waiting on source folder**

This is the single list of everything found in QA and everything requested in review. Work through it in phase order and tick items as they land.

**Legend**

| Column | Meaning |
|---|---|
| Pri | **H** must fix before org-wide release · **M** should fix · **L** nice to fix |
| Evidence | **Repro** reproduced by hand · **Measured** timed on a test file · **Code** found in the code, not reproduced · **Request** asked for in review · **Suspected** needs a check in the real app |
| Was | Earlier ID from the QA rounds, for traceability |
| Status | ☐ open · ◐ partly done, or done but not yet exercised in the preview · ✅ done and checked |

---

## Decisions (14 Nov)

| # | Decision |
|---|---|
| D1 | **Embed Graphik.** smallcase holds the licence. Bundle the full family (18 files, about 3.5 MB) |
| D2 | **Thin strips: yes.** On the timeline, while you are in one tab, other layer groups that contain items stay visible as a thin labelled strip you can click to jump to that tab |
| D3 | **Order: restructure the timeline first (Phase 0)**, then patch the most valuable issues (Phases 1–3), then the rest |
| D4 | **Source project folder: still needed.** The DMG contains only the packaged build, so nothing can be changed without the source |

---

## Execution order

| Phase | Theme | Items |
|---|---|---|
| 0 | Timeline restructure (foundation) | 10 |
| 1 | Timeline behaviour | 27 |
| 2 | Speed and hardware use | 12 |
| 3 | Panels and properties | 12 |
| 4 | Effects and elements | 9 |
| 5 | Captions and text | 8 |
| 6 | Look, theme, navigation | 12 |
| 7 | Audio and export correctness | 12 |
| 8 | Recorder | 6 |
| 9 | Projects, storage, reliability | 8 |
| 10 | File tools | 18 |
| 11 | AI, security, distribution | 7 |
| 12 | Code clean-up | 2 |

---

## Phase 0 — Timeline restructure

**Why first.** The editor is one 170 KB file built from about eight generations of patches, where later layers override earlier ones by returning early or deleting what was drawn. That is how speed, clip mute and clip motion disappeared, why two selection systems and two lock systems coexist, and why fixes made on top do not hold. Phase 0 changes no visible features; it makes Phases 1–3 safe.

| ID | Change | Pri | Evidence | Was | ☐ |
|---|---|---|---|---|---|
| P0-01 | Separate **project data** (clips, items, tracks) from **view state** (open tab, scroll, zoom, collapsed groups, Show all). View state is not saved in the project, not undone by Undo, and not copied into new projects | H | Code | B16 || ✅ |
| P0-02 | One selection model and one lock model, replacing the two of each that coexist today | H | Code | — || ◐ |
| P0-03 | Drawing never changes data: today every redraw re-sorts overlapping items onto new rows and creates "Graphics 2/3…" tracks that are never removed | H | Code, seen | B6, R6 || ✅ |
| P0-04 | Redraw only what changed. Cache thumbnails and waveforms per clip, so they no longer flicker and get re-requested on every redraw. Trimming relays out the whole timeline live | H | Code | B19, B20 || ✅ |
| P0-05 | Stable unique ids for every clip and item. Today a second Magic Edit pass creates duplicate ids, so selecting or deleting one affects both | H | Code | B7 || ✅ |
| P0-06 | Explicit track model (Spec A). V1/Main at the bottom, video tracks stack upward, audio tracks below. Tracks are created on demand and empty ones removed. **Every new project starts with V1 + A1 only** | H | Repro | R5, B15 || ✅ |
| P0-07 | Undo: one step per real change. No empty steps from clicking into a field or touching the canvas (which today also wipes Redo) | M | Code | B17 || ✅ |
| P0-08 | Save after a short pause, not on every keystroke, arrow press and tab switch (today the whole workspace is rewritten each time) | M | Code | B18 || ✅ |
| P0-09 | Linked audio/video model: a clip and its source audio are linked, can be unlinked and re-linked, and acting on one never silently acts on the other | H | Code | B4, B5 || ◐ |
| P0-10 | Remove the old editor layers once replaced (list in Phase 12) | M | Code | — | ☐ |

### Phase 0 status (14 Nov)

All checks in `tools/preview/qa.js` pass in the browser preview (17/17). The Dev build starts and quits with no errors logged.

| ID | Status |
|---|---|
| P0-01 | ✅ The open tab, track view, collapsed groups and selection are no longer saved with a project, undone by Undo, or carried into new projects |
| P0-02 | ◐ One lock model already exists (old locks are migrated). One selection model is moved to Phase 3 with PN-01, where selection drives the panel |
| P0-03 | ✅ Drawing never moves items. Tracks are settled once, after each edit |
| P0-04 | ◐ Thumbnails and waveforms are cached per clip range and no longer re-requested on redraw. Live relayout while trimming moves to Phase 1 (TL-18) |
| P0-05 | ✅ All ids unique (split, duplicate, Magic Edit, titles). Duplicates in old projects are repaired on open |
| P0-06 | ✅ New projects start with V1 + A1 only. Tracks are created on demand, and empty automatic tracks are removed. Video tracks stack above Main. Layers top to bottom: graphics, captions, effects, video, audio |
| P0-07 | ✅ Undo records a step only when the edit really changed. History is 50 steps |
| P0-08 | ✅ Saved 400 ms after the last change. The app saves immediately before quitting |
| P0-09 | ◐ Re-scoped: the source audio is linked by design. Unlink / re-link / delete audio only moves to Phase 3 (PN-04, TL-09) |
| P0-10 | ☐ Removing the old layers comes after Phases 1–3 replace them |

Also done in this pass: TL-04, TL-05, TL-07, TL-08, and the split half of TL-21.

**Phase 0 is done when:**
- A new project shows V1 and A1 only, whatever was open before.
- Undo never changes the open tab or the scroll position.
- Redrawing 100 times leaves every item on its track.
- No duplicate ids appear after two Magic Edit passes.
- Thumbnails don't reload when switching tabs.
- The Phase 1 timeline tests can be written against the new model.

---

## Phase 1 — Timeline behaviour

| ID | Change | Pri | Evidence | Was | ☐ |
|---|---|---|---|---|---|
| TL-01 | **Snapping** everywhere, with a thin snap line and a magnet toggle (shortcut S). Correction: dragging graphics, captions and effects already snaps to edges and the playhead; trimming and main-track clips don't snap, there is no snap line and no toggle | H | Request, Code | — | ✅ |
| TL-02 | **No overlaps.** Dropping onto an occupied spot is refused, or the item goes to the nearest free row of its group. Items are never placed on top of each other | H | Request | B6 | ✅ |
| TL-03 | Move clips between video tracks, including off Main; linked audio follows to an audio track. Today this is blocked with a generic message | H | Repro | — | ✅ |
| TL-04 | A new video track is created **above** Main (today it is placed below) | H | Repro | — || ✅ |
| TL-05 | Layer visibility per tab (Spec B), with thin strips (D2). Pressing + no longer switches to "Show all tracks" | H | Request | — || ✅ |
| TL-06 | Thin strips no longer draw over the Audio and Captions rows | M | Seen | B14 | ✅ |
| TL-07 | Deleting an item keeps the current tab and the timeline scroll. Today deleting a graphic switches to Media and jumps to the main video | H | Repro | — || ✅ |
| TL-08 | Delete / Backspace act only on a selection. Today, with nothing selected, they delete the clip under the playhead, one per press | H | Repro | B1 || ✅ |
| TL-09 | "Source · clip" audio is **linked** to its video by design (as in Premiere), so delete and drag act on both. Add "Delete audio only", Unlink and Re-link in the right-click menu (with PN-04) | M | Code | B4 | ✅ |
| TL-10 | Tracking blur can be trimmed and moved on the timeline, and has start/end fields in its panel. The tracked range is chosen by the user, not forced to the end of the clip | H | Repro | R1, B2 | ✅ |
| TL-11 | Adding a second tracking blur no longer cuts the first one off at the playhead | H | Code | B3 | ◐ |
| TL-12 | Deleting a clip also removes its tracking masks (today they stay hidden and count toward the 100-item limit) | L | Code | — | ◐ |
| TL-13 | Music can be moved and trimmed on the timeline | M | Code | B22 | ✅ |
| TL-14 | Caption drag checks for overlaps (today an overlap creates "Captions 2" and only one caption shows) | M | Code | B23 | ✅ |
| TL-15 | Copy and paste work for every item type. No zero-length items when pasting at the end. The 100-item and 200-clip limits also apply to paste and duplicate | M | Code | B25 | ✅ |
| TL-16 | Track lock blocks every edit (split, transitions, panel edits, Magic Edit), not only drag and delete | M | Code | B26 | ✅ |
| TL-17 | The timeline follows the playhead during playback. Zoom goes from the whole video down to single frames, with "Fit" | M | Code | B21 | ◐ |
| TL-18 | Trim handles at least 8 px wide, visible on hover, with a time tooltip while dragging (today 9 px and easy to miss) | M | Repro | B36 | ✅ |
| TL-19 | Track sizes and headers per Spec A. The group header no longer reads like a second "Audio 1" layer | M | Repro | R5 | ✅ |
| TL-20 | Main track is magnetic: removing or trimming a clip closes the gap | M | Request | — | ✅ |
| TL-21 | Split does not copy the incoming transition onto the second half. A clip moved to first position drops its transition | M | Code | B8 | ✅ |
| TL-22 | One minimum length for trim, split and insert (today 0.1 s, 0.3 s and 0.25 s) | L | Code | B38 | ✅ |
| TL-23 | Adding a title no longer moves the playhead forward by 0.3 s | L | Repro | B32 | ✅ |
| TL-24 | Empty project shows an empty timeline with a drop prompt. No fake 5-second "Add footage" clip, no 00:05 duration, Play disabled | M | Repro | B29 | ✅ |
| TL-25 | Caption and transition panels track their item by id, not list position (today they can edit the wrong caption after Undo) | M | Code | — | ◐ |
| TL-26 | Script cuts keep picture-in-picture overlays and element ids (today overlays are silently deleted) | M | Code | — | ◐ |
| TL-27 | Magic Edit pause removal shifts music and voiceover along with the cuts (today narration drifts) | M | Code | B24 | ✅ |

### Phase 1 status (14 Nov)

31 checks in `tools/preview/qa.js` pass (17 from Phase 0, 14 new). Moving a clip up to V2 and snapping a trim were also done with a real mouse. The Dev build starts and quits with no errors logged.

| ID | What changed |
|---|---|
| TL-01 ✅ | Snapping when dragging or trimming any item and when trimming a main clip's end: to the playhead, clip boundaries and other items' edges, with a yellow snap line. Toggle with the **Snap** button or **N** (S stays Split). Hold Alt to skip |
| TL-02 ✅ | Trimming stops at the neighbouring item on the same track. Dragging onto a taken spot is refused with a clear message |
| TL-03 ✅ | Drag a main clip up onto V2/V3: it becomes a full-frame layer at the same time, leaving a striped gap on V1 (as in Premiere), and its sound becomes a linked audio clip. Drag it back down onto V1: it fills the gap (or is inserted) and its audio joins it again. Moving, trimming or deleting the layer takes its linked audio with it |
| TL-06 ✅ | Thin strips sit below the rows instead of over them |
| TL-10 ✅ | Tracking blur ends can be trimmed on the timeline (within what was tracked); From / Until fields in its panel. It tracks up to 2 minutes from the playhead, which also fixes the 10-minute failure |
| TL-11 ◐ | Only "Correct tracking from playhead" cuts the earlier mask; adding a second blur no longer does. Not yet exercised in the preview |
| TL-12 ◐ | Tracking masks whose footage is no longer on the timeline are removed after each edit. Not yet exercised |
| TL-13 ✅ | Music can be trimmed at both ends, then moved |
| TL-14 ✅ | A caption can't be dragged or trimmed over its neighbour |
| TL-15 ✅ | Paste works for clips, graphics, effects, overlays, audio clips and captions. Never zero-length at the end. Limits enforced. Music, narration and tracking blur are explained instead of silently ignored |
| TL-16 ✅ | No edit can change anything on a locked track; it is refused with a message. Split checks the main track. Canvas dragging respects locks. A locked item's panel is read-only |
| TL-17 ◐ | The timeline follows the playhead while playing. Zoom now reaches single frames, and the +/− keys zoom by ×1.4. Follow can't be exercised in the hidden preview |
| TL-18 ✅ | 8 px trim handles, shown on hover and when selected. A length tooltip while trimming. The clips after a trimmed main clip move live |
| TL-19 ✅ | Track names V1, V2…, A1, A2…, Text, Captions, Effects. Heights: video 56 px, audio 40 px, others 32 px |
| TL-20 ✅ | The main track closes gaps on delete and trim. Moving a clip up deliberately leaves a gap, which can be deleted |
| TL-21 ✅ | Also: the first clip never keeps a transition |
| TL-22 ✅ | Clips: 0.25 s minimum for trim and split. Items: 0.1 s |
| TL-23 ✅ | Adding a title, callout or icon no longer moves the playhead. It starts just before the playhead (by its entrance time), so it is visible there at once |
| TL-24 ✅ | An empty project shows "Add footage to start…" instead of a fake clip, 00:00 duration and a disabled Play button |
| TL-25 ◐ | The caption and transition panels follow their item by id through Undo and edits. Not yet exercised |
| TL-26 ◐ | Script cuts keep item ids, overlays, audio clips and tracking blurs. Not yet exercised |
| TL-27 ✅ | Magic Edit moves music and narration with the cuts (unit-tested) |
| P0-04 ✅ | Live relayout while trimming, completing Phase 0's item |
| PN-09 ◐ | Tracking blur, blur region and solid cover bars are named properly. Panel headings are still open |

Still open in Phase 1: TL-09 (unlink / re-link / delete audio only) moves to Phase 3 with PN-04.

---

## Phase 2 — Speed and hardware use

| ID | Change | Pri | Evidence | Was | ☐ |
|---|---|---|---|---|---|
| SP-01 | **Recording save without re-encoding.** Record H.264 directly, or keep the recorded format and only repackage it. Measured on a 30 s Retina-size clip: today 11.0 s, repackage 0.3 s (Appendix B) | H | Measured | — | ◐ |
| SP-02 | Save the camera at the same time as the screen, not after. Camera footage can no longer be lost if another task takes the engine between the two | H | Code | C1 | ◐ |
| SP-03 | Export timing log (draw, capture, encode per frame), so every speed change can be measured on a real Mac | H | — | — | ✅ |
| SP-04 | Faster export loop: play frames forward instead of seeking to each one, drop the two-refresh wait, and draw the next frame while the previous one encodes (Spec E) | H | Code | — | ✅ |
| SP-05 | Build plain edits (cuts, trims, fades, simple transitions, zoom) directly in the encoder; capture only the overlay layer (titles, captions) where one exists (Spec E) | M | Code | — | ☐ |
| SP-06 | Use Apple's hardware encoder (VideoToolbox, already in the bundled encoder) for final MP4/MOV and AAC | M | Measured | — | ✅ |
| SP-07 | No re-encode of iPhone HEVC or ProRes on import; play and export from the original. Audio files with cover art no longer trigger a video conversion | H | Code | E7 | ✅ |
| SP-08 | The background render queue no longer blocks captions, tools, recording and exports. The queue survives a restart or warns before quitting. Queue progress is no longer overwritten by other tasks | M | Code | E11, E12 | ✅ |
| SP-09 | Faster WebM conversion (43 s for a 24 s 720p clip today) | L | Measured | T12 | ✅ |
| SP-10 | Import preparation shows a percentage and can be cancelled | M | Code | — | ◐ |
| SP-11 | **New:** the bundled `ffprobe` is an Intel binary. It needs Rosetta (not installed by default, so every video import fails without it) and took ~7.5 s on first use after each install or update. Media details now come from the native `ffmpeg` | H | Measured | — | ✅ |
| SP-12 | **New:** importing an MP3 / M4A with cover art failed ("Could not write header"): the cover was treated as video and converted | H | Measured | — | ✅ |

### Phase 2 status (14 Nov)

Measured with the app's own code in the Dev build's benchmark mode (`VV_BENCH=1`, see `src/bench.cjs`), on an M1 Pro:

| Task | 0.14 | Now |
|---|---|---|
| Export 20 s of 1080p with a title | 41 s (0.48× real time) | **13.3 s (1.5×)**; quality unchanged (same PSNR against the source) |
| Save a 20 s Retina screen recording | 7.6 s | **0.2 s** |
| Import a plain 20 s H.264 video | 7.4 s on first use (Rosetta), and impossible without Rosetta | **0.08 s** |
| Import an MP3 with cover art | failed | 24 ms |
| WebM conversion of a 24 s clip | 47.6 s | **9.2 s** (same quality, 6% larger) |
| Queued render while another task runs | "A task is already running" | both run (render 5.9 s, other task 53 ms) |

| ID | What changed |
|---|---|
| SP-01 ◐ | Saving only repackages the recording into MP4 (no re-encode), with a full re-encode as fallback. The recorder now records H.264 + AAC MP4 (hardware) with a keyframe every second when the size is even, VP9 WebM otherwise; area sizes are rounded to even. **Not yet exercised with a real screen recording** (the repackage step is measured) |
| SP-02 ◐ | Screen and camera are saved in one job, so the camera can't be lost in between |
| SP-03 ✅ | Every export writes its timing (ms per frame for seek, paint wait, capture, convert, pipe, and the real-time factor) to diagnostics.log |
| SP-04 ✅ | Root cause: each frame seeks the video, and Chromium decodes from the previous keyframe (often ~8 s back) — 48 ms of the 56 ms per frame. Footage with keyframes more than 2 s apart now gets a background **edit copy** with a keyframe every second (hardware encoder, ~6× real time, once per file); preview and export use it, and an export waits for a copy still being made. One paint wait instead of two, and encoding overlaps drawing |
| SP-05 ☐ | Deferred. Building plain edits directly in the encoder would bypass frame capture, but needs a second rendering path with parity risks; with export already faster than real time it is not the next priority |
| SP-06 ✅ | MP4 / MOV exports use the hardware H.264 encoder (bitrate scaled to size), falling back to x264 if it is unavailable |
| SP-07 ✅ | Formats Chromium can't play (HEVC, ProRes, 10-bit H.264) are converted with the hardware encoder; cover art no longer counts as video |
| SP-08 ✅ | The render queue renders in its own slot, with its own Cancel and its own progress. Quitting during a render asks first |
| SP-09 ✅ | Faster VP9 settings for WebM export and the WebM converter |
| SP-10 ◐ | Preparing footage shows a progress dialog with a percentage and Cancel, which stops the conversion. The dialog is checked in the preview; cancelling a real conversion is not yet exercised |
| SP-11 ✅ | Native probe replaces the Intel-only ffprobe (matches ffprobe's output on H.264, HEVC, WebM, rotated video and cover art) |
| SP-12 ✅ | MP3 / M4A with cover art import correctly |

Notes:
- Edit copies use disk space: about 90 MB per minute of 1080p, plus more for Retina recordings. They are cleaned up with the storage work in PR-04.
- HEVC import on the synthetic test clip went from 2.0 s to 2.9 s; real camera footage is expected to favour the hardware encoder.

---

## Phase 3 — Panels and properties

| ID | Change | Pri | Evidence | Was | ☐ |
|---|---|---|---|---|---|
| PN-01 | **The panel follows the selection.** Click a clip: clip properties. Click empty timeline or press Esc: back to the tab you were in. Today Transform stays open and no tab is highlighted | H | Repro | — | ✅ |
| PN-02 | One **Clip** panel with collapsible Video and Audio sections (Spec D), replacing the Transform-only panel | H | Request | U3 | ✅ |
| PN-03 | **Fade in / fade out** for video and audio: sliders (0–3 s) in the Clip panel, plus drag handles at each clip's top corners on the timeline | H | Request | — | ✅ |
| PN-04 | **Re-attach detached audio** (right-click, when it still lines up) or "Restore original audio". A muted clip can be unmuted | H | Request, Code | B5 | ✅ |
| PN-05 | Compact back header `←  Panel name` in every sub-panel, returning to the tab you came from. Remove the duplicate "Browse elements" button | H | Request | R4, U2 | ✅ |
| PN-06 | Blur region, Solid cover and Tracking blur open under **Effects**; Back, Remove and the tab highlight all return to Effects | H | Repro | R2, B13 | ✅ |
| PN-07 | Every slider has a number box beside it | M | Review | U4 | ✅ |
| PN-08 | Long panels grouped into collapsible sections, e.g. the title editor's ~25 controls into Text / Style / Animation | M | Repro | U7 | ◐ |
| PN-09 | Correct panel headings ("Edit lower third", "Edit chapter"…). No raw internal names such as `tracking-blur` | L | Repro | B33, B34 | ✅ |
| PN-10 | Confirmations ("Captions generated", "Music added") shown near the action, not only in the small footer | M | Repro | U6 | ✅ |
| PN-11 | Per-clip crop | M | Review | U3 | ✅ |
| PN-12 | The editor tab row never wraps to two lines at the default window width | M | Repro | B30 | ✅ |

### Phase 3 status (14 Nov)

42 checks in `tools/preview/qa.js` pass (11 new). A real export with a fade-in and a crop was measured: brightness 27 → 71 → 119 at 0.1 s → 1 s → 5 s, and the cropped edge is dark.

| ID | What changed |
|---|---|
| PN-01 ✅ | The left panel follows the selection. Select a clip or item and its panel opens; press **Esc** or click empty timeline and you are back in the tab you were working in |
| PN-02 ✅ | One **Clip** panel with collapsible **Video** (position, scale, rotation, opacity, fade in / out, crop, reset) and **Audio** (volume up to 150 %, fade in / out, Delete audio only, Detach / Re-attach / Restore) sections. Gaps get their own panel with "Delete gap". Per-clip speed comes with FX-07 |
| PN-03 ✅ | Fades: sliders in the Clip panel, and drag handles at the top corners of clips, their audio, audio clips and video layers, with a visible ramp. Video fades to black; audio fades in the preview and the export |
| PN-04 ✅ | Detach audio remembers its clip; **Re-attach audio** joins it back; **Restore audio** turns a muted clip's sound back on |
| PN-05 ✅ | One compact header in every item panel: ← and its name. The arrow goes back to the tab the item belongs to (or the tab you were in, for clips and layers). The duplicate "Browse elements" button is gone |
| PN-06 ✅ | Blur region, Solid cover and Tracking blur highlight **Effects**; Back and Remove return to Effects |
| PN-07 ✅ | Every slider has a number box on the same row |
| PN-08 ◐ | The Clip panel is grouped into sections. Grouping the title editor's ~25 controls is still open |
| PN-09 ✅ | Headings by kind: Edit title / lower third / chapter / callout / number, Edit icon, Blur region, Solid cover, Tracking blur |
| PN-10 ✅ | Confirmations also appear as a short toast at the top of the window |
| PN-11 ✅ | Per-clip crop (left / right / top / bottom), in preview and export |
| PN-12 ✅ | The editor tabs stay on one row (they scroll sideways in a very narrow window) |
| TL-09 ✅ | Right-click a clip or its audio: **Delete audio only**, **Re-attach audio** or **Restore audio** |

Still open from Phase 0: P0-02, one selection model in the code. The panel now follows the selection, but the two internal selection lists still coexist.

---

## Phase 4 — Effects and elements

| ID | Change | Pri | Evidence | Was | ☐ |
|---|---|---|---|---|---|
| FX-01 | **Solid cover colour**: colour picker, brand swatches and opacity | H | Request | — | ☐ |
| FX-02 | Focus & zoom: "Add zoom" is the only primary button. "Follow recorded cursor" is shown only when the clip has cursor data, or explained when it doesn't | H | Repro | R3 | ☐ |
| FX-03 | When tracking loses its subject, hold the last position and flag it for review, instead of blurring the whole frame for the rest of the clip | H | Repro | B10 | ☐ |
| FX-04 | Transitions no longer blur the entire picture just because a blur or cover exists somewhere in the project (also exported) | H | Code | B9 | ☐ |
| FX-05 | Blur strength is the same in preview and export | L | Code | E5 | ☐ |
| FX-06 | Tracking blur works on clips longer than 10 minutes (it tracks only the chosen range) | M | Code | B28 | ☐ |
| FX-07 | **Speed** under Effects: first per-clip constant speed (0.5×, 1.5×, 2×), then curve presets with graph icons (ramp up, ramp down, bullet, flash in/out). There is no per-clip speed today, and the project-speed control was lost in an earlier rewrite | M | Request | — | ☐ |
| FX-08 | Remove the **Quotes** category: Pull quote and Statement move to Titles, Testimonial card to Lower thirds; Icons move up | M | Request | — | ☐ |
| FX-09 | Remove the hidden legacy global zoom, which older projects can still have but no one can see or edit | L | Code | — | ☐ |

---

## Phase 5 — Captions and text

| ID | Change | Pri | Evidence | Was | ☐ |
|---|---|---|---|---|---|
| CP-01 | Rename "Roman Hindi · Aap kaise hain?" to **Hinglish** | H | Request | — | ☐ |
| CP-02 | **Caption styles**: remove the look-alikes (Highlight, Karaoke, Stacked, Marker and Subtitle render identically today; Minimal ≈ Outline) and add the new set in Spec C | H | Repro, Request | — | ☐ |
| CP-03 | Caption colour control. The same font names in caption and title font lists | M | Repro | B35 | ☐ |
| CP-04 | "Generate captions" keeps manual corrections and transcribes only clips without captions | M | Code | E8 | ☐ |
| CP-05 | Better Hinglish transliteration (today about 80 dictionary words plus a naive fallback, e.g. "meraa") | M | Code | O7 | ☐ |
| CP-06 | Hindi and ₹ fallback font that matches Graphik (Mukta or Noto Sans Devanagari). Check Hindi word-by-word highlighting in the real app | M | Code, Suspected | — | ☐ |
| CP-07 | Button to import SRT/VTT captions (the code exists, no button shows it) | L | Code | — | ☐ |
| CP-08 | Separate SRT export: ask before overwriting; skip lines under removed gaps | L | Code | E10 | ☐ |

---

## Phase 6 — Look, theme, navigation

| ID | Change | Pri | Evidence | Was | ☐ |
|---|---|---|---|---|---|
| UI-01 | **One theme across the app, with Light / Dark / Match system in Settings.** The timeline and preview are dark while the rest is light today. About 850 hard-coded colours to move to shared tokens, including the recorder panel | H | Request | R7, U1 | ☐ |
| UI-02 | **Graphik embedded** (D1): in the title, caption and Style font lists, and the default of the company style preset; with the CP-06 fallback | H | Request | — | ☐ |
| UI-03 | **Canvas shape as tiles** drawn to shape (16:9, 9:16, 1:1, 4:5, Custom). Same tile pattern for Framing (Fit / Fill), caption position (Top / Middle / Bottom) and other short choice lists | M | Request | — | ☐ |
| UI-04 | Home: one "New video" entry instead of four that do the same thing; remove "A guided start" until one exists; headline that says what the app does; no version pill in the header | M | Repro | U5 | ☐ |
| UI-05 | Minimum text size 12–13 px (much of the interface is 10–11 px) | M | Code | U12 | ☐ |
| UI-06 | Export dialog: Format and Resolution only under "Custom"; vertical and square shapes surfaced instead of hidden under "Render several frame shapes…" | M | Repro | U9 | ☐ |
| UI-07 | Magic Edit review: click a pause to hear it | L | Repro | U8 | ☐ |
| UI-08 | PDF and image tools move under "More tools" (or rename the product); only tools that really work are listed (Phase 10) | M | Review | U11 | ☐ |
| UI-09 | Simple mode for beginners: guided trim → captions → music → export, with the full timeline behind "Advanced" | M | Review | — | ☐ |
| UI-10 | Rename dialog: Enter submits, an empty name shows a message, names containing `&` display correctly | L | Repro | B31 | ☐ |
| UI-11 | Respect the macOS "Reduce motion" setting | L | Code | — | ☐ |
| UI-12 | Replace the default Electron menu, which lets users reach Reload and Developer Tools | L | Code | O5 | ☐ |

---

## Phase 7 — Audio and export correctness

| ID | Change | Pri | Evidence | Was | ☐ |
|---|---|---|---|---|---|
| AU-01 | Real ducking: lower music only while someone speaks (today the whole track plays at 45%) | M | Code | E3 | ☐ |
| AU-02 | Music and voiceover play at the same speed in preview and export; fade-outs land correctly when project speed isn't 1× | M | Code | — | ☐ |
| AU-03 | Volume above 100% is audible in the preview, not only in the export | L | Code | E4 | ☐ |
| AU-04 | Noise reduction and level balancing apply per source, so the halves of a split clip match in loudness | M | Code | E6 | ☐ |
| AU-05 | Recording a new voiceover asks before replacing the existing one | M | Code | — | ☐ |
| AU-06 | Export size estimate based on the real settings | L | Code | E9 | ☐ |
| AU-07 | GIF export: frame-rate cap and a length warning | L | Code | — | ☐ |
| AU-08 | 4K export with a wide canvas shows a clear message, not "Output exceeds 4K" | L | Code | — | ☐ |
| AU-09 | Title animations, fades and default lengths respect project speed | L | Code | — | ☐ |
| AU-10 | Check for audio drift when a clip's audio is shorter than its video | M | Suspected | — | ☐ |
| AU-11 | Check iPhone HDR footage doesn't export washed out | M | Suspected | — | ☐ |
| AU-12 | Frame stepping steps output frames, not source frames, at speeds other than 1× | L | Code | — | ☐ |

---

## Phase 8 — Recorder

| ID | Change | Pri | Evidence | Was | ☐ |
|---|---|---|---|---|---|
| RC-01 | Record system audio (expected for demos) | M | Review | U13 | ☐ |
| RC-02 | Check macOS screen-recording permission before starting and explain how to grant it | M | Suspected | C3 | ☐ |
| RC-03 | Window recordings capture cursor data, so "Follow recorded cursor" works for them | L | Code | C2 | ☐ |
| RC-04 | After a crash mid-recording, offer the partial recording on next launch | L | Code | C4 | ☐ |
| RC-05 | "Record voiceover" opens the voiceover recorder even when the screen recorder panel is open | L | Code | C5 | ☐ |
| RC-06 | Handle the recorder panel crashing mid-recording, and the main window being closed while the panel is open | L | Code | — | ☐ |

---

## Phase 9 — Projects, storage, reliability

| ID | Change | Pri | Evidence | Was | ☐ |
|---|---|---|---|---|---|
| PR-01 | **Relink missing media.** Moved or renamed originals today make export fail with a raw error, and the relink code has no button | H | Code | E1 | ☐ |
| PR-02 | **No silent save failure.** Past 20 MB the workspace stops saving with only a footer note and no warning on quit. Store each project separately and warn early | H | Code | E2 | ☐ |
| PR-03 | No duplicate projects: importing asks for a name or adds to the open project. "Import footage" on an emptied project stays in that project | H | Repro | B11, B27 | ☐ |
| PR-04 | Storage clean-up and a "Clear cache" button in Settings (nothing in the workspace is ever deleted). Deleting a project removes its recordings | M | Code | S1, S2 | ☐ |
| PR-05 | Damaged workspace: offer restore from backup or start fresh (today only "Try again"). Media list written safely | M | Code | S3 | ☐ |
| PR-06 | Default canvas shape and caption language apply to projects that start with an image or audio file | L | Code | — | ☐ |
| PR-07 | Deleting the last project doesn't leave later edits attached to nothing | L | Code | — | ☐ |
| PR-08 | Opening a project doesn't mark the one you left as edited | L | Code | — | ☐ |

---

## Phase 10 — File tools

46 real-engine runs: 37 passed, 5 failed correctly with a clear message, 4 need attention (Appendix C).

| ID | Change | Pri | Evidence | Was | ☐ |
|---|---|---|---|---|---|
| FT-01 | Frame capture near the very end of a video produces no file and a raw error | M | Repro | T1 | ☐ |
| FT-02 | Merging a password-protected PDF shows a raw developer error | M | Repro | T2 | ☐ |
| FT-03 | "Fill & create forms": implement it or remove the card (the engine says "not available in this build") | M | Repro | T3 | ☐ |
| FT-04 | OCR: produce a searchable PDF as promised, or rename; the language option is ignored today | M | Repro | T4 | ☐ |
| FT-05 | "Summarize PDF" only returns the first sentences: rename to "Extract opening" or make it real | L | Repro | T5 | ☐ |
| FT-06 | "Sign PDF" only types your name: add a drawn or image signature, or rename | M | Repro | T6 | ☐ |
| FT-07 | "Compare PDFs" is a text diff, not side by side: rename or build it | L | Repro | T7 | ☐ |
| FT-08 | Batch jobs ask for an output folder once, not one save dialog per file | M | Code | T8 | ☐ |
| FT-09 | "Process files" disabled until a file is added | L | Repro | T9 | ☐ |
| FT-10 | Remove dropdowns with a single choice (Background, Compression, OCR output, Compare) | L | Repro | T10 | ☐ |
| FT-11 | One card for the PDF editor instead of three ("Organize pages", "Fill & create forms", "PDF editor") | L | Repro | T11 | ☐ |
| FT-12 | Tool errors in plain language, not raw technical output | M | Code | O1 | ☐ |
| FT-13 | "Choose files" filters by type (today a video can be added to Merge PDFs) | M | Code | O2 | ☐ |
| FT-14 | PDF watermark, signature and added text support Hindi and other non-Latin text | M | Code | O3 | ☐ |
| FT-15 | PDF editor no longer flattens form fields on every save | M | Code | O4 | ☐ |
| FT-16 | Output quality fixes: Images to PDF embeds JPEGs as PNG (huge files); Image compressor turns HEIC into larger PNGs; Video compressor upscales small videos to 1080p; Resize & crop has no crop rectangle | M | Code | — | ☐ |
| FT-17 | "Open" and "Show in Finder" work for multi-file results; tool outputs can be overwritten on a re-run | L | Code | — | ☐ |
| FT-18 | Check background removal on a real photo | L | Suspected | — | ☐ |

---

## Phase 11 — AI, security, distribution

| ID | Change | Pri | Evidence | Was | ☐ |
|---|---|---|---|---|---|
| DS-01 | **Sign and notarise** with a Developer ID, and add auto-update. Today macOS blocks the app on colleagues' Macs, and every fix means re-sending the DMG | H | Checked | B12 | ☐ |
| DS-02 | Decide on Intel Mac support (today Apple Silicon only, macOS 14+) | M | Checked | B12 | ☐ |
| DS-03 | Tighten Info.plist: remove "allow any insecure connection" and unused permission strings | M | Checked | — | ☐ |
| DS-04 | Draft with AI: organisation-provided key, or hide the feature; same for "Connect an AI assistant" | H | Repro | U10 | ☐ |
| DS-05 | Draft with AI: no orphan project after a failed or dismissed draft; closing "Building…" stops the run; a spending cap | M | Code | — | ☐ |
| DS-06 | Smoke-test the AI request settings against the live service | M | Suspected | — | ☐ |
| DS-07 | Remove camera and screen permissions from the main window, which doesn't need them | L | Code | — | ☐ |

---

## Phase 12 — Code clean-up

| ID | Change | Pri | Evidence | Was | ☐ |
|---|---|---|---|---|---|
| CL-01 | Remove dead code: superseded editor layers, about a third of the shell (prototype screens still saying "simulated"), the old settings screen that says "0.9.0", the unlinked `native.css`, and 11 unbuilt PDF tools hidden in the catalogue | M | Code | B37, O6 | ☐ |
| CL-02 | One source for the version number (hard-coded in three places today) | L | Code | — | ☐ |

---

## Specs

### Spec A — Timeline layout

| Aspect | Spec |
|---|---|
| Track order, top to bottom | Graphics · Captions · Effects · V3 · V2 · **V1 / Main** · A1 · A2 · Music |
| New project | V1 and A1 only |
| Track heights | Video 56 px with thumbnails · Audio 40 px with waveform · Graphics, captions, effects 32 px · Taller per track on request |
| Track header | Short name (V1, A1…), lock, hide (video) or mute (audio) |
| Main track | Magnetic: removing or trimming closes the gap |
| Other tracks | Free placement, no overlaps (TL-02), snapping (TL-01) |
| Linked audio/video | Move and trim together; Unlink / Re-link in the right-click menu |
| Playhead | Followed during playback; zoom from whole video to single frames, plus "Fit" |
| Handles | ≥ 8 px, shown on hover, time tooltip while dragging |
| Empty project | Empty tracks with a "Drop footage here" prompt |

### Spec B — Layer visibility per tab

| Situation | Rows shown in full | Thin strips |
|---|---|---|
| New project | V1 + A1 | — |
| Media tab | Video + audio + **every group that has content** | — |
| Captions tab | Video + audio + captions | Other groups with content |
| Effects tab | Video + audio + effects | Other groups with content |
| Text & graphics tab | Video + audio + graphics | Other groups with content |
| Audio tab | Video + audio | Other groups with content |
| Transitions, Adjustments, Style | Video + audio | Other groups with content |
| A group with no items | Hidden, except in its own tab, where one empty row is ready to drop into | — |

Clicking a thin strip opens that group's tab. The chosen view is view state (P0-01), so it is not saved in the project or undone.

### Spec C — Caption styles

| Keep (6) | Add (6) |
|---|---|
| Clean — white text, soft shadow | Pop word — active word scales up in brand colour |
| Soft box — text on a rounded plate | Bold outline — heavy white text, black stroke, Shorts / Reels look |
| One word — single big word | Highlighter — coloured bar sweeps behind the spoken word |
| Karaoke — words fill as spoken | Two-tone — key word in a second colour and weight |
| Editorial — serif italic | Typewriter — letters appear one by one |
| Subtitle — classic bottom line, no box | Neon glow |

Remove Highlight, Stacked, Marker, Minimal, Outline and Bold. Each style ships with a font, colour and position preset, and uses Graphik when the company style is on.

### Spec D — Clip panel

| Section | Controls |
|---|---|
| Video | Position, scale, rotation, opacity · Fade in / out · Crop · Speed (FX-07) |
| Audio | Volume · Fade in / out · Mute · Clean up noise · Detach / Re-attach |
| Behaviour | Opens when a clip is selected; closes on empty click or Esc (PN-01); sections collapsible; number box beside every slider |

### Spec E — Faster export

| Step | Today | Change |
|---|---|---|
| Getting each frame | Seek the video to that exact frame and wait for it to decode | Decode forward continuously |
| Waiting | Two screen refreshes per frame | None; wait only for the frame to be ready |
| Capture → encode | Strictly one after another | Draw frame n+1 while frame n encodes |
| What is captured | Every frame of the whole picture | Plain edits built directly in the encoder; capture only the overlay layer where titles or captions exist |
| Encoder | Software H.264 | Hardware H.264 / HEVC (VideoToolbox) |
| Measurement | None | Per-frame timing log (SP-03) |

---

## Verify in the real app after changes

These were not testable outside the installed app and must be checked on a real Mac:
- Export speed before and after (SP-03).
- Real screen and camera recording, including the permission-denied path.
- Speech transcription quality in English, Hindi and Hinglish.
- Draft with AI with a live key.
- Real exports in every format.
- iPhone HDR footage.
- Background removal on a real photo.

---

## Appendix A — How QA was done

| Method | Covered |
|---|---|
| Hands-on in a browser copy of the app's interface, with a stand-in backend and sample clips | Every editor tab and effect, timeline editing, shortcuts, export dialog, Projects, Settings, all 30 file-tool screens |
| The app's real processing engine, run headlessly on sample files | 46 file-tool runs, the real blur tracker, encoder benchmarks |
| Full code read (two parallel audits) | Editor, timeline, shell, export, recorder, AI, connector |

Not tested: the installed app window, real recording, real exports to a file, real transcription, Draft with AI with a live key.

## Appendix B — Speed measurements (M1 Pro, bundled encoder)

**Recording save**, 30-second 2940×1912 test recording:

| Method | Time |
|---|---|
| Today: software re-encode | 11.0 s |
| Hardware encoder | 11.7 s |
| Repackage without re-encoding | **0.3 s** |

So a 10-minute screen + camera explainer currently spends about 4 minutes saving the screen, then more on the camera.

**Export encoder only**, 30 seconds of 1080p raw frames:

| Encoder | Time |
|---|---|
| Software H.264 | 5.4 s |
| Hardware H.264 | 5.0 s |

The encoder is not the bottleneck; the per-frame seek-and-capture loop is (Spec E). It could not be timed outside the real app.

## Appendix C — File tools that work

Frame capture, trim (MP4 / MOV / WebM), GIF, compress, convert (including 4K), video to audio, audio clean-up, audio trim, image convert / compress / resize, images to PDF, merge, split, organize and rotate, PDF to images, compress PDF, repair, watermark and page numbers, protect, unlock, typed signature, add text.

## Appendix D — Graphik

- 18 OpenType files, Thin to Black, each with italic. They work in the app as they are.
- smallcase's licence covers embedding (D1).
- No Devanagari and no ₹ glyphs, hence the fallback font (CP-06).
