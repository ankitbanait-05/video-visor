# Video Visor · Round 3

Your notes from testing Phase 24 (15 Nov), what I found when I reproduced each one, and a proposed order.

---

## A. What I found

| # | Your note | What's actually happening |
|---|---|---|
| A1 | Blur / solid cover: the height doesn't grow properly | They still use the old text-box code. The box's height comes from the label's font size. The panel's "Height" slider changes that font size, and the corner handle only changes the width. |
| A2 | The text "Blur region" / "Hidden detail" shouldn't be in the box | That text is the box's label, drawn inside it (and blurred along with it). It's left over from when these were text items. |
| A3 | The cover jumps to a corner when clicked; can't place it precisely | A drag limits the centre to 10–90 % from the top and to half the width from each side, and every click goes through the move code. A box near an edge snaps inward as soon as you touch it, so it looks like it jumps. |
| A4 | Width / horizontal / vertical are hidden under "Position, timing & entrance"; text settings aren't needed | Blur and cover share the title panel (font, entrance animation, text). |
| A5 | Split cuts V1 / A1 even when A2 or A3 is selected | Split always cuts the main video at the playhead. It ignores the selection, and audio clips, layers, titles and captions can't be split from the button or the S key at all. |
| A6 | Hide / mute per layer instead of per group | Hide and mute exist only for a whole group (all video, all audio, …). The preview and both export paths only know about groups. |
| A7 | Remove the group header rows ("Video 1", "Audio 3", …) | Each group has a header row with collapse, hide and add buttons. Those rows take about a third of the height on a short timeline. |
| A8 | The zoom menu (Fit / 50 % / 100 %) is too wide | It's 150 px wide for a three-character value. |
| A9 | Rename the Media tab to "Main" with another icon | — |

The button crawler clicked every button on every screen and editor panel. Nothing threw an error and nothing did nothing unexpectedly. The engine tests and all 153 QA checks pass.

---

## B. Proposed changes

### Blur and solid cover as real boxes (A1–A4)
- **Size and position are the box itself:** x, y, width and height in percent of the frame. No text, font or entrance animation.
- **Handles:** eight on the preview, one on each corner and each edge. A corner changes width and height together; Shift keeps the shape. An edge changes one side. Dragging the box moves it from where you grabbed it: no jump, no 10–90 % limit, and it can go right up to the frame edge. It snaps to the centre and the edges.
- **Clicking selects only;** the box moves once you actually drag.
- **Panel:** Position X / Y, Width, Height, then Blur strength (blur) or Colour and Opacity (cover), then Timing. Nothing hidden under a fold.
- **The label:** none inside the box. While the box is selected, a small tag ("Blur", "Cover") sits just outside its top-left corner as a reference. It never appears unselected, and never in the export. The timeline block keeps its name.
- **Existing projects:** open with the same box size they show today.
- **Export:** draws the box the same way, checked with an export test.

### Split acts on what's selected (A5)
- **What gets cut:** Split (button, S, right-click) cuts every selected item under the playhead: a main clip (with its linked sound), an audio clip, a video layer, a title, a caption or music.
- **Nothing selected:** nothing is cut, and a message says "Select the clip to split."
- **A selected item the playhead isn't over:** the message says so.

### A Premiere-style timeline (A6, A7)
- **No group header rows.** Each track has one header: its name (V1, V2, A1, A2, A3, Text 1, Effects 1, Captions), an eye (picture tracks) or speaker (sound tracks), and the lock.
- **Hide and mute per track,** in the preview and in the export (picture and sound).
- **Order, top to bottom:** Captions, Text, Effects, V3, V2, V1, then A1, A2, A3. Picture tracks sit above the main video and sound below, as in Premiere.
- **Separation:** a wider gap (about 10 px) where the kind changes, instead of a header row.
- **Adding a track:** "+" at the end of each kind's last track header, and right-click on a track header for Add track above / below and Delete empty track.
- **Removed:** the group-wide eye / speaker in the header rows.

### Small items (A8, A9)
- **Zoom menu:** about 76 px wide, showing "Fit", "100 %" and so on.
- **Media tab:** becomes **Main**, with a "layout-dashboard" icon. The panel inside stays the same.

### Rigorous test and UI pass
- Everything above gets QA checks, plus the export check for layer keyframes and blur / cover boxes, run in the real app.
- A screen-by-screen review in light and dark at 1440 and 1024 px wide, fixing what's off.
- The full suite and the crawler run again.

---

## C. Proposed order

| Phase | Content | Size |
|---|---|---|
| 25 | *Done.* Blur and solid cover as real boxes (A1–A4); zoom menu width and the Main tab (A8, A9) | M |
| 26 | *Done.* Split acts on the selection (A5) | S–M |
| 27 | *Done.* Premiere-style timeline: no group rows, hide / mute per track, order and spacing (A6, A7) | L |
| 28 | *Done.* Rigorous test and UI pass, including the real-app export checks | M |

---

## D. Decisions for you

