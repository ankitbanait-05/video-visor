# Video Visor: round 2 findings and change list

Written after your test on 14 Nov (two screenshots and a 53-second screen recording) and a full re-check of the app. **Nothing here is built yet.** Agree on it first, then work through it phase by phase.

**Size:** **S** is under half a day. **M** is one to two days. **L** is three days or more.

---

## A. What you reported

### A1. Cursor-following zoom: the option is missing (S–M)

**Cause, confirmed in your workspace:**
- Your clip is a 2× speed copy ("Recording-1794654905483.mp4 · 2×").
- The original recording carries 313 cursor positions from the recorder. The 2× copy carries none.
- So the Focus & zoom panel decides the clip has no cursor and shows the note. That note is misleading: this *is* a recording made in Video Visor.
- Every speed copy in your workspace has the same problem.

**Changes:**
1. Carry the cursor track over to speed copies, re-timed to the new speed (the same mapping the captions already use).
2. Look for cursor data on every clip, not only the clip under the playhead. When a clip really has none, say which clip and why ("imported files have no cursor track").
3. On an existing zoom, offer a **Follow cursor** switch, so a manual zoom can become a following one without starting over.
4. Keep the cursor track when a recording is relinked or imported again; today it is attached only to the original import.

### A2. The Brand style button is too big (S)

Make it one compact row: palette icon, **Brand style**, then a chevron. The description moves into the tooltip, cutting its height from about 78 px to about 36 px.

### A3. Seen in your screen recording

1. **Dropping the camera onto the empty V3 track did nothing.** The track highlighted and showed the green "+", but nothing was added. Your saved project confirms nothing landed on "Video 2" (V3).
   - I could not reproduce it in the browser preview: dropping onto an empty top track works there, including with a second layer of the same file.
   - What differs in your project: the camera layer on V2 is the linked camera from **Screen + camera explainer**, and the clip is a speed copy.
   - **Next step:** reproduce it in the real app, which needs the Dev app closed. I have a check ready that runs inside the real app on a copy of your project. Then fix the cause. (M)
2. **"Add" put the camera at the end of the main track** (the video went from 15.8 s to 47.6 s), when you wanted a layer. In Phase 16 I moved "Overlay" into the ⋯ menu, which made layers harder to find. That was a mistake.
   - **Change:** each media card gets two clear actions: **Add to video** (main track, at the playhead) and **Add as layer** (a new layer above, at the playhead). Delete stays in ⋯. (S)
3. **The ⋯ button on media cards is an empty white square in your app.** My Phase 16 code never asks for the icon to be drawn. It only appeared in my preview because something else happened to redraw icons. (S)

---

## B. Full re-check: results

**Method:**
- A new crawler (`tools/preview/crawl.js`) clicked every visible button on every page, editor tab and panel, returning to the same screen before each click. That covered:
  - Home, Projects, the four tool groups, seven tool pages with files loaded, Settings and the recorder page;
  - 136 buttons across 15 editor screens (top bar, playback bar, timeline bar, Media, Text & graphics, Captions, Audio, Effects, Transitions, Clip, Speed, Colour, Brand style, Focus & zoom, Canvas).
- The 126 regression checks were also run, and all pass.

