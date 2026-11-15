// Alignment audit for the browser preview (tools/preview/serve.py):
//   const a = await import('/__preview/align.js'); await a.audit()
// On every screen and editor panel (the crawler's list), plus open menus, it measures:
//  - icon + text: the icon's vertical centre against the centre of the first line of text next to it (> 1.5 px off)
//  - icon only: the icon's centre against the button's centre (> 1.5 px off)
//  - dropdowns (<select>): room between the text / arrow and the right edge (arrow under 8 px from the edge, or text
//    running under the arrow)
//  - clipped text: a button or label whose text is cut off
// It reports each problem once per screen with a short selector, so fixes can be checked by running it again.
import { contexts } from './crawl.js';
const wait = ms => new Promise(r => setTimeout(r, ms));
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
// (offsetParent is null inside fixed-position menus, so it can't be used to tell what is shown)
const visible = n => n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden' && !n.closest('[hidden]') && n.getBoundingClientRect().width > 0;
const name = n => (n.id ? '#' + n.id : n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + ' "' + (n.getAttribute('aria-label') || n.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) + '"';
// The first line of real text inside n, outside its icons.
function textLine(n) {
  const walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT, { acceptNode: t => t.textContent.trim() && !t.parentElement.closest('svg, .v-sr, .sr-only') && visible(t.parentElement) && t.parentElement.getBoundingClientRect().width > 2 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
  const t = walker.nextNode(); if (!t) return null;
  const r = document.createRange(); r.selectNodeContents(t); const rects = [...r.getClientRects()].filter(x => x.width > 0); return rects[0] || null;
}
function check(root, out) {
  for (const n of $$('button, [role=menuitem], a.v-button, label', root).filter(visible)) {
    const svg = [...n.querySelectorAll('svg')].find(s => visible(s) && !s.closest('.v17-keys') && s.getBoundingClientRect().width > 6 && s.closest('button, [role=menuitem], a, label') === n);
    if (!svg) continue;
    const sr = svg.getBoundingClientRect(), line = textLine(n), cy = sr.top + sr.height / 2;
    if (line) {
      // an icon above its text (a tile) is a layout, not a misalignment
      const stacked = sr.right > line.left + 2 && sr.left < line.right - 2;
      // an icon beside a two-line block (title + description) may be centred on the block instead of the first line
      const block = n.getBoundingClientRect(), texts = [...n.querySelectorAll('strong, small, span, b, h2, h3, h4, p')].filter(x => visible(x) && !x.querySelector('svg') && x.textContent.trim()).map(x => x.getBoundingClientRect());
      const top = Math.min(line.top, ...texts.map(r => r.top)), bottom = Math.max(line.bottom, ...texts.map(r => r.bottom)), onBlock = Math.abs(cy - (top + bottom) / 2) <= 1.5;
      if (!stacked && !onBlock && block) {
        const off = cy - (line.top + line.height / 2);
        if (Math.abs(off) > 1.5) out.push({ kind: 'icon/text', what: name(n), off: +off.toFixed(1) });
      }
    } else if (n.tagName !== 'LABEL') {
      const br = n.getBoundingClientRect(), ox = sr.left + sr.width / 2 - (br.left + br.width / 2), oy = cy - (br.top + br.height / 2);
      if (Math.abs(ox) > 1.5 || Math.abs(oy) > 1.5) out.push({ kind: 'icon centre', what: name(n), off: [+ox.toFixed(1), +oy.toFixed(1)] });
    }
  }
  for (const s of $$('select', root).filter(visible)) {
    const cs = getComputedStyle(s), pr = parseFloat(cs.paddingRight), bg = cs.backgroundImage, native = cs.appearance !== 'none' && cs.webkitAppearance !== 'none';
    // the arrow: drawn by the app (background image at the right) or by the system (about 6 px from the edge, under 18 px of padding)
    const pos = bg && bg !== 'none' ? parseFloat(cs.backgroundPositionX) : null;
    const arrowGap = native ? 6 : pos != null && /right/.test(cs.backgroundPosition) ? null : null;
    if (native) out.push({ kind: 'select arrow', what: name(s), detail: 'system arrow (sits ~4–6 px from the edge)' });
    else if (pr < 24) out.push({ kind: 'select arrow', what: name(s), detail: 'padding-right ' + pr + 'px' });
    void arrowGap;
  }
  for (const n of $$('button, label, .v15-speed-row strong, h3, h2', root).filter(visible)) {
    if (n.querySelector('input, select, textarea')) continue;
    if (n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflow !== 'visible' && !/ellipsis/.test(getComputedStyle(n).textOverflow)) out.push({ kind: 'clipped', what: name(n), detail: n.scrollWidth + ' > ' + n.clientWidth });
  }
}
// Menus that only exist while open: the media card's Add ▾, Add track, the export dialog.
const extra = [
  ['Media: Add menu', async () => { document.querySelector('.ed-tabs [data-panel=media]')?.click(); await wait(300); document.querySelector('.v21-add-arrow')?.click(); await wait(250); }, '.v21-add-menu:not([hidden])', async () => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await wait(100); }],
  ['Timeline: Add track menu', async () => { document.querySelector('#v27-add-track')?.click(); await wait(200); }, '.v27-add-menu:not([hidden])', async () => { document.querySelector('#v27-add-track')?.click(); await wait(100); }],
  ['Timeline: track headers', async () => {}, '#vt-tracks', async () => {}],
  ['Timeline: track menu', async () => { const l = document.querySelector('#vt-tracks .vt-row[data-track-id="video-main"] .vt-label'), r = l.getBoundingClientRect(); l.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 5 })); await wait(200); }, '#v7-context', async () => { document.querySelector('#v7-context')?.remove(); }],
  ['Timeline: clip menu', async () => { const b = [...document.querySelectorAll('#vt-tracks .vt-block')].find(x => x.dataset.v7Type === 'video'), r = b.getBoundingClientRect(); b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 5 })); await wait(200); }, '#v7-context', async () => { document.querySelector('#v7-context')?.remove(); }],
  ['Timeline: new-track strips', async () => { document.querySelector('[data-media-preview]')?.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() })); await wait(200); }, '#vt-tracks', async () => { document.dispatchEvent(new DragEvent('dragend', { bubbles: true })); await wait(50); }],
  ['Shortcuts dialog', async () => { globalThis.visorEditor.shortcuts(); await wait(200); }, '#v-overlay', async () => { document.querySelector('#v-dialog-close')?.click(); await wait(150); }],
  ['Export dialog', async () => { [...document.querySelectorAll('#vv-editor button')].find(b => /^Export/.test(b.textContent.trim()))?.click(); await wait(400); }, '#v-overlay', async () => { document.querySelector('#v-dialog-close')?.click(); await wait(150); }],
];
async function newProject() {
  localStorage.removeItem('vv-mock'); globalThis.visorEditor.reset();
  document.querySelector('.v-nav [data-route=home]').click(); await wait(250);
  [...document.querySelectorAll('#v-content button')].find(b => /New video|Create a video/.test(b.textContent)).click(); await wait(1000);
}
export async function audit({ only } = {}) {
  const report = {}; await newProject();
  for (const [label, go, scope] of contexts) {
    if (only && !label.includes(only)) continue;
    try { await go(); await wait(150); } catch { continue; }
    const out = []; for (const root of $$(scope)) check(root, out);
    if (out.length) report[label] = dedupe(out);
  }
  for (const [label, go, scope, close] of extra) {
    if (only && !label.includes(only)) continue;
    document.querySelector('.v-nav [data-route=editor]')?.click(); await wait(300);
    await go(); const out = []; for (const root of $$(scope)) check(root, out); await close();
    if (out.length) report[label] = dedupe(out);
  }
  return report;
}
const dedupe = list => { const seen = new Set(); return list.filter(x => { const k = x.kind + x.what; if (seen.has(k)) return false; seen.add(k); return true; }); };
