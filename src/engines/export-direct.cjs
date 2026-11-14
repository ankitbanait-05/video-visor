'use strict';
// 0.15 (Phase 14, E1): stretches of the timeline where nothing is drawn over the footage are decoded and scaled by
// FFmpeg and fed straight to the encoder, instead of being drawn in the export window frame by frame (seek, draw,
// capture: about 26 ms a frame at 1080p). Everything else (titles, captions, zooms, transitions, overlays, clip
// position / crop / fades, colour) still goes through the export window, so it looks exactly as in the preview.
// Before a clip is decoded directly, one of its frames is made both ways and compared (exportProject does this);
// a clip whose frames don't match falls back to the export window.
const { spawn } = require('node:child_process');

const MIN_SECONDS = 1;      // shorter plain stretches aren't worth starting a decoder for
const MARGIN_FRAMES = 2;    // kept away from anything drawn on top, so its first / last frame is never cut

const plainClip = c => c.kind === 'video' && !c.gap
  && !['x', 'y', 'rotation'].some(k => c.transform?.[k]) && (c.transform?.scale ?? 100) === 100 && (c.transform?.opacity ?? 100) === 100
  && !['l', 'r', 't', 'b'].some(k => c.crop?.[k]) && (!c.motion || c.motion === 'none') && !c.fadeIn && !c.fadeOut
  && !Object.values(c.adjustments || {}).some(v => +v) // exposure / contrast / saturation / warmth (Adjustments)
  && !Object.values(c.keyframes || {}).some(k => k?.length); // animated position / scale / rotation / opacity

// Frame ranges [n0, n1) that can be decoded directly, each inside one clip.
//  kind 'plain': nothing on top of the footage. kind 'overlay' (with { overlay: true }): only titles, graphics, solid
//  covers or captions on top, which the export window can draw on their own (transparent) for FFmpeg to lay over the
//  decoded footage (Phase 18, E2). Blur and tracking blur read the video, so they need the whole frame drawn.
function plan(state, { fps, frames, speed, captions, overlay = false }) {
  if (state.camera || state.colour || state.hiddenTracks?.video) return [];
  if (Object.values(state.adjustments || {}).some(v => v && v !== 100)) return [];
  const clips = state.clips || [], offsets = []; let o = 0;
  for (const c of clips) { offsets.push(o); o += c.end - c.start; }
  const hard = [], gfx = []; const add = (list, a, b) => { if (b > a) list.push([a, b]); };
  const graphicsOnly = e => overlay && !e.tracking && e.kind !== 'blur' && !state.hiddenTracks?.graphics;
  for (const e of state.elements || []) add(graphicsOnly(e) ? gfx : hard, e.start ?? 0, e.end ?? Infinity);
  for (const z of state.zooms || []) add(hard, z.start, z.end);
  if (state.zoom) add(hard, state.focus?.start ?? 0, state.focus?.end ?? Infinity);
  for (const v of state.overlays || []) add(hard, v.start ?? 0, v.end ?? Infinity);
  clips.forEach((c, i) => {
    if (!plainClip(c)) add(hard, offsets[i], offsets[i] + c.end - c.start);
    if (captions) for (const l of state.transcript || []) {
      if (l.asset && l.asset !== c.asset) continue;
      const a = Math.max(c.start, l.start), b = Math.min(c.end, l.end);
      if (b > a) add(overlay ? gfx : hard, offsets[i] + a - c.start, offsets[i] + b - c.start);
    }
    const t = c.transitionIn;
    if (i > 0 && t && t.type && t.type !== 'cut') add(hard, offsets[i] - (t.duration || .5), offsets[i] + (t.duration || .5));
    if (state.transition === 'fade') { add(hard, offsets[i] - .6, offsets[i] + .6); add(hard, offsets[i] + c.end - c.start - .6, offsets[i] + c.end - c.start); }
    if (state.transition === 'dissolve' && i > 0) add(hard, offsets[i] - .1, offsets[i] + .6);
  });
  const margin = MARGIN_FRAMES / fps * speed, inside = (list, t) => list.some(([a, b]) => t >= a - margin && t < b + margin);
  const out = []; let cur = null;
  for (let n = 0; n < frames; n++) {
    const t = n / fps * speed; let i = clips.length - 1;
    while (i > 0 && t < offsets[i]) i--;
    const within = t >= offsets[i] && t < offsets[i] + clips[i].end - clips[i].start;
    const kind = !within || inside(hard, t) ? null : inside(gfx, t) ? 'overlay' : 'plain';
    if (kind) {
      if (cur && cur.clip === i && cur.kind === kind && cur.n1 === n) cur.n1 = n + 1;
      else { cur = { clip: i, n0: n, n1: n + 1, offset: offsets[i], kind }; out.push(cur); }
    } else cur = null;
  }
  // Short plain stretches between overlays become overlay (no decoder start for a few frames); then drop what is too short.
  for (let k = 1; k < out.length - 1; k++) { const p = out[k]; if (p.kind === 'plain' && p.n1 - p.n0 < MIN_SECONDS * fps && out[k - 1].kind === 'overlay' && out[k - 1].n1 === p.n0 && out[k - 1].clip === p.clip) p.kind = 'overlay'; }
  const merged = []; for (const p of out) { const last = merged.at(-1); if (last && last.kind === p.kind && last.clip === p.clip && last.n1 === p.n0) last.n1 = p.n1; else merged.push({ ...p }); }
  return merged.filter(s => s.n1 - s.n0 >= (s.kind === 'overlay' ? Math.ceil(fps / 2) : MIN_SECONDS * fps));
}

