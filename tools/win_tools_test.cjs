// Tests the Windows versions of the Mac-helper tools (src/engines/win-helper.cjs) on generated files.
// Run by .github/workflows/windows.yml twice: with Node from the repository, and inside the packaged app
//   node tools/win_tools_test.cjs                                     (VV_WIN_RESOURCES=win-res)
//   ELECTRON_RUN_AS_NODE=1 "dist-win/win-unpacked/Video Visor.exe" tools/win_tools_test.cjs --packaged
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), { spawnSync } = require('node:child_process');
const packaged = process.argv.includes('--packaged');
const app = packaged ? path.join(process.resourcesPath, 'app.asar') : path.join(__dirname, '..');
const req = m => require(require.resolve(m, { paths: [app] }));
const helper = require(path.join(app, 'src/engines/win-helper.cjs'));
const { PDFDocument, StandardFonts } = req('pdf-lib'), sharp = req('sharp');
const ffmpeg = req('ffmpeg-static').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
const ctx = { ffmpeg };
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? '  ' + JSON.stringify(detail) : '')); };
const attempt = async (name, fn) => { try { await fn(); } catch (e) { failed++; console.log('FAIL ' + name + '  threw: ' + (e.stack || e.message)); } };

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'visor-wintools-'));
  console.log((packaged ? 'packaged app' : 'repository') + ' · ' + dir);
  // a two-page PDF with large text
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const line of ['Video Visor test page one', 'Second page of the test']) { const p = doc.addPage([595, 842]); p.drawText(line, { x: 50, y: 700, size: 34, font }); p.drawText('Hello from Windows 2026', { x: 50, y: 600, size: 30, font }); }
  const pdf = path.join(dir, 'test.pdf'); await fs.writeFile(pdf, await doc.save());
  const run = async (args, opts = {}) => JSON.parse(await helper.run(args, opts, ctx));

  await attempt('pdftext', async () => { const { text } = await run(['pdftext', pdf]); check('pdftext reads both pages', /Video Visor test page one/.test(text) && /Second page/.test(text), text.slice(0, 120)); });
  await attempt('pdfjpg', async () => {
    const { paths } = await run(['pdfjpg', pdf, path.join(dir, 'test-pdfjpg.png')], { 'v-resolution': '150 dpi' });
    const m = await sharp(paths[0]).metadata(); check('pdfjpg makes one PNG per page at 150 dpi', paths.length === 2 && Math.abs(m.width - 1240) <= 2, { pages: paths.length, width: m.width });
  });
  await attempt('pdfThumb', async () => { const png = await helper.pdfThumb(pdf); const m = png && await sharp(png).metadata(); check('PDF thumbnail', !!m && m.width === 240, m && { width: m.width }); });
  await attempt('ocr', async () => {
    const dest = path.join(dir, 'test-ocr.txt'); await run(['ocr', pdf, dest]); const text = await fs.readFile(dest, 'utf8');
    check('OCR reads the rendered pages', /Video\s*Visor/i.test(text) && /Second/i.test(text), text.slice(0, 160));
  });
  await attempt('protect / unlock', async () => {
    const locked = path.join(dir, 'locked.pdf'), open = path.join(dir, 'open.pdf');
    await run(['protect', pdf, locked], { 'v-password': 'secret 1' });
    let encrypted = false; try { await PDFDocument.load(await fs.readFile(locked)); } catch (e) { encrypted = /encrypt/i.test(e.message); }
    let wrong = ''; try { await run(['unlock', locked, open], { 'v-password': 'nope' }); } catch (e) { wrong = e.message; }
    await run(['unlock', locked, open], { 'v-password': 'secret 1' }); const back = await PDFDocument.load(await fs.readFile(open));
    check('protect encrypts; unlock needs the right password', encrypted && /not correct/.test(wrong) && back.getPageCount() === 2, { encrypted, wrong });
  });
  await attempt('repair', async () => {
    const bytes = await fs.readFile(pdf), broken = path.join(dir, 'broken.pdf'), fixed = path.join(dir, 'fixed.pdf');
    await fs.writeFile(broken, Buffer.concat([bytes.subarray(0, bytes.lastIndexOf('xref')), Buffer.from('%%EOF\n')]));   // xref table removed
    await run(['repair', broken, fixed]); const d = await PDFDocument.load(await fs.readFile(fixed));
    check('repair rebuilds a PDF without its xref table', d.getPageCount() === 2);
  });
  await attempt('pcompress', async () => { const out = path.join(dir, 'small.pdf'); await run(['pcompress', pdf, out]); const d = await PDFDocument.load(await fs.readFile(out)); check('compress keeps a valid PDF', d.getPageCount() === 2, { before: (await fs.stat(pdf)).size, after: (await fs.stat(out)).size }); });
  await attempt('bgremove', async () => {
    const img = path.join(dir, 'subject.png'), out = path.join(dir, 'subject-bgremove.png');
    // a shaded vase-like object with a soft shadow on a lightly textured backdrop (a cut-out model needs something photo-like)
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><radialGradient id="g" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ffb070"/><stop offset=".6" stop-color="#c04a1a"/><stop offset="1" stop-color="#5a1a08"/></radialGradient><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef0f2"/><stop offset="1" stop-color="#d6d9dd"/></linearGradient><filter id="n"><feTurbulence baseFrequency=".9" numOctaves="2"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .06 0"/></filter><filter id="b"><feGaussianBlur stdDeviation="14"/></filter></defs><rect width="800" height="600" fill="url(#bg)"/><rect width="800" height="600" filter="url(#n)"/><ellipse cx="410" cy="520" rx="170" ry="26" fill="#000" opacity=".28" filter="url(#b)"/><path d="M330 120 Q300 140 320 200 Q250 300 290 430 Q320 520 400 520 Q480 520 510 430 Q550 300 480 200 Q500 140 470 120 Z" fill="url(#g)"/></svg>';
    await sharp(Buffer.from(svg)).png().toFile(img); await run(['bgremove', img, out]);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true }), a = (x, y) => data[(y * info.width + x) * info.channels + 3];
    let opaque = 0; for (let i = 3; i < data.length; i += info.channels) if (data[i] > 128) opaque++;
    check('background removal: background clear, subject kept', info.channels === 4 && a(20, 20) < 60 && a(780, 40) < 60 && a(400, 330) > 190, { channels: info.channels, corner: a(20, 20), centre: a(400, 330), opaqueShare: +(opaque / (info.width * info.height)).toFixed(3) });
  });
  await attempt('track', async () => {
    const video = path.join(dir, 'move.mp4');
    const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x334455:s=640x360:d=4:r=30', '-f', 'lavfi', '-i', 'color=c=0xffcc00:s=60x60:d=4:r=30', '-filter_complex', "[0][1]overlay=x='40+t*120':y='120+t*20',noise=alls=8:allf=t", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
    if (r.status) throw Error('test video: ' + r.stderr);
    const t = await run(['track', video], { start: 0, end: 3.5, x: 40 / 640, y: 120 / 360, width: 60 / 640, height: 60 / 360 });
    const err = Math.max(...t.frames.map(f => Math.max(Math.abs(f.x - (40 + f.t * 120) / 640) * 640, Math.abs(f.y - (120 + f.t * 20) / 360) * 360)));
    check('tracking follows a moving square', t.frames.length >= 30 && err <= 6 && t.lostAt == null, { frames: t.frames.length, maxErrorPx: Math.round(err) });
  });
  console.log(failed ? failed + ' failed' : 'all passed'); process.exit(failed ? 1 : 0);
})();
