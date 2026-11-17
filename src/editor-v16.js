// 0.15 (Phase 16): zooming into the preview. It changes only the view, never the video or the export.
//  - Pinch on the trackpad (or ⌘ + scroll with a mouse) zooms around the pointer.
//  - While zoomed, two-finger scrolling moves the view; so does dragging with Option held.
//  - The menu next to the canvas shape picks Fit, 50%, 100%, 200% or 400% (100% = the exported pixels at 1080p).
//  - View → Zoom In / Zoom Out / Actual Size (⌘+ ⌘− ⌘0) zoom the preview while the editor is open.
(function () {
  'use strict';
  if (new URLSearchParams(location.search).has('render')) return; // the export window never zooms
  const $ = s => document.querySelector(s);
  const MAX = 16;
  let z = 1, x = 0, y = 0, wired = null;

  const canvas = () => $('#ed-canvas');
  // Size of the exported picture at 1080p for the current canvas shape (same rule as the export).
  function exportWidth() {
    const [a, b] = String(window.visorEditor?.get()?.ratio || '16/9').split('/').map(Number);
    return a >= b ? Math.round(1080 * a / b / 2) * 2 : 1080;
  }
  const fitPercent = () => (canvas()?.offsetWidth || 1) / exportWidth() * 100;

  function clamp() {
    const c = canvas(); if (!c) return;
    z = Math.max(1, Math.min(MAX, z));
    const mx = (z - 1) * c.offsetWidth / 2, my = (z - 1) * c.offsetHeight / 2;
    x = Math.max(-mx, Math.min(mx, x)); y = Math.max(-my, Math.min(my, y));
  }
  function apply() {
    const c = canvas(); if (!c) return; clamp();
    c.style.transform = z === 1 ? '' : `translate(${x}px, ${y}px) scale(${z})`;
    c.classList.toggle('v16-zoomed', z > 1);
    const sel = $('#v16-zoom'); if (sel) {
      const pct = Math.round(z * fitPercent());
      sel.options[0].textContent = z === 1 ? 'Fit' : pct + '%';
      sel.value = 'now';
      for (const o of sel.options) if (o.value !== 'now' && o.value !== 'fit') o.disabled = +o.value <= fitPercent() + .5;
    }
  }
  // Zoom to z2 keeping the point (px, py) of the screen still (default: the middle of the preview).
  function zoomTo(z2, px, py) {
    const c = canvas(); if (!c) return;
    const r = c.getBoundingClientRect(), cx = r.left + r.width / 2 - x, cy = r.top + r.height / 2 - y; // centre at Fit
    const dx = (px ?? cx + x) - cx, dy = (py ?? cy + y) - cy;
    const k = Math.max(1, Math.min(MAX, z2)) / z;
    x = dx - (dx - x) * k; y = dy - (dy - y) * k; z = Math.max(1, Math.min(MAX, z2));
    apply();
  }
  window.previewZoomV16 = dir => {
    if (!$('#vv-editor') || !$('#vv-editor').offsetParent) return false;
    if (dir === 'fit') { z = 1; x = y = 0; apply(); }
    else zoomTo(z * (dir === 'in' ? 1.5 : 1 / 1.5));
    return true;
  };
  window.previewZoomStateV16 = () => ({ zoom: z, x, y, percent: Math.round(z * fitPercent()) });

  function wire() {
    const main = $('.ed-main'), c = canvas(), left = $('.v10-transport-left');
    if (!main || !c || wired === main) return;
    wired = main;
    main.addEventListener('wheel', e => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); /* 0.15 (Win-fix 10): a mouse-wheel notch (deltaY ~100, or line/page mode) zooms by a fixed 25% step */ const notch = e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50; zoomTo(notch ? z * (e.deltaY < 0 ? 1.25 : 0.8) : z * Math.exp(-e.deltaY * (e.ctrlKey && !e.metaKey ? .012 : .004)), e.clientX, e.clientY); }
      else if (z > 1) { e.preventDefault(); x -= e.deltaX; y -= e.deltaY; apply(); }
    }, { passive: false });
    main.addEventListener('pointerdown', e => {
      if (!e.altKey || z === 1 || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const sx = e.clientX - x, sy = e.clientY - y; main.classList.add('v16-panning');
      const move = v => { x = v.clientX - sx; y = v.clientY - sy; apply(); };
      const up = () => { main.classList.remove('v16-panning'); removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    }, true);
    if (left && !$('#v16-zoom')) {
      const sel = document.createElement('select');
      sel.id = 'v16-zoom'; sel.className = 'v16-zoom'; sel.title = 'Zoom the preview (pinch, or ⌘+ / ⌘−). Doesn’t change the video.';
      sel.setAttribute('aria-label', 'Preview zoom');
      sel.innerHTML = '<option value="now" hidden>Fit</option><option value="fit">Fit to window</option><option value="50">50%</option><option value="100">100%</option><option value="200">200%</option><option value="400">400%</option>';
      sel.onchange = () => { const v = sel.value; if (v === 'fit') { z = 1; x = y = 0; apply(); } else if (v !== 'now') zoomTo(+v / fitPercent()); sel.blur(); };
      ($('#v5-ratio') || left.lastChild)?.after(sel);
    }
    new ResizeObserver(() => apply()).observe(c);
    apply();
  }
  // Undo and redo sit left of the project name, as in most editors, with their shortcuts in the tooltip.
  // 0.15 (Phase 22): sliders show how far they are filled (--p), and a message about an edit that can be undone
  // gets an Undo button.
  const fill = r => { const min = +r.min || 0, max = r.max === '' ? 100 : +r.max, v = +r.value; r.style.setProperty('--p', (max > min ? (v - min) / (max - min) * 100 : 0) + '%'); };
  document.addEventListener('input', e => { if (e.target.matches?.('input[type=range]')) fill(e.target); }, true);
  const fillAll = () => document.querySelectorAll('#visor-app input[type=range]').forEach(fill);
  const toastUndo = () => { const t = document.getElementById('v15-toast'); if (!t || t.querySelector('.v22-undo') || !/Undo (brings|restores)/.test(t.textContent)) return;
    const text = t.textContent.replace(/\s*Undo (brings it back|restores it)\.?/, ''); t.textContent = text;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'v22-undo'; b.textContent = 'Undo'; b.onclick = () => { window.visorEditor?.undo?.(); t.classList.remove('show'); }; t.append(b); };
  // Tabs keep their name as a tooltip (in narrow windows only the icon shows).
  function tabTitles() { document.querySelectorAll('#vv-editor .ed-tabs button').forEach(b => { if (!b.title) { const t = b.textContent.trim(); if (t) { b.title = t; b.setAttribute('aria-label', t); } } }); }
  function placeHistory() {
    const undo = $('#ed-undo'), redo = $('#ed-redo'), title = $('#vv-editor .ed-header .projecttitle')?.parentElement;
    if (!undo || !redo || !title || undo.parentElement?.classList.contains('v16-history')) return;
    const box = document.createElement('div'); box.className = 'v16-history';
    undo.title = 'Undo (⌘Z)'; redo.title = 'Redo (⇧⌘Z)';
    box.append(undo, redo); title.classList.add('v16-titleblock'); title.prepend(box);
  }
  // The editor rebuilds parts of its layout; wire up whenever the preview appears.
  // 0.15: runs once per batch of page changes (it used to run on every single change: clock ticks, timeline redraws…)
  let queued = false;
  const check = () => { queued = false; placeHistory(); tabTitles(); fillAll(); toastUndo(); if ($('.ed-main') && wired !== $('.ed-main')) wire(); else if ($('.v10-transport-left') && !$('#v16-zoom')) { wired = null; wire(); } };
  new MutationObserver(() => { if (!queued) { queued = true; setTimeout(check, 0); } })
    .observe(document.body, { childList: true, subtree: true });
  // 0.15 (Phase 21): a half-finished "drag a box to blur" on the preview is cancelled when another project starts.
  const editor = window.visorEditor;
  const cancelDrawing = () => document.querySelectorAll('.tracking-select').forEach(n => { const cancel = n.querySelector('button'); if (cancel) cancel.click(); else n.remove(); });
  for (const key of ['reset', 'set']) if (editor?.[key]) { const orig = editor[key]; editor[key] = (...args) => { cancelDrawing(); return orig(...args); }; }
  placeHistory(); wire();
})();
