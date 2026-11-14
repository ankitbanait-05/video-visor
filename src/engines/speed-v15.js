(function (root) {
'use strict';
// 0.15 clip speed. A speed is rendered into a new copy of the clip's source range (the original is kept), so
// every timeline calculation stays as it is. Constant speeds keep their sound (pitch preserved); speed
// curves drop it, as most editors do. Used by the editor (presets, caption mapping) and main.cjs (ffmpeg).
const CONSTANT = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
// Speed curves: speed multiplier at positions 0…1 through the source range, linear in between.
const CURVES = {
  'ramp-up': { name: 'Ramp up', points: [[0, .5], [1, 2.5]] },
  'ramp-down': { name: 'Ramp down', points: [[0, 2.5], [1, .5]] },
  bullet: { name: 'Bullet', points: [[0, 2.5], [.35, 2.5], [.45, .3], [.55, .3], [.65, 2.5], [1, 2.5]] },
  'flash-in': { name: 'Flash in', points: [[0, 4], [.25, 4], [.35, 1], [1, 1]] },
  'flash-out': { name: 'Flash out', points: [[0, 1], [.65, 1], [.75, 4], [1, 4]] },
};
const SEGMENTS = 40;
function speedAt(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) if (x <= points[i][0]) { const [x0, v0] = points[i - 1], [x1, v1] = points[i]; return v0 + (v1 - v0) * (x - x0) / ((x1 - x0) || 1); }
  return points.at(-1)[1];
}
// Piecewise-constant plan for a source duration D: segment k covers source [x_k, x_k+1) at speed v_k.
function plan(preset, D) {
  if (preset.kind === 'constant') return [{ x0: 0, x1: D, v: preset.value, o0: 0 }];
  const points = CURVES[preset.name]?.points; if (!points) throw Error('Unknown speed curve.');
  const segs = []; let o = 0;
  for (let k = 0; k < SEGMENTS; k++) { const x0 = D * k / SEGMENTS, x1 = D * (k + 1) / SEGMENTS, v = speedAt(points, (k + .5) / SEGMENTS); segs.push({ x0, x1, v, o0: o }); o += (x1 - x0) / v; }
  return segs;
}
const outputDuration = (preset, D) => { const p = plan(preset, D), s = p.at(-1); return s.o0 + (s.x1 - s.x0) / s.v; };
// Source seconds (from the start of the range) → seconds in the sped-up copy.
function mapTime(preset, D, t) { const p = plan(preset, D); t = Math.max(0, Math.min(D, t)); const s = p.find(s => t < s.x1) || p.at(-1); return s.o0 + (Math.min(t, s.x1) - s.x0) / s.v; }
// ffmpeg filters for the copy (video timing, frame rate, sound).
function filters(preset, D, fps) {
  const p = plan(preset, D), num = n => (+n.toFixed(6)).toString();
  let expr = '';
  for (let i = p.length - 1; i >= 0; i--) { const s = p[i], term = num(s.o0) + '+(T-' + num(s.x0) + ')/' + num(s.v); expr = i === p.length - 1 ? term : 'if(lt(T\\,' + num(s.x1) + ')\\,' + term + '\\,' + expr + ')'; }
  const video = 'setpts=(' + expr + ')/TB,fps=' + Math.max(1, Math.round(fps || 30));
  let audio = null;
  if (preset.kind === 'constant') { const parts = []; let v = preset.value; while (v > 2) { parts.push('atempo=2'); v /= 2; } while (v < .5) { parts.push('atempo=0.5'); v /= .5; } parts.push('atempo=' + num(v)); audio = parts.join(','); }
  return { video, audio };
}
const label = preset => preset.kind === 'constant' ? (preset.value === 1 ? 'Normal' : preset.value + '×') : CURVES[preset.name]?.name || 'Speed curve';
// Small graph of speed over the clip, for the preset tiles (SVG path in a 60 × 28 box, fast at the top).
function graph(preset) {
  const pts = preset.kind === 'constant' ? [[0, preset.value], [1, preset.value]] : CURVES[preset.name].points, y = v => 26 - Math.min(1, Math.log2(v / .25) / Math.log2(16)) * 24;
  const xs = Array.from({ length: 31 }, (_, i) => i / 30);
  return 'M' + xs.map(x => (2 + x * 56).toFixed(1) + ' ' + y(speedAt(pts, x)).toFixed(1)).join(' L');
}
const api = { CONSTANT, CURVES, plan, outputDuration, mapTime, filters, label, graph, speedAt };
if (typeof module === 'object') module.exports = api; else root.speedModelV15 = api;
})(globalThis);
