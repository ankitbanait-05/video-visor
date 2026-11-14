// Tests for the keyframe engine (src/engines/keyframes-v17.js). Run with the Dev app's Node:
//   ELECTRON_RUN_AS_NODE=1 "dist/Video Visor Dev.app/Contents/MacOS/Video Visor" tools/keyframes_test.cjs
const K = require(require('node:path').join(__dirname, '../src/engines/keyframes-v17.js'));
let bad = 0; const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : JSON.stringify({ got, want })); };
const near = (a, b) => Math.abs(a - b) < 1e-6;
const clip = { start: 10, end: 20, transform: { scale: 120 } };

eq('no keyframes: static transform and defaults', K.transformAt(clip, 12), { x: 0, y: 0, scale: 120, rotation: 0, opacity: 100 });
let c = { ...clip, keyframes: K.startAnimating(clip, 'x', 12) };
eq('starting animation keeps the current value', c.keyframes.x, [{ t: 12, v: 0, ease: 'smooth' }]);
c = { ...c, keyframes: K.setKey(c, 'x', 16, 40) };
eq('before the first key holds its value', K.transformAt(c, 11).x, 0);
eq('after the last key holds its value', K.transformAt(c, 19).x, 40);
eq('smooth: halfway is halfway', K.transformAt(c, 14).x, 20);
eq('smooth: a quarter in is eased (under 10)', K.transformAt(c, 13).x < 10, true);
c = { ...c, keyframes: K.setEase(c, 'x', 12, 'linear') };
eq('linear: a quarter in is 10', near(K.transformAt(c, 13).x, 10), true);
c = { ...c, keyframes: K.setKey(c, 'x', 16.005, 50) };
eq('a key within 1/60 s replaces the one there', c.keyframes.x.map(k => [k.t, k.v]), [[12, 0], [16.005, 50]]);
eq('values are kept in range', K.setKey(c, 'opacity', 12, 180).opacity[0].v, 100);
eq('times are kept inside the clip', K.setKey(c, 'y', 99, 5).y[0].t, 20);
eq('neighbours', [K.previous(c, 14), K.next(c, 14), K.next(c, 17)], [12, 16.005, null]);
const moved = { ...c, keyframes: K.moveKeys(c, 12, 13) };
eq('moving a key', moved.keyframes.x.map(k => k.t), [13, 16.005]);
const removed = K.removeKey(c, 'x', 12);
eq('removing a key', removed.x.map(k => k.t), [16.005]);
eq('removing the last key removes the property', K.removeKey({ ...c, keyframes: removed }, 'x', 16.005), undefined);
const stopped = K.stopAnimating(c, 'x', 14);
eq('stopping keeps the value at the playhead', [stopped.keyframes, Math.round(stopped.value)], [undefined, 25]);
eq('edits never change the original object', c.keyframes.x.length, 2);
eq('speed change maps times', K.mapTimes(c.keyframes, t => (t - 10) / 2).x.map(k => k.t), [1, 3.0025]);
const pop = { ...clip, keyframes: K.preset(clip, 'pop-in') };
eq('Pop in: starts small and clear, ends as set', [K.transformAt(pop, 10).scale, K.transformAt(pop, 10).opacity, K.transformAt(pop, 12).scale, K.transformAt(pop, 12).opacity], [96, 0, 120, 100]);
const kb = { ...clip, keyframes: K.preset(clip, 'ken-burns') };
eq('Slow zoom: across the whole clip', [K.transformAt(kb, 10).scale, near(K.transformAt(kb, 20).scale, 138)], [120, true]);
const zi = { ...clip, keyframes: K.preset(clip, 'zoom-in', 15) };
eq('Zoom in here: from the playhead', [K.transformAt(zi, 14).scale, near(K.transformAt(zi, 16).scale, 192)], [120, true]);
eq('animated()', [K.animated(clip), K.animated(c), K.animated(c, 'y')], [false, true, false]);
process.exit(bad ? 1 : 0);
