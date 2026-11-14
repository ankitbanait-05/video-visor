'use strict';
// Developer benchmark (Dev builds only). Runs the app's real import, export and recording-save code on
// generated test media and prints timings as JSON lines, then quits.
//   VV_BENCH=1 "dist/Video Visor Dev.app/Contents/MacOS/Video Visor"
// Optional: VV_BENCH_ONLY=export,import,save,env   VV_BENCH_SECONDS=20
const fs = require('node:fs/promises'), path = require('node:path');

async function run(ctx) {
  const { register, runExport, job, run: exec, ffmpeg, root, win } = ctx;
  const only = (process.env.VV_BENCH_ONLY || 'env,import,save,export').split(',');
  const seconds = Number(process.env.VV_BENCH_SECONDS) || 20;
  const dir = path.join(root, 'bench'); await fs.mkdir(dir, { recursive: true });
  const out = (name, data) => process.stdout.write(JSON.stringify({ bench: name, ...data }) + '\n');
  const now = () => Number(process.hrtime.bigint()) / 1e6;
  const timed = async fn => { const t = now(); const r = await fn(); return [r, Math.round(now() - t)]; };
  const make = async (name, args) => { const file = path.join(dir, name); if (!(await fs.stat(file).catch(() => null))) await exec(ffmpeg, ['-v', 'error', '-y', ...args, file]); return file; };
  win?.hide();

  if (only.includes('env')) {
    const env = await win.webContents.executeJavaScript(`({
      mp4avc: ['video/mp4;codecs=avc1','video/mp4;codecs=avc1.640028','video/mp4;codecs=avc1,opus','video/mp4;codecs=avc1,mp4a.40.2','video/mp4;codecs=avc3'].filter(t=>MediaRecorder.isTypeSupported(t)),
      webm: ['video/webm;codecs=vp9,opus','video/webm;codecs=h264,opus','video/webm;codecs=av1,opus'].filter(t=>MediaRecorder.isTypeSupported(t)),
      play: {hevc: document.createElement('video').canPlayType('video/mp4; codecs="hvc1"'), prores: document.createElement('video').canPlayType('video/quicktime; codecs="apcn"'), vp9mp4: document.createElement('video').canPlayType('video/mp4; codecs="vp09.00.10.08"')}
    })`);
    out('env', { electron: process.versions.electron, chrome: process.versions.chrome, ...env });
  }

  // Test media: a typical 1080p H.264 screen recording (long GOP), an iPhone-style HEVC clip,
  // a VP9 WebM like the recorder writes, and an MP3 with cover art.
  const screen = await make(`screen-${seconds}s.mp4`, ['-f', 'lavfi', '-i', `testsrc2=size=1920x1080:rate=30:duration=${seconds}`, '-f', 'lavfi', '-i', `sine=frequency=330:duration=${seconds}`, '-c:v', 'libx264', '-preset', 'veryfast', '-g', '250', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest']);
  const phone = await make('phone-hevc-8s.mov', ['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:v', 'hevc_videotoolbox', '-b:v', '8M', '-tag:v', 'hvc1', '-c:a', 'aac', '-shortest']);
  const webm = await make('recording-20s.webm', ['-f', 'lavfi', '-i', 'testsrc2=size=2940x1912:rate=30:duration=20', '-f', 'lavfi', '-i', 'sine=frequency=500:duration=20', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-b:v', '10M', '-c:a', 'libopus', '-shortest']);
  const cover = await make('song-cover.mp3', ['-f', 'lavfi', '-i', 'sine=frequency=220:duration=6', '-f', 'lavfi', '-i', 'color=c=red:s=300x300:d=1', '-map', '0:a', '-map', '1:v', '-frames:v', '1', '-c:a', 'libmp3lame', '-c:v', 'mjpeg', '-disposition:v', 'attached_pic']);

  // VV_BENCH_SOURCE=path exports from that file instead of the generated screen recording.
  const exportSource = process.env.VV_BENCH_SOURCE || null;
  const assets = {};
  if (only.some(x => ['import', 'export', 'queue', 'webm', 'fade', 'speed'].includes(x))) {
    for (const [key, file] of [['screen', exportSource || screen], ['phone', phone], ['cover', cover]]) {
      try {
        const [a, ms] = await timed(() => register(file));
        assets[key] = a;
        out('import', { file: path.basename(file), ms, kind: a.kind, preparedCopy: !!ctx.registryEntry?.(a.id)?.previewPath });
      } catch (e) { out('import', { file: path.basename(file), failed: String(e.message).split('\n').filter(l => /Error|Could not|Invalid/.test(l)).slice(0, 2).join(' | ') || String(e.message).slice(0, 160) }); }
    }
  }

  if (only.includes('save')) {
    // Same commands as the recorder's save step, before and after 0.15.
    const variants = {
      'reencode (0.14)': ['-c:v', 'libx264', '-preset', 'fast', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart'],
      'repackage (0.15)': ctx.saveArgs ? ctx.saveArgs('video') : ['-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart'],
    };
    for (const [name, args] of Object.entries(variants)) {
      const target = path.join(dir, 'saved-' + name.split(' ')[0] + '.mp4');
      const [, ms] = await timed(() => exec(ffmpeg, ['-v', 'error', '-y', '-i', webm, ...args, target]));
      out('save', { variant: name, ms, recordingSeconds: 20 });
    }
  }

  if (only.includes('queue') && assets.screen) {
    // A queued render (background slot) and a foreground task at the same time: used to fail with "A task is already running".
    const a = assets.screen, state = { clips: [{ id: 'q1', asset: a.id, name: a.name, kind: 'video', start: 0, end: Math.min(8, a.duration), limit: a.duration }], assets: [a], elements: [], transcript: [], zooms: [], overlays: [], audioClips: [], time: 0, selected: 0, ratio: '16/9', speed: 1, audio: { voice: 100, music: 20 } };
    const t0 = now();
    const results = await Promise.allSettled([
      ctx.backgroundJobRun(() => runExport(state, { format: 'MP4', resolution: '1080p', fps: 30 }, async () => path.join(dir, 'queued.mp4'), { background: true })).then(() => Math.round(now() - t0)),
      job(() => exec(ffmpeg, ['-v', 'error', '-y', '-i', screen, '-t', '6', '-c:a', 'libmp3lame', '-vn', path.join(dir, 'foreground.mp3')])).then(() => Math.round(now() - t0)),
    ]);
    out('queue', { queuedRender: results[0].status === 'fulfilled' ? results[0].value + ' ms' : 'FAILED: ' + results[0].reason?.message, foregroundTask: results[1].status === 'fulfilled' ? results[1].value + ' ms' : 'FAILED: ' + results[1].reason?.message });
  }
  if (only.includes('webm') && assets.screen) {
    const a = assets.screen, state = { clips: [{ id: 'w1', asset: a.id, name: a.name, kind: 'video', start: 0, end: Math.min(10, a.duration), limit: a.duration }], assets: [a], elements: [], transcript: [], zooms: [], overlays: [], audioClips: [], time: 0, selected: 0, ratio: '16/9', speed: 1, audio: { voice: 100, music: 20 } };
    const [, ms] = await timed(() => job(() => runExport(state, { format: 'WebM', resolution: '1080p', fps: 30 }, async () => path.join(dir, 'export.webm'))));
    out('webm', { seconds: 10, wallMs: ms, realtime: +(10000 / ms).toFixed(2) });
  }
  if (only.includes('fade') && assets.screen) {
    // A clip with a 2 s fade-in (video and audio) and a crop: the exported picture must be dark at the start.
    const a = assets.screen, state = { clips: [{ id: 'f1', asset: a.id, name: a.name, kind: 'video', start: 0, end: 8, limit: a.duration, fadeIn: 2, audioFadeIn: 2, crop: { l: 10, r: 10, t: 0, b: 0 } }], assets: [a], elements: [], transcript: [], zooms: [], overlays: [], audioClips: [], time: 0, selected: 0, ratio: '16/9', speed: 1, audio: { voice: 100, music: 20 } };
    const target = path.join(dir, 'fade.mp4'); await job(() => runExport(state, { format: 'MP4', resolution: '720p', fps: 30 }, async () => target));
    const luma = async t => { const b = await exec(ffmpeg, ['-v', 'error', '-ss', String(t), '-i', target, '-frames:v', '1', '-vf', 'scale=1:1,format=gray', '-f', 'rawvideo', '-']); return b[0]; };
    const edge = async () => { const b = await exec(ffmpeg, ['-v', 'error', '-ss', '5', '-i', target, '-frames:v', '1', '-vf', 'crop=iw*0.05:ih:0:0,scale=1:1,format=gray', '-f', 'rawvideo', '-']); return b[0]; };
    out('fade', { lumaAt0_1s: await luma(.1), lumaAt1s: await luma(1), lumaAt5s: await luma(5), leftEdgeAt5s_cropped: await edge() });
  }
  if (only.includes('speed') && assets.screen) {
    // Through the app's own IPC path (the renderer's native.speedClip), as the Speed panel calls it.
    for (const preset of [{ kind: 'constant', value: 2 }, { kind: 'constant', value: 0.5 }, { kind: 'curve', name: 'bullet' }]) {
      const t = now();
      try {
        const item = await win.webContents.executeJavaScript(`native.speedClip(${JSON.stringify(assets.screen.id)},2,10,${JSON.stringify(preset)})`);
        const expected = require('./engines/speed-v15.js').outputDuration(preset, 8);
        out('speed', { preset: preset.value || preset.name, ms: Math.round(now() - t), duration: +item.duration.toFixed(2), expected: +expected.toFixed(2), hasAudio: item.hasAudio });
      } catch (e) { out('speed', { preset: preset.value || preset.name, failed: e.message.slice(0, 200) }); }
    }
  }
  if (only.includes('export') && assets.screen) {
    const a = assets.screen;
    const base = { clips: [{ id: 'c1', asset: a.id, name: a.name, kind: 'video', start: 0, end: a.duration, limit: a.duration }], assets: [a], elements: [], transcript: [], zooms: [], overlays: [], audioClips: [], time: 0, selected: 0, ratio: '16/9', speed: 1, audio: { voice: 100, music: 20 }, captions: false };
    const withTitle = { ...base, elements: [{ id: 'e1', kind: 'title', text: 'Benchmark title', font: 'DM Sans', size: 20, colour: '#ffffff', x: 50, y: 50, width: 40, start: 1, end: 6, animation: 'fade' }] };
    const variants = (process.env.VV_BENCH_EXPORT || 'raf1').split(',').map(wait => [`1080p MP4 + title, wait=${wait}`, withTitle, { format: 'MP4', resolution: '1080p', fps: 30, tuning: { wait, ...(process.env.VV_BENCH_TUNING ? JSON.parse(process.env.VV_BENCH_TUNING) : {}) } }]);
    for (const [name, state, cfg] of variants) {
      let n = 0;
      const target = path.join(dir, `export-${n++}-${Date.now()}.mp4`);
      const [r, ms] = await timed(() => job(() => runExport(state, cfg, async () => target)));
      const t = r?.timing || {}, f = t.frames || 1;
      // Frame accuracy: compare the export with its source outside the title (PSNR; a stale frame lowers it sharply).
      let psnr = null;
      try { const log = await new Promise(res => { const p = require('node:child_process').spawn(ffmpeg, ['-i', target, '-i', screen, '-lavfi', '[0:v]trim=start=7,setpts=PTS-STARTPTS[a];[1:v]trim=start=7,setpts=PTS-STARTPTS[b];[a][b]psnr', '-f', 'null', '-'].map(x => x === screen ? (exportSource || screen) : x)); let e = ''; p.stderr.on('data', d => e += d); p.on('close', () => res(e)); }); psnr = +(/average:([\d.inf]+)/.exec(log)?.[1] || 0); } catch {}
      out('export', { name, seconds: Math.round(a.duration), wallMs: ms, realtime: +(a.duration * 1000 / ms).toFixed(2), frames: t.frames, psnrVsSource: psnr, perFrameMs: { seek: +(t.seek / f).toFixed(1), paintWait: +(t.wait / f).toFixed(1), drawTotal: +(t.draw / f).toFixed(1), capture: +(t.capture / f).toFixed(1), convert: +(t.convert / f).toFixed(1), pipe: +(t.pipe / f).toFixed(1) } });
    }
  }
}
module.exports = { run };