1. **All tracks always visible?** Today each tab shows its own tracks in full and the others as thin strips at the bottom ("Show all tracks" opens everything). In Premiere every track is always visible. My suggestion: always show every track that has something on it, plus V1 and A1. Drop the per-tab focusing, but still scroll to the right track when you open a tab.
2. **Track order:** captions, text and effects above the video (as in Premiere), or keep today's order with video first?
3. **Split with nothing selected:** do nothing and show a message (as you asked), or split the main video as now? I'll follow your note (do nothing) unless you say otherwise.

---

## Phase 25 status

| Item | Status |
|---|---|
| A1–A4 Blur and solid cover | Done. A box is its position (centre) and its width and height in percent of the frame, with no text. Eight handles resize it (a corner both ways, Shift keeps the shape; an edge one way). Dragging moves it from where it was grabbed, right up to the frame edge, with snapping to the middle and the edges. A click only selects it. While its panel is open, a small Blur / Cover tag sits outside its top-left corner; it is hidden otherwise and never exported. The panel shows Position X / Y, Width and Height first, then Strength (blur, 0.3–5, default 1.5 as before) or Colour and Opacity (cover), then Start and End, and Fill frame / Centre / Remove. Font, text and entrance are gone. New boxes start at 30 × 22 %; existing ones open at the size they had (worked out from their old label size). |
| A8 Zoom menu | Done. 76 px wide (it was 150 px). |
| A9 Main tab | Done. The first editor tab is called Main, with a dashboard icon. The panel inside is unchanged. |
| Not yet | An export check of the boxes in the real app. It runs with the other export checks in Phase 28. The export draws boxes with the same code as the preview. |

## Phase 26 status

| Item | Status |
|---|---|
| A5 Split | Done. Split (button, S, right-click) cuts every selected item under the playhead: a main clip (with its sound), a video layer together with its own sound (they stay linked), an audio clip, a title or icon, a blur or cover, a zoom, or a caption. The second piece plays on from the right point of its source; a fade in stays on the first piece and a fade out on the second. The pieces after the cut stay selected, so pressing S again further on keeps cutting the same item. With nothing selected nothing is cut ("Select the clip to split"). Selected items the playhead isn't over are left as is, and the message says how many. Right-click offers Split at playhead for any item that can be cut, not only main clips. |
| Not split | Music and narration (each is a single item; trim them instead), a camera linked to a screen recording (it follows the recording, so split that), and a tracking blur. The message says which. |

## Phase 27 status

