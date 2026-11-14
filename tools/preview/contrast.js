// Contrast audit for the current screen, run in the browser preview:
//   const c = await import('/__preview/contrast.js'); c.audit()
// Lists visible text whose contrast with the background behind it is under 3:1, and (in dark theme) large
// light surfaces. The video canvas is skipped: its colours belong to the video, not the theme.
const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
function background(el) {
  const layers = [];
  for (let e = el; e; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.backgroundImage.includes('gradient')) { const c = parse(cs.backgroundImage); if (c) { layers.push(c); if (c.a >= 1) break; } }
    const c = parse(cs.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
  }
  let base = { r: 255, g: 255, b: 255, a: 1 };
  for (const l of layers.reverse()) base = over(l, base);
  return base;
}
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const name = el => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
export function audit(limit = 40) {
  const dark = document.getElementById('visor-app')?.dataset.theme === 'dark', out = [], surfaces = [];
  for (const el of document.querySelectorAll('#visor-app *, body > *:not(script)')) {
    if (el.closest('#ed-canvas, svg, .v15-cap-art, .v10-cap-thumb, .cap-art, .template-art, .v15-theme-art')) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const text = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) || (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));
    const bg = background(el);
    if (text) { const fg = parse(cs.color); if (fg) { const c = ratio(over(fg, bg), bg); if (c < 3) out.push({ el: name(el), text: (el.innerText || el.value || '').trim().slice(0, 24), contrast: +c.toFixed(2), fg: cs.color, bg: `rgb(${bg.r | 0},${bg.g | 0},${bg.b | 0})` }); } }
    if (dark && r.width * r.height > 1800) { const own = parse(cs.backgroundColor); if (own && own.a > .5 && lum(own) > .5) surfaces.push({ el: name(el), size: (r.width | 0) + '×' + (r.height | 0), bg: cs.backgroundColor }); }
  }
  return { theme: dark ? 'dark' : 'light', lowContrast: out.slice(0, limit), lowCount: out.length, lightSurfaces: surfaces.slice(0, limit) };
}
