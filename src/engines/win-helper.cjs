'use strict';
// 0.15 (Phase 33): Windows (and any non-Mac) versions of the tools the macOS helper (native-bin/visor-utilities, built
// on Vision and PDFKit) provides. Same interface as the helper: run([command, input, output], opts, ctx) resolves to the
// JSON text the helper would print, so tools.cjs and main.cjs only choose which one to call.
//   pdftext   → { text }                      pdf.js
//   pdfjpg    → { paths } (PNG per page)      pdf.js + @napi-rs/canvas
//   ocr       → { paths:[txt] }               pdf.js pages → Tesseract (English + Hindi)
//   pcompress / protect / unlock / repair      qpdf
//   bgremove  → { paths:[png] }               IS-Net (onnxruntime) cut-out mask
//   track     → { start, end, frames, lostAt } template tracking on frames decoded by FFmpeg
// Programs and models live in resources/win (qpdf/, models/, tessdata/), placed there by the Windows build.
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process'), { pathToFileURL } = require('node:url');

const unpacked = p => p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
const resources = ctx => ctx?.resources || process.env.VV_WIN_RESOURCES || path.join(process.resourcesPath || path.join(__dirname, '../..'), 'win');
function exec(bin, args, { ok = [0], input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true }); let out = '', err = '';
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; }); p.on('error', reject);
    if (input) p.stdin.end(input); else p.stdin.end();
    p.on('close', code => ok.includes(code) ? resolve(out) : reject(Error((err || out || 'Failed (' + code + ')').trim().split('\n').slice(-2).join(' '))));
  });
}
const outName = (dest, n, count, ext) => count === 1 ? dest : dest.replace(/\.[^.\\/]+$/, '') + '-' + n + '.' + ext;

// ---------- PDF (pdf.js) ----------
let pdfjsLoad = null;
const pdfjs = () => pdfjsLoad ??= import(pathToFileURL(unpacked(require.resolve('pdfjs-dist/legacy/build/pdf.mjs'))).href);
async function openPdf(file, password) {
  const lib = await pdfjs(), data = new Uint8Array(await fs.readFile(file));
  // pdf.js wants this folder with forward slashes and a trailing slash, also on Windows
  const fonts = unpacked(path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')).replace(/\\/g, '/') + '/';
  try { return await lib.getDocument({ data, password, standardFontDataUrl: fonts, isEvalSupported: false, verbosity: 0 }).promise; }
  catch (e) { if (/password/i.test(e?.name + e?.message)) throw Error('This PDF is password protected. Unlock it first.'); throw Error('This PDF could not be read: ' + (e?.message || e)); }
}
async function pdfText(file) {
  const doc = await openPdf(file), pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent(); let text = '';
    for (const it of content.items) if ('str' in it) text += it.str + (it.hasEOL ? '\n' : '');
    pages.push(text.replace(/[ \t]+\n/g, '\n').trim());
  }
  await doc.destroy(); return pages.join('\n\n');
}
// Renders pages to PNG buffers at `dpi` (all pages, or the first `limit`).
async function pdfImages(file, dpi, limit = 300) {
  const doc = await openPdf(file), out = [], n = Math.min(doc.numPages, limit);
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i), viewport = page.getViewport({ scale: dpi / 72 });
    const { canvas, context } = doc.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    out.push(canvas.toBuffer('image/png')); page.cleanup();
  }
  await doc.destroy(); return out;
}
// First page as a small PNG (for the file cards), or null.
async function pdfThumb(file, width = 240) {
  try { const [png] = await pdfImages(file, 72, 1); if (!png) return null; /* 0.15 (Win-fix 3) */ const sharp = require('sharp'); sharp.cache(false); return await sharp(png).resize({ width }).png().toBuffer(); }
  catch { return null; }
}

// ---------- OCR (Tesseract) ----------
async function ocrImages(pngs, ctx) {
  const { createWorker } = require('tesseract.js');
  const worker = await createWorker(['eng', 'hin'], 1, { langPath: path.join(resources(ctx), 'tessdata'), gzip: false, cachePath: path.join(os.tmpdir(), 'visor-tessdata'), logger: () => {} });
  try { const pages = []; for (const png of pngs) pages.push((await worker.recognize(png)).data.text.trim()); return pages; }
  finally { await worker.terminate(); }
}