| Item | Status |
|---|---|
| A7 No group rows | Done. The "Video 1", "Audio 3" header rows are gone. Each track has one header: an icon, its name (V1, V2, A1, A2, Text, Effects, Captions), an eye or speaker, and its lock. The header column is 148 px wide (it was 128) so all of that fits. |
| A6 Hide / mute per track | Done. The eye hides a picture track (V1, V2, text, effects, captions) and the speaker mutes a sound track (A1, A2 …). A hidden or muted track's blocks are dimmed on the timeline, and its button turns red. The preview and the export (picture and sound, and the audio preview) leave those tracks out; the project itself keeps everything. A1 holds the main clips' own sound, so muting A1 silences the main video. Older projects that hid or muted a whole group open with each track of that group hidden or muted. |
| Order and spacing | Done. Top to bottom: captions, text, effects, V3, V2, V1, then A1, A2 …. Where the kind of track changes there is a 10 px gap with a thin line, instead of a header row. |
| Always visible | Done (your decision 1, as suggested). Every track with something on it is always shown, plus V1 and A1, and the empty track of the tab you are in (as somewhere to drop). "Show all tracks" is gone. |
| Adding and removing tracks | Done. A "+" (Add track) above the timeline offers Video, Audio, Text and Effects tracks. Right-click on a track header: Hide / Mute, Lock, Add track, and Delete track (only for an empty track that isn't V1 or A1). |
| Changed from the plan | "Add track above / below" became a single "Add track": a new video track always goes above the others and a new audio track below, so the position choice added nothing. |

## Phase 28 status

| Item | Status |
|---|---|
| Real-app export check | Done. `tools/bench.sh round3` runs two exports in the Dev app (with its own data folder) and measures the frames. Results: a video layer's keyframes put it within 1.5 % of where they should at every sample (x 25 → 75 %, width 20 → 40 %, absent before and after); a green cover box is exactly 20 × 20 % at 80 %, 15 %; a blue layer on a hidden track never appears; a blur box changes the picture inside it (25.7 dB against the source) far more than outside (32.1 dB); muting A1 makes the export silent (−91 dB). |
| Found by the export check | The blur and cover boxes had rounded corners in the export (an older style for text boxes). They are square now, in the preview too. |
| Bench | The bench now keeps the hidden app from being put to sleep by macOS (App Nap had frozen its timers and FFmpeg runs for minutes). |
| Screen review | Light and dark at 1440 × 900, light at 1024 × 768: editor with every kind of track, clip panel, layer panel, box panel, Home. Nothing runs off the edge and nothing scrolls sideways. Two fixes: (1) the time ruler scrolled away with the tracks; it now stays at the top. (2) In the clip and layer panels, an animated value's ‹ › arrows pushed its label to the right, so labels didn't line up; the arrows now sit at the right end of the row. Video layer rows are a little more compact (44 px instead of 56), so more tracks fit. |
| Note | The bench's generated test pattern has no colour tags, so its saturated colours decode slightly differently in the export and in FFmpeg's comparison (red 254,0,0 against 255,25,0). Real recordings carry colour tags. This is why the blur check compares inside against outside rather than a fixed score. |

---

## Phase 29: fixes from your hands-on test (15 Nov, two recordings and a screenshot)

| Your note | Status |
|---|---|
| No way to make a new track by drag and drop | Done. While a file is dragged from Main, the timeline shows a "New video track" strip above the top video track and a "New audio track" strip below the last audio track. Dropping there puts the file on a new track at the drop point. |
| Add menu wording (audio said "Add to video") | Done. Video and images: "Add to the main video" (into V1) and "Add on a new track" (a new V2, V3 …). Audio: "Add to the timeline" (on a free audio track) and "Add on a new track" (a new A2, A3 …). "On a new track" always makes a new track. |
| Icons not lined up with text (Add menu) | Done. The icons sat 6 px above their titles (extra spacing in the text block); they are now on the title line (0 px). |
| Dropdown arrows touching the box edge | Done, everywhere: every dropdown draws the app's own arrow 10 px in from the edge, with room for the text (light and dark). |
| Music and narration can't be split | Done. Splitting turns them into audio clips that keep their role: music keeps the Music volume and "Keep music quiet beneath voice"; narration keeps the Voice volume. They can then be trimmed or deleted like any audio clip. The export and the preview treat them as before. |
| Moving things on the preview | Done, for titles, icons, callouts, blur / cover boxes and video layers: they move from where they are grabbed (an icon used to jump so its corner was under the pointer), stay whole inside the frame, and snap to the middle and the frame edges with the guide lines. |
| Checking everything | `tools/preview/align.js` measures every screen, editor panel, menu and dialog (light and dark, 1440 and 1024 wide): icon against text, icon in icon-only buttons, dropdown arrows, cut-off text. After the fixes it reports nothing. Its first version missed the Add menu because menus are fixed-position; that was found and fixed. |
| Also found | Colour pickers came in three sizes and sat off their labels; one size now, centred on the label. The Captions panel's title was below its language settings; it is first now. The Audio panel's title was a slogan; it is "Audio". The Transitions and Captions panels used the browser's ▸ triangles for folding sections; they now use the same chevron as the clip panel. An empty track's placeholder row had a plain label; it has the same icon and short name as other track headers. |

## Phase 30: a simpler Export window

| Before | Now |
|---|---|
| "Where is your video going?" with four cards (Presentation, Email or chat, High quality, Custom), a size line, a sentence about the save dialog, More settings, a note about 4K, and a large second button for other shapes | **Export**: three quality choices named by their result (720p "Smaller file", 1080p "Recommended", 4K "Sharpest, largest file"); one line saying what you will get and how big it is (for example "MP4 · 1920 × 1080 · 29.0 s … ~46 MB"); More settings folded (Format, Frame rate, Captions, and GIF width or Audio format only when that format is chosen); one Export button whose label follows the format (Export video / Export GIF / Export audio); "Next, choose where to save it" under it; other shapes as a quiet link. The note about 4K moved into the 4K choice's tooltip. Warnings (long GIF, very wide canvas at 4K) still appear under the summary. |

## Phase 31: final clean-up for 0.15.0

Five reviews read every source file; each finding was checked against the code before anything changed.

| Area | Change |
|---|---|
| Speed | The editor no longer copies the whole project every frame to look up the cursor (only when focus follows the cursor, and without a copy). Scrubbing no longer redraws every icon on each move. A repair meant for project open no longer runs every frame. The hide / mute check does nothing while no track is hidden. A page-wide watcher runs once per batch of changes instead of on every change. |
| Fixes | Jobs-list "open" only opens media and documents. Developer export settings are ignored outside the Dev benchmark. Re-importing the same file (and the music library on every launch) reuses its entry. A failed write while recording is reported instead of silently losing the rest. An unreadable video layer fails an export at once instead of after 15 s. Undo after slider drags follows the same rules as other edits. |
| Removed | Prototype leftovers (a simulated recorder, a "preview a suggestion" demo, a design-tweak hook), old handlers always replaced at load, unused helpers and one unused IPC handler, 165 style rules (16.5 KB) for screens that no longer exist. |
| Not changed | Deeper restructuring (old layered editor panels, caption caching) — too much code to touch right before a release. |
| Release | Version 0.15.0. `dist/Video Visor-0.15.0-arm64.dmg`, ad-hoc signed (no Developer ID yet), Apple silicon only. 177 checks, the real-app export check, the alignment audit and the crawler all pass on this code. |
