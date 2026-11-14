// Tests for the export's plain-stretch planner (src/engines/export-direct.cjs). Run with the Dev app's Node:
//   ELECTRON_RUN_AS_NODE=1 "dist/Video Visor Dev.app/Contents/MacOS/Video Visor" tools/export_plan_test.cjs
const D = require(require("node:path").join(__dirname, "../src/engines/export-direct.cjs"));
const clip = (id, start, end, extra = {}) => ({ id, asset: 'a', kind: 'video', start, end, ...extra });
const base = { clips: [clip('c1', 0, 10)], elements: [], zooms: [], overlays: [], transcript: [] };
const fps = 30, opts = (s, extra = {}) => ({ fps, frames: Math.ceil(s.clips.reduce((n, c) => n + c.end - c.start, 0) / (s.speed || 1) * fps), speed: s.speed || 1, captions: false, ...extra });
const show = p => p.map(x => [x.clip, +(x.n0 / fps).toFixed(2), +(x.n1 / fps).toFixed(2)]);
const cases = {
  'plain clip: all of it': [base, [[0, 0, 10]]],
  'title 2–4 s: before and after it': [{ ...base, elements: [{ start: 2, end: 4 }] }, [[0, 0, 1.93], [0, 4.07, 10]]],
  'captions on, line 3–5 s': [{ ...base, transcript: [{ asset: 'a', start: 3, end: 5 }] }, [[0, 0, 2.93], [0, 5.07, 10]], { captions: true }],
  'captions off: ignored': [{ ...base, transcript: [{ asset: 'a', start: 3, end: 5 }] }, [[0, 0, 10]]],
  'moved clip: none': [{ ...base, clips: [clip('c1', 0, 10, { transform: { x: 10 } })] }, []],
  'scale 100 / opacity 100: still plain': [{ ...base, clips: [clip('c1', 0, 10, { transform: { scale: 100, opacity: 100 } })] }, [[0, 0, 10]]],
  'fade in: none': [{ ...base, clips: [clip('c1', 0, 10, { fadeIn: 1 })] }, []],
  'clip with an adjustment: none': [{ ...base, clips: [clip('c1', 0, 10, { adjustments: { exposure: 5 } })] }, []],
  'adjustments all zero: still plain': [{ ...base, clips: [clip('c1', 0, 10, { adjustments: { exposure: 0, contrast: 0 } })] }, [[0, 0, 10]]],
  'animated clip: none': [{ ...base, clips: [clip('c1', 0, 10, { keyframes: { scale: [{ t: 0, v: 100 }, { t: 5, v: 120 }] } })] }, []],
  'colour on: none': [{ ...base, colour: true }, []],
  'image clip then video': [{ ...base, clips: [clip('i', 0, 3, { kind: 'image' }), clip('v', 0, 5)] }, [[1, 3.07, 8]]],
  'dissolve between two clips': [{ ...base, clips: [clip('a1', 0, 5), clip('a2', 0, 5, { transitionIn: { type: 'dissolve', duration: .5 } })] }, [[0, 0, 4.43], [1, 5.57, 10]]],
  'zoom 6–8 s': [{ ...base, zooms: [{ start: 6, end: 8 }] }, [[0, 0, 5.93], [0, 8.07, 10]]],
  'speed 2×: title at timeline 4–6 s is 2–3 s of output': [{ ...base, speed: 2, elements: [{ start: 4, end: 6 }] }, [[0, 0, 1.93], [0, 3.07, 5]]],
  'short gap under 1 s is skipped': [{ ...base, elements: [{ start: 0, end: 9.5 }] }, []],
};
let bad = 0;
for (const [name, [state, want, extra]] of Object.entries(cases)) {
  const got = show(D.plan(state, opts(state, extra))), ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++; console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : JSON.stringify({ got, want }));
}
process.exit(bad ? 1 : 0);
