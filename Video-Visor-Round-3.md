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
| 27 | Premiere-style timeline: no group rows, hide / mute per track, order and spacing (A6, A7) | L |
| 28 | Rigorous test and UI pass, including the real-app export checks | M |

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
