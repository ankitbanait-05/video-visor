'use strict';
// 0.15: reads media details with the bundled ffmpeg, which is a native Apple Silicon binary.
// The bundled ffprobe is an Intel binary: it needs Rosetta (not installed by default, so imports
// failed without it) and took ~7 s on its first run after every install or update.
// Returns the subset of ffprobe's JSON that the app uses: format.duration and, per stream,
// codec_type, codec_name, width, height, pix_fmt, avg_frame_rate, side_data_list rotation,
// tags.rotate and disposition.attached_pic.

function parse(text) {
  const out = { format: {}, streams: [] };
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  if (d) out.format.duration = String(+d[1] * 3600 + +d[2] * 60 + +d[3]);
  const lines = text.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const m = /^\s*Stream #\d+:(\d+)(?:\[[^\]]*\])?(?:\([^)]*\))?:\s*(Video|Audio|Subtitle|Data|Attachment):\s*(.*)$/.exec(line);
    if (m) {
      const [, index, type, rest] = m;
      current = { index: +index, codec_type: type.toLowerCase(), codec_name: (/^([\w-]+)/.exec(rest) || [])[1] || '', disposition: { attached_pic: /\(attached pic\)/.test(rest) ? 1 : 0 }, tags: {} };
      if (current.codec_type === 'video') {
        // "h264 (High) (avc1 / 0x..), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 5702 kb/s, 30 fps, 30 tbr"
        const parts = rest.replace(/\([^()]*\([^()]*\)[^()]*\)|\([^()]*\)/g, m2 => m2.replace(/,/g, ';')).split(',').map(s => s.trim());
        current.pix_fmt = (/^([a-z0-9_]+)/.exec(parts[1] || '') || [])[1] || '';
        // 0.15 (AU-11): HDR transfer (iPhone footage is HLG): "yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67)".
        const trc = /(arib-std-b67|smpte2084)/.exec(rest); if (trc) current.color_transfer = trc[1];
        const size = /(\d{2,5})x(\d{2,5})/.exec(rest);
        if (size) { current.width = +size[1]; current.height = +size[2]; }
        const fps = /([\d.]+)\s*fps/.exec(rest) || /([\d.]+)k?\s*tbr/.exec(rest);
        const rate = fps ? Number(fps[1]) : 30;
        current.avg_frame_rate = Math.round(rate * 1000) + '/1000';
      }
      out.streams.push(current);
      continue;
    }
    if (!current) continue;
    const rot = /displaymatrix:\s*rotation of\s*(-?[\d.]+)\s*degrees/.exec(line);
    if (rot) current.side_data_list = [{ rotation: Number(rot[1]) }];
    const tag = /^\s{4,}rotate\s*:\s*(-?\d+)/.exec(line);
    if (tag) current.tags.rotate = tag[1];
  }
  return out;
}

// ffmpeg exits with an error when only an input is given; the details are on stderr either way.
function probe(ffmpeg, file, spawn = require('node:child_process').spawn) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, ['-hide_banner', '-nostdin', '-i', file], { windowsHide: true });
    let err = '';
    const timer = setTimeout(() => { p.kill('SIGTERM'); reject(Error('Reading media timed out. Check that the file is available locally.')); }, 30000);
    p.stderr.on('data', d => { err += d; if (err.length > 200000) err = err.slice(-200000); });
    p.on('error', e => { clearTimeout(timer); reject(e); });
    p.on('close', () => {
      clearTimeout(timer);
      if (/No such file|Invalid data found|could not find codec parameters|moov atom not found/i.test(err) && !/Stream #/.test(err)) return reject(Error(err.split('\n').filter(Boolean).slice(-1)[0] || 'Unreadable media'));
      if (!/Stream #/.test(err)) return reject(Error('No media streams found'));
      resolve(parse(err));
    });
  });
}

// Keyframes per second in the first 12 s of the main video stream (decodes keyframes only, ~0.1 s).
function keyframeRate(ffmpeg, file, spawn = require('node:child_process').spawn) {
  return new Promise(resolve => {
    const p = spawn(ffmpeg, ['-hide_banner', '-nostdin', '-nostats', '-skip_frame', 'nokey', '-i', file, '-t', '12', '-map', '0:v:0', '-fps_mode', 'passthrough', '-f', 'null', '-'], { windowsHide: true });
    let err = '';
    const timer = setTimeout(() => { p.kill('SIGTERM'); resolve(null); }, 20000);
    p.stderr.on('data', d => { err = (err + d).slice(-4000); });
    p.on('error', () => { clearTimeout(timer); resolve(null); });
    p.on('close', () => { clearTimeout(timer); const n = /frame=\s*(\d+)/g; let m, last = null; while ((m = n.exec(err))) last = +m[1]; resolve(last); });
  });
}

// HDR → SDR for edit copies: without it, 10-bit HLG / PQ footage was squeezed into 8-bit BT.709 unconverted and looked
// washed out in the preview and export.
const isHdr = info => (info?.streams || []).some(s => s.codec_type === 'video' && !s.disposition?.attached_pic && /arib-std-b67|smpte2084/.test(s.color_transfer || ''));
// A direct conversion at a 100-nit reference matched the original picture best in tests (29.5 dB PSNR against the SDR
// source of a synthetic HLG clip; 15.7 dB unconverted, 13–18 dB with hable / mobius tone curves, which darkened it).
const toneMap = 'zscale=p=bt709:t=bt709:m=bt709:r=tv:npl=100,format=yuv420p';
module.exports = { parse, probe, keyframeRate, isHdr, toneMap };
