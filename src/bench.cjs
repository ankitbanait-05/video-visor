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

  if (only.includes('recover')) {
    // RC-04: a recording cut off mid-write (a WebM truncated at 70%) is found, saved and sent to the editor.
    const { dialog } = require('electron'), src = await make('cut-source.webm', ['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=10', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '2M', '-g', '30', '-c:a', 'libopus']);
    const data = await fs.readFile(src), raw = path.join(root, 'Recording-' + (Date.now() - 60000) + '.webm'); await fs.writeFile(raw, data.subarray(0, Math.floor(data.length * .7)));
    const asked = []; const original = dialog.showMessageBox; dialog.showMessageBox = async (w, o) => { asked.push(o.message); return { response: 0 }; };
    let sent = null; const send = win.webContents.send.bind(win.webContents); win.webContents.send = (ch, payload) => { if (ch === 'capture-complete') sent = payload; return send(ch, payload); };
    try { await ctx.recorder().recoverInterrupted(); } finally { dialog.showMessageBox = original; win.webContents.send = send; }
    const left = await fs.stat(raw).then(() => true, () => false);
    out('recover', { asked, rawRemoved: !left, kind: sent?.kind, duration: sent?.asset?.duration, name: sent?.asset?.name });
  }
  if (only.includes('storage')) {
    for (let i = 0; i < 100 && !(await win.webContents.executeJavaScript('!!globalThis.visorEditor')); i++) await new Promise(r => setTimeout(r, 100));
    // PR-04 through the real IPC path. Every registered asset counts as used, so only caches and temp files may go.
    const ids = await win.webContents.executeJavaScript('(()=>{const s=window.openai?.widgetState?.privateContent?.app;const set=new Set();for(const p of s?.projects||[])for(const a of p.snapshot?.assets||[])set.add(a.id);for(const a of globalThis.visorEditor?.get().assets||[])set.add(a.id);return [...set];})()');
    const all = Object.keys(JSON.parse(await fs.readFile(path.join(root, 'media.json'), 'utf8')));
    const before = await win.webContents.executeJavaScript(`native.storageInfo(${JSON.stringify(all)})`);
    const keep = all.filter(id => ctx.registryEntry(id)?.previewPath).map(id => ctx.registryEntry(id).previewPath);
    const res = await win.webContents.executeJavaScript(`native.storageClean(${JSON.stringify(all)},{media:false})`);
    const kept = (await Promise.all(keep.map(f => fs.access(f).then(() => 1, () => 0)))).reduce((a, b) => a + b, 0);
    const after = await win.webContents.executeJavaScript(`native.storageInfo(${JSON.stringify(ids)})`);
    out('storage', { projectAssets: ids.length, registered: all.length, before, freed: res.freed, previewsKept: kept + '/' + keep.length, afterForProjects: after });
  }
  if (only.includes('tools')) {
    // Phase 10 file tools through processTool, as the Tools screens call it (save dialogs answered automatically).
    const T = require('./engines/tools.cjs'), { dialog } = require('electron'), tdir = path.join(dir, 'tools'); await fs.rm(tdir, { recursive: true, force: true }); await fs.mkdir(tdir, { recursive: true });
    for (let i = 0; i < 100 && !(await win.webContents.executeJavaScript('!!window.textImageV15')); i++) await new Promise(r => setTimeout(r, 100));
    const nativeBin = path.join(process.resourcesPath, 'native-bin/visor-utilities');
    const tool = async (id, assets, opts = {}, name) => { try { return await T.processTool({ id, assets: assets.map(a => ({ ...ctx.registryEntry(a.id), id: a.id })), opts, run: exec, ffmpeg, root, saveDialog: async n => path.join(tdir, name || n), progress: () => {}, dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [tdir] }) }, win, cancelled: () => false, nativeBin, log: () => {} }); } catch (e) { return { error: e.message }; } };
    const small = await register(await make('small-640.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=d=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest']));
    const photo = await make('photo.jpg', ['-f', 'lavfi', '-i', 'testsrc2=size=2400x1600', '-frames:v', '1', '-q:v', '3']), heic = path.join(dir, 'photo.heic');
    await exec('/usr/bin/sips', ['-s', 'format', 'heic', photo, '--out', heic]).catch(() => {});
    const img = await register(photo), h = await register(heic).catch(() => null);
    const r = {};
    r.frameAtEnd = await tool('frame', [small], { 'v-option': 'PNG', 'v-frame-time': 2.99 }, 'end.png'); r.frameAtEndBytes = await fs.stat(path.join(tdir, 'end.png')).then(s => s.size, () => 0);
    r.wrongKind = (await tool('merge', [small])).error;
    const jp = await tool('jpgpdf', [img], { 'v-option': 'A4' }, 'photo.pdf'); r.jpgpdf = jp; r.photoPdfKB = Math.round((await fs.stat(path.join(tdir, 'photo.pdf')).then(s => s.size, () => 0)) / 1024); r.photoJpgKB = Math.round((await fs.stat(photo)).size / 1024);
    if (jp?.error) { out('tools', { early: true, ...r }); return; }
    const pdf = await register(path.join(tdir, 'photo.pdf'));
    await tool('protect', [pdf], { 'v-password': 'secret1' }, 'locked.pdf'); const locked = await register(path.join(tdir, 'locked.pdf')).catch(() => null);
    r.lockedMerge = locked ? (await tool('merge', [pdf, locked])).error : 'protect failed';
    const hindi = await win.webContents.executeJavaScript("window.textImageV15('ड्राफ़्ट · गोपनीय ₹500',{size:40,colour:'#3f66a6'})");
    r.hindiWatermark = await tool('watermark', [pdf], { input0: 'ड्राफ़्ट', 'v-text-image': hindi, 'v-option': 'Centre' }, 'hindi.pdf');
    const sig = await win.webContents.executeJavaScript("(async()=>{await document.fonts.load('96px Caveat');const c=document.createElement('canvas');c.width=420;c.height=120;const x=c.getContext('2d');x.font='80px Caveat';x.fillStyle='#14213d';x.textBaseline='middle';x.fillText('Ankit B.',10,64);return c.toDataURL('image/png');})()");
    r.signed = await tool('sign', [pdf], { 'v-sign-image': sig, 'v-option': 'Last page · bottom right' }, 'signed.pdf');
    for (const n of ['hindi', 'signed']) { const reg = await register(path.join(tdir, n + '.pdf')); await tool('pdfjpg', [reg], { 'v-option': 'PNG' }, n + '-page.png'); }
    r.noUpscale = await tool('vcompress', [small], { 'v-resolution': '1080p', 'v-quality': 75 }, 'small-c.mp4'); { let t = ''; await exec(ffmpeg, ['-hide_banner', '-i', path.join(tdir, 'small-c.mp4')], null, null, d => { t += d; }).catch(() => {}); r.compressedSize = (/(\d{2,5})x(\d{2,5})/.exec(t) || [])[0]; }
    if (h) { await tool('icompress', [h], { 'v-option': 'Keep original', 'v-quality': 80 }, 'photo-edited.heic'); const outs = (await fs.readdir(tdir)).filter(f => f.startsWith('photo-edited')); r.heicOut = outs; r.heicKB = Math.round((await fs.stat(heic)).size / 1024); }
    const two = await register(await make('small-b.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=2', '-c:v', 'libx264', '-preset', 'ultrafast']));
    r.batch = await tool('frame', [small, two], { 'v-option': 'PNG', 'v-frame-time': 1 });
    const four = await register(await make('pages.pdf', ['-f', 'lavfi', '-i', 'color=c=white:s=400x300', '-frames:v', '1']).catch(() => null)).catch(() => null);
    r.splitAgain = [(await tool('split', [pdf], { 'v-option': 'Every page separately' }, 'part.pdf')), (await tool('split', [pdf], { 'v-option': 'Every page separately' }, 'part.pdf'))].map(x => x?.error || x?.paths?.map(p => path.basename(p)));
    out('tools', { dir: tdir, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v?.paths ? v.paths.map(p => path.basename(p)) : v])) });
  }
  if (only.includes('theme')) {
    // Settings → Appearance through the real IPC path; the menu must not offer Reload outside Dev builds.
    const { nativeTheme, Menu } = require('electron'), res = {};
    for (const mode of ['dark', 'light', 'system']) { await win.webContents.executeJavaScript(`native.setTheme(${JSON.stringify(mode)})`); res[mode] = { source: nativeTheme.themeSource, dark: nativeTheme.shouldUseDarkColors, page: await win.webContents.executeJavaScript("matchMedia('(prefers-color-scheme: dark)').matches") }; }
    const labels = Menu.getApplicationMenu().items.map(i => i.label + ':' + i.submenu.items.map(x => x.label || x.role).filter(Boolean).join('/'));
    out('theme', { ...res, graphik: await win.webContents.executeJavaScript("document.fonts.load('600 16px Graphik').then(f=>f.length)"), menu: labels });
  }
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
  if (only.some(x => ['import', 'export', 'queue', 'webm', 'fade', 'speed', 'captions', 'keyframes'].includes(x))) {
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
  if (only.includes('captions') && assets.screen) {
    // Each caption style through the real export window; one frame per style is saved as PNG for inspection.
    const a = assets.screen, words = (process.env.VV_BENCH_TEXT || 'Make it really clear today').split(' ').map((text, i) => ({ text, start: .5 + i * .5, end: 1 + i * .5 }));
    for (const style of (process.env.VV_BENCH_STYLES || 'boxed,karaoke,outline,highlighter,typewriter,neon').split(',')) {
      const state = { clips: [{ id: 'c1', asset: a.id, name: a.name, kind: 'video', start: 0, end: 3, limit: a.duration }], assets: [a], elements: [], zooms: [], overlays: [], audioClips: [], time: 0, selected: 0, ratio: '16/9', speed: 1, audio: { voice: 100, music: 20 },
        captions: true, captionStyle: style, captionFont: process.env.VV_BENCH_FONT || 'DM Sans', captionSize: 18, captionPosition: 'bottom', captionColour: '#ffd400', captionGroup: 3, transcript: [{ id: 'l1', asset: a.id, start: .5, end: 3, text: words.map(w => w.text).join(' '), words }] };
      const target = path.join(dir, 'captions-' + style + '.mp4'); await job(() => runExport(state, { format: 'MP4', resolution: '720p', fps: 30, captions: 'Burn into video' }, async () => target));
      await exec(ffmpeg, ['-v', 'error', '-y', '-ss', '1.2', '-i', target, '-frames:v', '1', path.join(dir, 'captions-' + style + '.png')]);
      out('captions', { style, frame: path.join(dir, 'captions-' + style + '.png') });
    }
  }
  if (only.includes('audio')) {
    // Phase 7 checks through the real export. Levels are RMS dB of one frequency band in a time window.
    const band = async (file, freq, from, to) => { let text = ''; await exec(ffmpeg, ['-hide_banner', '-nostats', '-ss', String(from), '-t', String(to - from), '-i', file, '-af', `bandpass=f=${freq}:width_type=q:w=8,astats=metadata=0:measure_overall=RMS_level`, '-f', 'null', '-'], null, null, d => { text += d; }); const m = /RMS level dB:\s*(-?[\d.]+|-inf)/.exec(text.slice(text.lastIndexOf('Overall'))); return m ? (m[1] === '-inf' ? -120 : +m[1]) : null; };
    // A "speaker": 6 s of video whose sound is a 1 kHz tone only from 2 s to 4 s. Music: a constant 220 Hz tone.
    const talk = await make('talk-6s.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=6', '-f', 'lavfi', '-i', "aevalsrc='if(between(t,2,4),0.5*sin(2*PI*1000*t),0)':s=48000:d=6", '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '30', '-c:a', 'aac', '-shortest']);
    const song = await make('song-220.m4a', ['-f', 'lavfi', '-i', 'sine=frequency=220:duration=12', '-c:a', 'aac']);
    // A clip whose sound stops after 2 s of its 4 s, followed by a clip that beeps at 500 Hz from its start.
    const short = await make('short-audio.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '30', '-c:a', 'aac']);
    const beep = await make('beep.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=500:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '30', '-c:a', 'aac', '-shortest']);
    const [t, m, s, b] = [await register(talk), await register(song), await register(short), await register(beep)];
    const base = { elements: [], transcript: [], zooms: [], overlays: [], audioClips: [], time: 0, selected: 0, ratio: '16/9', speed: 1 };
    const duck = { ...base, clips: [{ id: 'd1', asset: t.id, name: 'talk', kind: 'video', start: 0, end: 6, limit: 6 }], assets: [t, m], music: { asset: m.id, name: 'song', start: 0, duck: true }, audio: { voice: 100, music: 60 } };
    const f1 = path.join(dir, 'duck.mp4'); await job(() => runExport(duck, { format: 'MP4', resolution: '720p', fps: 30 }, async () => f1));
    const drift = { ...base, clips: [{ id: 's1', asset: s.id, name: 'short', kind: 'video', start: 0, end: 4, limit: 4 }, { id: 'b1', asset: b.id, name: 'beep', kind: 'video', start: 0, end: 3, limit: 3 }], assets: [s, b], audio: { voice: 100, music: 20 } };
    const f2 = path.join(dir, 'drift.mp4'); await job(() => runExport(drift, { format: 'MP4', resolution: '720p', fps: 30 }, async () => f2));
    out('audio', {
      musicWhileSilent_dB: await band(f1, 220, .5, 1.6), musicWhileSpeaking_dB: await band(f1, 220, 2.6, 3.6), musicAfter_dB: await band(f1, 220, 5, 5.8),
      beepBefore4s_dB: await band(f2, 500, 3.2, 3.9), beepAfter4s_dB: await band(f2, 500, 4.2, 4.9),
    });
    if (process.env.VV_BENCH_HDR) {
      // An HLG clip (iPhone style): the edit copy must be converted to SDR, not squeezed in unconverted.
      const h = await register(process.env.VV_BENCH_HDR), copy = ctx.registryEntry?.(h.id)?.previewPath;
      let text = ''; if (copy) await exec(ffmpeg, ['-v', 'error', '-i', copy, '-vf', 'signalstats,metadata=print:file=-', '-frames:v', '1', '-f', 'null', '-'], d => { text += d; });
      out('hdr', { copy: !!copy, sat: +(/SATAVG=([\d.]+)/.exec(text)?.[1] || 0), yavg: +(/YAVG=([\d.]+)/.exec(text)?.[1] || 0) });
    }
  }
  if (only.includes('speed') && assets.screen) {
    // Through the app's own IPC path (the renderer's native.speedClip), as the Speed panel calls it.
    for (const preset of [{ kind: 'constant', value: 2 }, { kind: 'constant', value: 0.5 }, { kind: 'curve', name: 'bullet' }, { kind: 'constant', value: 2 }]) {  // the last one repeats the first: it should reuse its copy
      const t = now();
      try {
        const item = await win.webContents.executeJavaScript(`native.speedClip(${JSON.stringify(assets.screen.id)},2,10,${JSON.stringify(preset)})`);
        const expected = require('./engines/speed-v15.js').outputDuration(preset, 8);
        out('speed', { preset: preset.value || preset.name, ms: Math.round(now() - t), duration: +item.duration.toFixed(2), expected: +expected.toFixed(2), hasAudio: item.hasAudio });
      } catch (e) { out('speed', { preset: preset.value || preset.name, failed: e.message.slice(0, 200) }); }
    }
  }
  if (only.includes('keyframes') && assets.screen) {
    // Phase 17: a clip scaled 100% → 150% between 7 s and 12 s (smooth). The export must show the source as is at
    // 6 s and the middle two-thirds of it enlarged 1.5× at 12 s (the canvas keeps the centre).
    const a = assets.screen, sp = require('node:child_process').spawn;
    const state = { clips: [{ id: 'k', asset: a.id, name: a.name, kind: 'video', start: 0, end: a.duration, limit: a.duration, keyframes: { scale: [{ t: 7, v: 100, ease: 'smooth' }, { t: 12, v: 150, ease: 'smooth' }] } }], assets: [a], elements: [], transcript: [], zooms: [], overlays: [], audioClips: [], time: 0, selected: 0, ratio: '16/9', speed: 1, audio: { voice: 100, music: 20 }, captions: false };
    const target = path.join(dir, 'keyframes-' + Date.now() + '.mp4');
    const [r, ms] = await timed(() => job(() => runExport(state, { format: 'MP4', resolution: '1080p', fps: 30 }, async () => target)));
    const psnr = (filterA, filterB) => new Promise(res => { const p = sp(ffmpeg, ['-i', target, '-i', screen, '-lavfi', `[0:v]${filterA}[a];[1:v]${filterB}[b];[a][b]psnr`, '-f', 'null', '-']); let e = ''; p.stderr.on('data', d => e += d); p.on('close', () => res(+(/average:([\d.inf]+)/.exec(e)?.[1] || 0))); });
    const at = t => `trim=start=${t}:duration=0.04,setpts=PTS-STARTPTS`;
    const plainAt6 = await psnr(at(6), at(6)), zoomedAt12 = await psnr(at(12.4), at(12.4) + ',crop=1280:720,scale=1920:1080'), unzoomedAt12 = await psnr(at(12.4), at(12.4));
    out('keyframes', { wallMs: ms, direct: r?.timing?.direct?.frames || 0, plainAt6, zoomedAt12, unzoomedAt12 });
  }
  if (only.includes('export') && assets.screen) {
    const a = assets.screen;
    const base = { clips: [{ id: 'c1', asset: a.id, name: a.name, kind: 'video', start: 0, end: a.duration, limit: a.duration }], assets: [a], elements: [], transcript: [], zooms: [], overlays: [], audioClips: [], time: 0, selected: 0, ratio: '16/9', speed: 1, audio: { voice: 100, music: 20 }, captions: false };
    const withTitle = { ...base, elements: [{ id: 'e1', kind: 'title', text: 'Benchmark title', font: 'DM Sans', size: 20, colour: '#ffffff', x: 50, y: 50, width: 40, start: 1, end: 6, animation: 'fade' }] };
    // Phase 14: the same project through the export window only, and with plain stretches decoded directly; and a
    // project at 1.5× speed both ways (its two exports are compared with each other).
    const tuning = process.env.VV_BENCH_TUNING ? JSON.parse(process.env.VV_BENCH_TUNING) : {}, cfgOf = extra => ({ format: 'MP4', resolution: '1080p', fps: 30, tuning: { wait: 'raf1', ...tuning, ...extra } });
    const fast = { ...withTitle, speed: 1.5 };
    const cuts = { ...withTitle, clips: [{ ...base.clips[0], id: 'k1', end: Math.min(8, a.duration / 2) }, { ...base.clips[0], id: 'k2', start: Math.min(12, a.duration * .6) }] };
    const variants = [['1080p MP4 + title · window only', withTitle, cfgOf({ direct: false })], ['1080p MP4 + title · direct', withTitle, cfgOf({})], ['1.5× · window only', fast, cfgOf({ direct: false })], ['1.5× · direct', fast, cfgOf({})], ['two cuts · window only', cuts, cfgOf({ direct: false })], ['two cuts · direct', cuts, cfgOf({})]];
    const made = {};
    for (const [name, state, cfg] of variants) {
      let n = 0;
      const target = path.join(dir, `export-${n++}-${Date.now()}.mp4`);
      const [r, ms] = await timed(() => job(() => runExport(state, cfg, async () => target)));
      const t = r?.timing || {}, f = t.frames || 1;
      // Frame accuracy: compare the export with its source outside the title (PSNR; a stale frame lowers it sharply).
      let psnr = null;
      try { const log = await new Promise(res => { const p = require('node:child_process').spawn(ffmpeg, ['-i', target, '-i', screen, '-lavfi', '[0:v]trim=start=7,setpts=PTS-STARTPTS[a];[1:v]trim=start=7,setpts=PTS-STARTPTS[b];[a][b]psnr', '-f', 'null', '-'].map(x => x === screen ? (exportSource || screen) : x)); let e = ''; p.stderr.on('data', d => e += d); p.on('close', () => res(e)); }); psnr = +(/average:([\d.inf]+)/.exec(log)?.[1] || 0); } catch {}
      made[name] = target;
      // The two 1.5× exports should be the same picture: compare them frame by frame.
      let vsWindow = null; const twin = made[name.replace(' · direct', ' · window only')];
      if (twin && twin !== target) { const log = await new Promise(res => { const p = require('node:child_process').spawn(ffmpeg, ['-i', target, '-i', twin, '-lavfi', 'psnr', '-f', 'null', '-']); let e = ''; p.stderr.on('data', d => e += d); p.on('close', () => res(e)); }); vsWindow = +(/average:([\d.inf]+)/.exec(log)?.[1] || 0); }
      out('export', { name, seconds: Math.round(a.duration), wallMs: ms, realtime: +(a.duration * 1000 / ms).toFixed(2), frames: t.frames, psnrVsSource: /^(1\.5|two)/.test(name) ? undefined : psnr, psnrVsWindowOnly: vsWindow, direct: t.direct, perFrameMs: { seek: +(t.seek / f).toFixed(1), paintWait: +(t.wait / f).toFixed(1), drawTotal: +(t.draw / f).toFixed(1), capture: +(t.capture / f).toFixed(1), convert: +(t.convert / f).toFixed(1), pipe: +(t.pipe / f).toFixed(1), decode: +((t.decode || 0) / f).toFixed(1) } });
    }
  }
}
module.exports = { run };