// ---------- qpdf ----------
const qpdf = ctx => path.join(resources(ctx), 'qpdf', process.platform === 'win32' ? 'qpdf.exe' : 'qpdf');
async function qpdfRun(ctx, args) {
  try { await exec(qpdf(ctx), args, { ok: [0, 3] }); }                     // 3 = done, with warnings
  catch (e) { if (/invalid password/i.test(e.message)) throw Error('That password is not correct.'); throw e; }
}

// ---------- background removal (IS-Net) ----------
let bgSession = null;
async function removeBackground(input, dest, ctx) {
  const ort = require('onnxruntime-node'), sharp = require('sharp'), S = 1024; sharp.cache(false); /* 0.15 (Win-fix 3) */
  bgSession ??= await ort.InferenceSession.create(path.join(resources(ctx), 'models', 'isnet-general-use.onnx'));
  const base = sharp(input).rotate().removeAlpha(), { width: W, height: H } = await base.clone().toBuffer({ resolveWithObject: true }).then(r => r.info);
  const { data } = await base.clone().resize(S, S, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let max = 1; for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i];
  // IS-Net as rembg feeds it: pixels divided by the brightest value, minus 0.5 (std 1)
  const mean = [0.5, 0.5, 0.5], tensor = new Float32Array(3 * S * S);
  for (let i = 0; i < S * S; i++) for (let c = 0; c < 3; c++) tensor[c * S * S + i] = data[i * 3 + c] / max - mean[c];
  const feeds = { [bgSession.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, S, S]) };
  // the model has 12 outputs (the mask plus inner layers); ask for the mask by name, never by position
  const key = bgSession.outputNames.includes('output_image') ? 'output_image' : bgSession.outputNames[0];
  const result = (await bgSession.run(feeds, [key]))[key];
  if (result.dims.join() !== [1, 1, S, S].join()) throw Error('The cut-out model gave an unexpected result (' + key + ' ' + result.dims.join('×') + ').');
  const pred = result.data;
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < S * S; i++) { lo = Math.min(lo, pred[i]); hi = Math.max(hi, pred[i]); }
  const mask = Buffer.alloc(S * S); for (let i = 0; i < S * S; i++) mask[i] = Math.round((pred[i] - lo) / ((hi - lo) || 1) * 255);
  const alpha = await sharp(mask, { raw: { width: S, height: S, channels: 1 } }).resize(W, H, { fit: 'fill' }).extractChannel(0).raw().toBuffer();   // one channel: sharp otherwise returns the grey mask as RGB
  // (a fresh pipeline: removeAlpha() on the same one would drop the new alpha channel again)
  const rgb = await base.clone().raw().toBuffer();
  await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).joinChannel(alpha, { raw: { width: W, height: H, channels: 1 } }).png().toFile(dest);
}

