(function (root) {
'use strict';
// 0.15 (Phase 17) keyframes for a clip's position, scale, rotation and opacity.
// clip.keyframes = { x: [{ t, v, ease }], y: [...], scale: [...], rotation: [...], opacity: [...] }
//  - t is in the clip's source time (the same clock as clip.start / clip.end), so trimming a clip or splitting it
//    keeps every keyframe on the same moment of the footage.
//  - ease applies to the stretch from that keyframe to the next: 'smooth' (default), 'linear', 'in' or 'out'.
//  - A property with keyframes ignores clip.transform[prop]; one without uses clip.transform as before.
// The editor and the export both draw a clip with transformAt(), so the preview and the export match.
// Every change returns a new keyframes object (never edits one in place), so split halves never share edits.
const PROPS = ['x', 'y', 'scale', 'rotation', 'opacity'];
const DEFAULTS = { x: 0, y: 0, scale: 100, rotation: 0, opacity: 100 };
const LIMITS = { x: [-100, 100], y: [-100, 100], scale: [10, 400], rotation: [-180, 180], opacity: [0, 100] };
const SAME = 1 / 60; // keyframes closer than this are the same keyframe
const EASES = {
  linear: p => p,
  smooth: p => p * p * (3 - 2 * p),
  in: p => p * p * p,
  out: p => 1 - (1 - p) ** 3,
};
const EASE_NAMES = { smooth: 'Smooth', linear: 'Linear', in: 'Ease in', out: 'Ease out' };

const track = (clip, prop) => (clip?.keyframes?.[prop] || []);
const animated = (clip, prop) => prop ? track(clip, prop).length > 0 : PROPS.some(p => track(clip, p).length > 0);

function valueAt(keys, t) {
  if (!keys.length) return null;
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1]; if (t >= last.t) return last.v;
  let i = 0; while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1], p = (t - a.t) / ((b.t - a.t) || 1);
  return a.v + (b.v - a.v) * (EASES[a.ease] || EASES.smooth)(Math.max(0, Math.min(1, p)));
}
// The clip's transform at source time t (static values where a property isn't animated).
function transformAt(clip, t) {
  const out = {};
  for (const p of PROPS) { const k = valueAt(track(clip, p), t); out[p] = k ?? clip?.transform?.[p] ?? DEFAULTS[p]; }
  return out;
}
const clampT = (clip, t) => Math.max(clip.start, Math.min(clip.end, +t || 0));
const clampV = (prop, v) => Math.max(LIMITS[prop][0], Math.min(LIMITS[prop][1], +v));
const keyAt = (clip, prop, t) => track(clip, prop).find(k => Math.abs(k.t - t) < SAME) || null;
function withTrack(clip, prop, keys) {
  const next = { ...(clip.keyframes || {}) };
  if (keys.length) next[prop] = keys.slice().sort((a, b) => a.t - b.t); else delete next[prop];
  return Object.keys(next).length ? next : undefined;
}
// Adds (or moves the value of) the keyframe of `prop` at time t. Returns the new keyframes object.
function setKey(clip, prop, t, v, ease) {
  t = clampT(clip, t); v = clampV(prop, v);
  const keys = track(clip, prop).filter(k => Math.abs(k.t - t) >= SAME), old = keyAt(clip, prop, t);
  keys.push({ t: +t.toFixed(4), v, ease: ease || old?.ease || 'smooth' });
  return withTrack(clip, prop, keys);
}
function removeKey(clip, prop, t) { return withTrack(clip, prop, track(clip, prop).filter(k => Math.abs(k.t - t) >= SAME)); }
// Turning animation on adds the first keyframe with the current value; turning it off keeps the value at t.
function startAnimating(clip, prop, t) { return setKey(clip, prop, t, transformAt(clip, t)[prop]); }
function stopAnimating(clip, prop, t) { return { keyframes: withTrack(clip, prop, []), value: transformAt(clip, t)[prop] }; }
function setEase(clip, prop, t, ease) { const k = keyAt(clip, prop, t); return k ? setKey(clip, prop, k.t, k.v, ease) : clip.keyframes; }
// All keyframe times of the clip (any property), and the neighbours of t.
function times(clip, prop) {
  const all = (prop ? [prop] : PROPS).flatMap(p => track(clip, p).map(k => k.t)).sort((a, b) => a - b);
  return all.filter((t, i) => !i || t - all[i - 1] >= SAME);
}
const previous = (clip, t, prop) => times(clip, prop).filter(x => x < t - SAME).pop() ?? null;
const next = (clip, t, prop) => times(clip, prop).find(x => x > t + SAME) ?? null;
// Moves every keyframe at time `from` (any property) to time `to`.
function moveKeys(clip, from, to) {
  to = clampT(clip, to); let kf = clip.keyframes;
  for (const p of PROPS) {
    const k = keyAt({ ...clip, keyframes: kf }, p, from); if (!k) continue;
    const keys = track({ keyframes: kf }, p).filter(x => x !== k && Math.abs(x.t - to) >= SAME);
    keys.push({ ...k, t: +to.toFixed(4) }); kf = withTrack({ keyframes: kf }, p, keys);
  }
  return kf;
}
// Source times mapped through fn (used when a clip's speed changes: the copy has its own clock).
function mapTimes(keyframes, fn) {
  if (!keyframes) return keyframes; const out = {};
  for (const [p, keys] of Object.entries(keyframes)) out[p] = keys.map(k => ({ ...k, t: +fn(k.t).toFixed(4) }));
  return out;
}