**Result:** no button threw an error, and none did nothing. (Screenshot & annotate and the two Record buttons open native windows, which the preview doesn't have.) So the problems are in flow and polish, not broken buttons.

**Found:**
1. **Home has two buttons that do the same thing:** "Choose files" and "Import footage" both open the picker. Keep one. (S)
2. **Leftover prototype code is still in the app.** None of it seems reachable any more, but it shouldn't ship. Remove (S):
   - the setup wizard: "Use sample footage", "Names only in this prototype; editing uses sample visuals";
   - the old "Make your voice clearer" dialog: "Settings preview only. The sample walkthrough has no audio track to process.";
   - "This prototype keeps four video projects";
   - "Saved prototype snapshot restored";
   - the redaction note "Prototype marks are visual only".
3. **My benchmark runs wrote into your Dev workspace:** about 30 media entries (speed copies, re-imports of your recording) and a `bench/` folder.
   - **Change:** benchmarks use their own data folder from now on.
   - **Clean-up:** remove the entries and files they added. This needs your OK, because it deletes files in your Dev workspace. (S)
4. **The "2 files imported" message sits on top of the preview picture.** Move messages to a small pill at the bottom of the window that hides itself. (S)
5. **Snap looks disabled when it is off.** Off should look like a normal toggle, not greyed out. (S)
6. **Narrow windows (under about 1,000 px):** the "Text & graphics" tab wraps onto two lines, "16:9 · Fit" breaks, and the playback bar is crowded. Use icon-only tabs and grouped controls at narrow widths. (S)
7. **To verify:** once, a "Drag a box around the detail to blur" banner stayed over a new project. It happened after the crawler's rapid clicking; I could not reproduce it by hand. I'll check that any drawing mode is cancelled when the project changes. (S)

---

## C. A premium visual pass

Today the app mixes styles from several versions: about five kinds of button, plain system sliders, and uneven spacing. Each screen looks fine alone, but together it reads as assembled rather than designed. Proposal:

1. **One set of tokens:** spacing on a 4 / 8 px rhythm, radii of 8 / 10 / 14, two elevation levels, and one focus ring, defined once for both themes.
2. **One button system:** primary, secondary, quiet and icon buttons in three sizes (32 / 36 / 40), with clear hover, pressed, disabled and focus states. Every screen moves to it.
3. **Sliders:** custom track, filled part and thumb, with the number field on the same row. The clip panel alone has about 15 sliders, so this changes how the editor feels more than anything else.
4. **Panels:**
   - Section headers with a small icon, collapsible groups and the same spacing everywhere.
   - The Clip panel grouped as **Transform · Crop · Timing · Speed & colour · Animation**, so it doesn't become one long column.
5. **Media panel:**
   - A two-column grid, with the length shown as a badge on the thumbnail.
   - "Add to video" / "Add as layer" appear on hover, and the kind of file shows as an icon.
6. **Timeline:**
   - Clip blocks with rounded ends, a softer inner edge and a clear selected outline.
   - Track headers with type icons, a finer ruler, and a playhead with a grab handle.
7. **Playback bar:** the view controls (eye, frame, safe area, full screen, large preview, keyboard) as one grouped control with tooltips, tabular time digits, and a larger play button.
8. **Messages:** a bottom pill (as in B4) and short confirmations, such as "Speed set to 2×" with an Undo link.
9. **Type:** a fixed scale of 12 / 13 / 15 / 18 / 24, with Graphik 500 for labels and 600 for headings.
10. **Motion:** 120–180 ms transitions on hover, press and panel change, plus loading placeholders for thumbnails.
11. **Dark mode:** depth from 1 px borders and slightly lighter raised surfaces instead of shadows, and no pure black.
12. **Home:** a smaller hero, so recent projects are visible without scrolling.

How: build the tokens and components first, then go screen by screen, with before / after screenshots in both themes for every screen.

---

## D. The four "worth doing next" items: my view

| Item | Verdict | Why |
|---|---|---|
| **Keyframes for video layers** (camera bubble, picture-in-picture) | **Yes, next** (M) | Moving or resizing the camera bubble during a video is a common need, layers use the same position and scale values as clips, and the Phase 17 engine already does the work. |
| Keyframes for titles and graphics | Later (M) | The entrance and exit animations cover most needs. Position keyframes on titles help for callouts that follow something; worth it after layers. |
| Re-using title / caption stretches between exports | **No, not now** | Exports are already 3–5× faster. This would save about 1–2 s on a 40 s video. Its cache key would have to cover everything that affects a frame; one mistake ships a wrong frame. The risk outweighs the gain. |
| **Copy and paste clip settings** | **Yes** (S–M) | ⌥⌘C / ⌥⌘V (and a menu item): copy a clip's position, scale, crop, colour, speed, fades or animation, then paste them onto other clips, with a small dialog to choose which. Useful for keeping several pieces of one recording consistent. Low risk. |
| Volume line on clips | **Simpler version first** (S) | Clip volume, fades and automatic ducking already cover most cases. Start with a level line on each audio block that you drag up or down to set that clip's volume. Volume that changes within a clip (volume keyframes) can come later. |

---

## E. Proposed order

| Phase | Content | Size |
|---|---|---|
| 21 | *Done.* Fixes from your testing: cursor zoom (A1), Brand style button (A2), drop onto V3 (A3.1), Add to video / Add as layer (A3.2), the ⋯ icon (A3.3), the Home duplicate, prototype leftovers, benchmark data folder and clean-up, message position, Snap state, narrow windows, the drawing-mode check | M |
| 22 | *Done.* Visual pass I: tokens, buttons, sliders, panels, type, motion (C1–C4, C8–C10) | L |
| 23 | *Done.* Visual pass II: media grid, timeline, playback bar, Home, dark mode (C5–C7, C11–C12) | L |
| 24 | Copy / paste clip settings, then layer keyframes, then the clip volume line (D) | M |

## F. Decisions (your answers, 14 Nov)

1. **Benchmark data:** delete it from the Dev workspace. `tools/clean_bench.py` lists what goes:
   - 222 media-list entries made by benchmarks, 106 files, and the `bench/` and `render-cache/` folders (5.4 GB);
   - none of the 12 media items your projects use, and none of your own imports;
   - it runs with the Dev app closed.
2. **Media cards:** one **Add** button with an arrow for the choice ("Add to video" or "Add as layer").
3. **Visual direction:** refine the current look.
4. **Phase 24 order (my call):** copy and paste clip settings first, then layer keyframes. It's smaller, lower risk and useful straight away, and its "choose what to copy" dialog later also covers layer settings, so keyframes fit in after it.

## Phase 21 status

| Item | Status |
|---|---|
| A1 Cursor zoom | Done. A speed change now carries the clip's cursor track over, re-timed to the new speed, and clips sped up before this fix get theirs back when the project opens. Your 2× clip offers "Add zoom that follows the cursor" again. When the clip at the playhead has no cursor, the panel names a clip that does; when none has one, it says why. A zoom you've already added has a **Follow the cursor** switch. *Not done: keeping the cursor when a recording is relinked or imported again (the cursor is stored with the original import only).* |
| A2 Brand style | Done. One 36 px row ("Brand style ›"); the description is in the tooltip. |
| A3.1 Drop onto V3 | Tested in the real app on a copy of your project: dropping the camera onto a new or existing V3 adds it there. Your failure could not be reproduced. The one path that ended silently (the dropped file isn't found in the project) now says "That file is no longer in this project". **If it happens again, note what the status line says.** |
| A3.2 Add ▾ | Done. Each media card has **Add** (into the video at the playhead) and an arrow for **Add as a layer** or **Delete from project**. The menu opens against the window, upward when there's no room below. |
| A3.3 Empty ⋯ | Fixed: the icons are drawn as the card is built. |
| B1 Home | One "Choose files" button; "Import footage" did the same thing. |
| B2 Prototype leftovers | Removed 31 action handlers and 7 button-attribute branches that nothing could reach any more, and their helpers: the setup wizard, the sample-footage flows, the old audio dialog, the fake narration and recording flows, the fake PDF editor and the preset button. The Settings code went from 84 KB to 70 KB, and no "prototype" text is left. |
| B3 Benchmarks | Your Dev workspace is cleaned: 222 entries, 106 files and the `bench/` and `render-cache/` folders (5.4 GB) removed. The 32 entries left include all 12 your projects use. Benchmarks now run in their own folder (`tools/bench.sh`, or `VIDEO_VISOR_TEST_HOME`), and `tools/clean_bench.py` can clean again if needed. |
| B4 Messages | A pill at the bottom of the window. |
| B5 Snap | Off is a normal grey toggle; on is amber. |
| B6 Narrow windows | Below 1,180 px the tabs show icons (name in the tooltip), and "16:9 · Fit" no longer breaks. |
| B7 Blur box | A half-drawn "drag a box to blur" is cancelled when another project opens or a new one starts. |
| New tools | `tools/preview/crawl.js` (clicks every button and reports errors or dead buttons), `tools/clean_bench.py`, `tools/bench.sh`, and a developer-only `eval` step in the benchmark for testing inside the real app. |

## Phase 22 status

**Before:** 66 different button styles: heights from 18 to 40 px, corners of 4 / 5 / 7 / 8 / 9 / 12 / 18 px, and about 30 size-and-weight combinations of text.

**Now:** one design layer (`src/design-v22.css`, loaded last), built on shared tokens that both themes follow.

| Item | Status |
|---|---|
| C1 Tokens | Done. Radii 6 / 8 / 12 / 16, heights 28 / 32 / 38 / 42, type 12 / 13 / 14 / 16 / 18 / 26, two depth levels, one focus ring, and motion at 120 / 160 ms. |
| C2 Buttons | Done. Every button now has 8 px corners and 13 px / 500 text, a visible focus ring and a slight press. Three kinds: **primary** (one per screen, e.g. Export, the tool's action), **secondary** (panel surface with a hairline border) and **quiet** (navigation, view controls). Play is the only round control. Primary buttons use the same deeper blue (#1f7ae0) in both themes, so white text stays readable in dark mode. The editor tabs are a quiet row, with the open tab as a soft pill. |
| C3 Sliders | Done. A thin track filled up to the value, and a round handle that grows slightly while dragged. Number boxes use aligned figures. |
| C4 Panels | Done. Panel sections are cards whose header chevron turns. The Clip panel is grouped as **Transform · Crop · Fades · Speed & colour · Animation · Audio**, and each section remembers whether it's open while you work. Keyframe diamonds sit right beside their labels. |
| C8 Messages | Done. The pill at the bottom gets an **Undo** button when the message is about an edit that can be undone (a removed marker, a cut range…). |
| C9 Type | Done. Page titles 26 / 600, section titles 18, panel titles 16, body 13, small text 12. |
| C10 Motion | Done. Short transitions on buttons, cards and fields; menus pop in; thumbnails show a soft loading shimmer until they appear. Reduced-motion settings are respected. |
| Next (Phase 23) | Media grid, timeline, playback bar, Home, and dark-mode depth (C5–C7, C11–C12). |

## Phase 23 status

| Item | Status |
|---|---|
| C5 Media panel | Done. Two cards per row. The thumbnail shows the kind of file (an icon, top left) and the length (a badge, bottom right); the line under the name says only the shape (Landscape, Portrait, Image, Audio). **Add ▾** stays visible on every card (it's the main action, so it doesn't hide until hovered) and now reads as one joined control. |
| C6 Timeline | Done. Clips have rounder ends and a soft inner edge; a selected clip gets a blue outline with a soft glow. Track headers show an icon for what the track holds (main video, layer, audio, text, captions). The ruler has a line at each labelled time and small ticks between them. The playhead is a thin line with a grab handle on the ruler. |
| C7 Playback bar | Done. Play is a 40 px round button; the frame-step buttons are quiet. The view controls (original, save frame, safe area, large preview, shortcuts) sit in one grouped control; sound stays on its own. The current time is in aligned figures. The zoom menu listed "Fit" twice; it now shows **Fit to window** once. In windows under 1,180 px wide the bar no longer runs past the edge (it did before: four buttons were cut off at 1,024 px). |
| C11 Dark mode | Done. An audit of every screen found one black edge: the sticky main-video row had a black line and a heavy shadow. It now uses a hairline and a soft edge, as everywhere else. No pure-black surfaces remain (the one black box found is a caption style preview, which is content). |
| C12 Home | Done. The hero is about 190 px tall instead of 295 (the headline fits on one line), and the three start cards sit in one row of three (there was an empty fourth slot), with the icon beside the text. Recent projects now show without scrolling at 1440 × 900. |
| Also | The app was 2 px wider than the window (its border was added to its width), so the window could scroll sideways a little. Fixed. |

## (Original questions)


1. OK to remove the benchmark files and entries from your Dev workspace (B3)?
2. Media cards: two buttons ("Add to video" / "Add as layer"), or one "Add" button with a small arrow for the choice?
3. Visual direction: refine the current look (same blue, Graphik, light and airy), or a bolder redesign (darker editor chrome, as in Final Cut / DaVinci)? My recommendation is to refine.
4. Phase 24 order: layer keyframes first, or copy / paste settings first?

*Changes made during this review (test tools only, nothing in the app):*
- *`tools/preview/crawl.js`: the button crawler.*
- *`src/bench.cjs`: a developer-only "eval" step for reproducing the V3 drop in the real app.*

*Neither is committed.*