// FFmpeg filter that places the footage on the canvas as the editor does (object-fit contain or cover).
// Placement: the picture is sized and positioned as Chrome lays it out (exact size and offset rounded to whole
// pixels); a one-pixel difference on a screen recording full of small text is clearly visible to the check.
// Scaling: area when shrinking, bicubic when enlarging (closest to Chrome on screen text).
// Timing: output frame k shows the last source frame that started at or before its time, as a video element does
// (round=up with a hair subtracted, so a frame starting exactly on the time counts). Colour: Chrome treats untagged
// HD video as BT.709; `matrix` is 'bt709' or 'auto' (the file's own tag).
function placeFilter({ width, height, fit, pad, speed, fps, skip, matrix = 'bt709', source }) {
  const sw = source?.width || width, sh = source?.height || height;
  const k = fit === 'cover' ? Math.max(width / sw, height / sh) : Math.min(width / sw, height / sh);
  const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k)), flags = k < 1 ? 'area' : 'bicubic';
  const scale = `scale=${w}:${h}:flags=${flags}:in_color_matrix=${matrix},format=bgra`;
  const place = fit === 'cover'
    ? `crop=${width}:${height}:${Math.round((w - width) / 2)}:${Math.round((h - height) / 2)}`
    : `pad=${width}:${height}:${Math.round((width - w) / 2)}:${Math.round((height - h) / 2)}:color=${pad || 'black'}`;
  return `setpts=(PTS-${skip.toFixed(6)}/TB)/${speed}-0.0005/TB,fps=${fps}:start_time=0:round=up,${scale},${place},setsar=1`;
}

// FFmpeg input arguments and filter for frames [n0, n1) of a stretch (raw BGRA out, the same layout the export
// window's capture gives). If the source runs out, its last frame is held, as the editor does.
function decodeArgs({ asset, clip, stretch, fps, speed, width, height, fit, pad, matrix }) {
  const source = clip.start + (stretch.n0 / fps * speed - stretch.offset);
  // Seek a little earlier than needed and drop the lead-in in the filter, so the first frame is exact.
  const lead = Math.min(1, source);
  return {
    input: ['-nostdin', '-ss', String(source - lead), '-i', asset.previewPath || asset.path, '-map', '0:v:0', '-an'],
    filter: placeFilter({ width, height, fit, pad, speed, fps, skip: lead, matrix, source: asset }) + ',tpad=stop_mode=clone:stop=-1',
    count: stretch.n1 - stretch.n0,
  };
}

// Starts a decoder for a stretch and hands out its frames one at a time. next() gives null if nothing came at all.
function feed(opts) {
  const { width, height, ffmpeg } = opts, size = width * height * 4, d = decodeArgs(opts);
  const args = ['-v', 'error', ...d.input, '-vf', d.filter, '-frames:v', String(d.count), '-f', 'rawvideo', 'pipe:1'];
  if (process.env.VV_DIRECT_LOG) require('node:fs').appendFileSync(process.env.VV_DIRECT_LOG, JSON.stringify(args) + '\n');
  const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let chunks = [], have = 0, ended = false, last = null, err = '';
  const waiters = new Set(), wake = () => { for (const w of waiters) w(); waiters.clear(); };
  proc.stdout.on('data', x => { chunks.push(x); have += x.length; if (have > size * 3) proc.stdout.pause(); wake(); });
  proc.stdout.on('end', () => { ended = true; wake(); });
  proc.stderr.on('data', x => { err = (err + x).slice(-2000); });
  proc.on('error', () => { ended = true; wake(); });
  return {
    async next() {
      while (have < size && !ended) await new Promise(r => waiters.add(r));
      if (have < size) return last;
      const all = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, have), frame = all.subarray(0, size);
      chunks = have > size ? [all.subarray(size)] : []; have -= size; last = frame;
      if (have < size * 2) proc.stdout.resume();
      return frame;
    },
    stop() { if (proc.exitCode == null) proc.kill('SIGKILL'); },
    error: () => err,
  };
}

// Peak signal-to-noise ratio of two BGRA frames (alpha ignored), sampled on a grid for speed.
function psnr(a, b, width, height) {
  let sum = 0, n = 0;
  for (let y = 0; y < height; y += 3) for (let x = 0; x < width; x += 3) {
    const i = (y * width + x) * 4;
    for (let k = 0; k < 3; k++) { const d = a[i + k] - b[i + k]; sum += d * d; } n += 3;
  }
  const mse = sum / n; return mse === 0 ? 99 : 10 * Math.log10(255 * 255 / mse);
}

// Colour of the bars around footage that doesn't fill the canvas, read from a frame the export window drew.
function padColour(bitmap, width, height, asset, fit) {
  if (fit === 'cover' || !asset.width || !asset.height) return null;
  const canvas = width / height, media = asset.width / asset.height; if (Math.abs(canvas - media) < .01) return null;
  const i = 0, hex = v => v.toString(16).padStart(2, '0');
  return '0x' + hex(bitmap[i + 2]) + hex(bitmap[i + 1]) + hex(bitmap[i]); // BGRA → RGB
}

module.exports = { plan, feed, decodeArgs, psnr, padColour, placeFilter, plainClip };