// Ready-made animations. Times are relative to the clip; `at` is the playhead (source time) for "Zoom in".
const PRESETS = {
  'ken-burns': { name: 'Slow zoom', note: 'A gentle push in across the whole clip' },
  'slide-in': { name: 'Slide in', note: 'Comes in from the left' },
  'pop-in': { name: 'Pop in', note: 'Grows in and fades up' },
  'zoom-in': { name: 'Zoom in here', note: 'Zooms in at the playhead and holds' },
};
function preset(clip, name, at) {
  const s = clip.start, e = clip.end, len = e - s, t0 = s, base = transformAt(clip, s);
  let kf = { ...(clip.keyframes || {}) };
  const put = (p, list) => { kf = withTrack({ keyframes: kf }, p, list.map(([t, v, ease]) => ({ t: +clampT(clip, t).toFixed(4), v: clampV(p, v), ease: ease || 'smooth' }))); kf = kf || {}; };
  if (name === 'ken-burns') { put('scale', [[t0, base.scale, 'linear'], [e, base.scale * 1.15]]); put('x', [[t0, base.x - 2, 'linear'], [e, base.x + 2]]); }
  else if (name === 'slide-in') { const d = Math.min(.6, len / 2); put('x', [[t0, base.x - 100, 'out'], [t0 + d, base.x]]); put('opacity', [[t0, 0, 'out'], [t0 + d * .6, base.opacity]]); }
  else if (name === 'pop-in') { const d = Math.min(.45, len / 2); put('scale', [[t0, base.scale * .8, 'out'], [t0 + d, base.scale]]); put('opacity', [[t0, 0, 'out'], [t0 + d * .7, base.opacity]]); }
  else if (name === 'zoom-in') { const a = clampT(clip, at ?? s), d = Math.min(1, e - a); const b = transformAt(clip, a); put('scale', [[a, b.scale], [a + d, b.scale * 1.6]]); }
  else throw Error('Unknown animation.');
  return Object.keys(kf).length ? kf : undefined;
}

// 0.15 (Phase 24): copying a clip's animation onto another clip. Times are moved by `delta` (target start − source
// start); keyframes that land past the end of the target are left out, and the result says how many.
function shift(keyframes, delta, start, end) {
  if (!keyframes) return { keyframes: undefined, dropped: 0 };
  const out = {}; let dropped = 0;
  for (const [p, keys] of Object.entries(keyframes)) {
    const moved = keys.map(k => ({ ...k, t: +(k.t + delta).toFixed(4) })).filter(k => k.t >= start - SAME && k.t <= end + SAME);
    dropped += keys.length - moved.length;
    if (moved.length) out[p] = moved.map(k => ({ ...k, t: +Math.max(start, Math.min(end, k.t)).toFixed(4) }));
  }
  return { keyframes: Object.keys(out).length ? out : undefined, dropped };
}

// 0.15 (Phase 24): video layers (camera bubble, picture-in-picture) use the same keyframes for position, size and
// opacity. A layer's x / y are the centre in percent of the frame (default 65), scale is its width in percent (35).
// Its keyframes are in the layer's own source time (sourceIn + time since the layer starts), so cutting the screen
// recording under a linked camera keeps each keyframe on the same moment of the camera video.
// `look` is where the values live: the layer itself, or the camera link a linked piece belongs to.
const LAYER_PROPS = ['x', 'y', 'scale', 'opacity'];
function layerClip(layer, look = layer) {
  const s = +layer.sourceIn || 0;
  return { start: s, end: s + Math.max(0, layer.end - layer.start), keyframes: look.keyframes,
    transform: { x: look.x ?? layer.x ?? 65, y: look.y ?? layer.y ?? 65, scale: look.scale || layer.scale || 35, opacity: look.opacity ?? 100 } };
}
const layerTime = (layer, time) => (+layer.sourceIn || 0) + time - layer.start;
function layerAt(layer, time, look = layer) { const v = transformAt(layerClip(layer, look), layerTime(layer, time)); return { x: v.x, y: v.y, scale: v.scale, opacity: v.opacity }; }

const api = { PROPS, DEFAULTS, LIMITS, EASES, EASE_NAMES, PRESETS, animated, valueAt, transformAt, keyAt, setKey, removeKey, startAnimating, stopAnimating, setEase, times, previous, next, moveKeys, mapTimes, preset, shift, LAYER_PROPS, layerClip, layerTime, layerAt };
if (typeof module === 'object' && module.exports) module.exports = api; else root.keyframesV17 = api;
})(typeof self !== 'undefined' ? self : this);