// ---------- tracking ----------
// Follows the chosen box through the range: frames are decoded small and grey (10 a second); each frame searches near
// the last position for the best match of the box's look (which adapts slowly). If the match stays poor, the region is
// reported lost at that moment, as the macOS tracker does.
async function track(input, opts, ctx) {
  const FPS = 10, W = 320, { start, end } = opts;
  const probe = await exec(ctx.ffmpeg, ['-hide_banner', '-i', input], { ok: [0, 1] }).catch(e => e.message);
  const m = /, (\d{2,5})x(\d{2,5})[, ]/.exec(probe), aspect = m ? +m[2] / +m[1] : 9 / 16, H = Math.max(2, Math.round(W * aspect / 2) * 2);
  const raw = await new Promise((resolve, reject) => {
    const p = spawn(ctx.ffmpeg, ['-v', 'error', '-ss', String(start), '-t', String(end - start), '-i', input, '-vf', `fps=${FPS},scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { windowsHide: true });
    const chunks = []; p.stdout.on('data', d => chunks.push(d)); p.on('error', reject); p.on('close', c => c === 0 ? resolve(Buffer.concat(chunks)) : reject(Error('Could not read the video for tracking.')));
  });
  const size = W * H, count = Math.floor(raw.length / size); if (!count) throw Error('Could not read the video for tracking.');
  const bw = Math.min(W, Math.max(6, Math.round(opts.width * W))), bh = Math.min(H, Math.max(6, Math.round(opts.height * H)));
  let x = Math.max(0, Math.min(W - bw, Math.round(opts.x * W))), y = Math.max(0, Math.min(H - bh, Math.round(opts.y * H)));
  const step = Math.max(1, Math.round(Math.max(bw, bh) / 40));                 // sample about 40 points across the box
  const tpl = new Float32Array(bw * bh); for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) tpl[j * bw + i] = raw[(y + j) * W + x + i];
  const frames = [{ t: +start.toFixed(3), x: opts.x, y: opts.y, width: opts.width, height: opts.height }];
  let bad = 0, lostAt = null; const reach = Math.max(8, Math.round(Math.max(bw, bh) * .6));
  for (let f = 1; f < count; f++) {
    const off = f * size; let best = Infinity, bx = x, by = y;
    for (let dy = -reach; dy <= reach; dy += 2) for (let dx = -reach; dx <= reach; dx += 2) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx + bw > W || ny + bh > H) continue;
      let sad = 0, n = 0; for (let j = 0; j < bh; j += step) { const row = off + (ny + j) * W + nx; for (let i = 0; i < bw; i += step) { sad += Math.abs(raw[row + i] - tpl[j * bw + i]); n++; } if (sad / n > best) break; }
      if (sad / n < best) { best = sad / n; bx = nx; by = ny; }
    }
    for (const [ddx, ddy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {                // refine to one pixel
      const nx = bx + ddx, ny = by + ddy; if (nx < 0 || ny < 0 || nx + bw > W || ny + bh > H) continue;
      let sad = 0, n = 0; for (let j = 0; j < bh; j += step) for (let i = 0; i < bw; i += step) { sad += Math.abs(raw[off + (ny + j) * W + nx + i] - tpl[j * bw + i]); n++; }
      if (sad / n < best) { best = sad / n; bx = nx; by = ny; }
    }
    x = bx; y = by; const t = +(start + f / FPS).toFixed(3);
    if (best > 38) { if (++bad >= 5 && lostAt == null) { lostAt = +(start + (f - 4) / FPS).toFixed(3); break; } } else bad = 0;
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) { const k = j * bw + i; tpl[k] = tpl[k] * .9 + raw[off + (y + j) * W + x + i] * .1; }
    frames.push({ t, x: x / W, y: y / H, width: bw / W, height: bh / H });
  }
  return { start, end, frames, ...(lostAt != null ? { lostAt } : {}) };
}

// ---------- the helper's interface ----------
async function run(args, opts = {}, ctx = {}) {
  const [cmd, input, dest] = args;
  if (cmd === 'pdftext') return JSON.stringify({ text: await pdfText(input) });
  if (cmd === 'pdfjpg') {
    const dpi = parseInt(opts['v-resolution']) || 150, pngs = await pdfImages(input, dpi), paths = [];
    for (let i = 0; i < pngs.length; i++) { const p = outName(dest, i + 1, pngs.length, 'png'); await fs.writeFile(p, pngs[i]); paths.push(p); }
    return JSON.stringify({ paths });
  }
  if (cmd === 'ocr') {
    const pages = await ocrImages(await pdfImages(input, 200, 100), ctx);
    await fs.writeFile(dest, pages.map((t, i) => (pages.length > 1 ? '— Page ' + (i + 1) + ' —\n' : '') + t).join('\n\n') + '\n');
    return JSON.stringify({ paths: [dest] });
  }
  if (cmd === 'pcompress') { await qpdfRun(ctx, ['--object-streams=generate', '--compress-streams=y', '--recompress-flate', '--compression-level=9', input, dest]); return JSON.stringify({ paths: [dest] }); }
  if (cmd === 'protect') { const pw = String(opts['v-password'] || ''); if (!pw) throw Error('Enter a password.'); await qpdfRun(ctx, ['--encrypt', pw, pw, '256', '--', input, dest]); return JSON.stringify({ paths: [dest] }); }
  if (cmd === 'unlock') { await qpdfRun(ctx, ['--password=' + String(opts['v-password'] || ''), '--decrypt', input, dest]); return JSON.stringify({ paths: [dest] }); }
  if (cmd === 'repair') { await qpdfRun(ctx, [input, dest]); return JSON.stringify({ paths: [dest] }); }
  if (cmd === 'bgremove') { await removeBackground(input, dest, ctx); return JSON.stringify({ paths: [dest] }); }
  if (cmd === 'track') return JSON.stringify(await track(input, opts, ctx));
  throw Error('This tool is not available on this computer.');
}
module.exports = { run, pdfThumb, pdfText, pdfImages, track };
