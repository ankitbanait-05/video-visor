// 0.15 (Phase 32): on Windows, words and shortcut symbols written for the Mac read as their Windows equivalents
// ("this Mac" → "this PC", ⌘ → Ctrl+, ⌥ → Alt+, ⇧ → Shift+). Text is rewritten as it appears, in the main window and
// the recorder windows. Does nothing on a Mac.
(function () {
  'use strict';
  if (!/^Win/.test(navigator.platform || '')) return;
  /* 0.15 (Win-fix 1): never run in the offscreen export renderer (?render). Rewriting the frame's titles there fought the
     editor's per-frame text and stalled the export ("stopped responding while drawing frame 1"). */
  if (new URLSearchParams(location.search).has('render')) return;
  const RULES = [
    [/⇧⌘/g, 'Ctrl+Shift+'], [/⌥⌘/g, 'Ctrl+Alt+'], [/⌘⇧/g, 'Ctrl+Shift+'], [/⌘⌥/g, 'Ctrl+Alt+'],
    [/⌘/g, 'Ctrl+'], [/⌥/g, 'Alt+'], [/⇧(?=\S)/g, 'Shift+'], [/⌫/g, 'Backspace'],
    [/\bthis Mac\b/g, 'this PC'], [/\byour Mac\b/g, 'your PC'], [/\bthe Mac\b/g, 'the PC'], [/\bMac's\b/g, "PC's"],
    [/\bMac sound\b/g, 'PC sound'], [/\bon Mac\b/g, 'on Windows'], [/\bthe menu-bar icon\b/g, 'the tray icon'],
  ];
  const ATTRS = ['title', 'aria-label', 'placeholder'];
  /* 0.15 (Win-fix 1): user content is never rewritten — the canvas and its layers, titles, captions, transcript rows,
     media/project/file names, tool results, code blocks (copied as-is), form fields and editable text. Any other container
     can opt out with data-no-platform-text. */
  const USER = [
    '[data-no-platform-text]', '#ed-canvas', '#ed-layers', '#ed-captions', '#ed-clips', '#ed-element-track', '#ed-audio-track',
    '#v6-caption-list', '#v4-caption-text', '#v15-cap-text', '#v20-projects', '#media', '#v-filelist',
    '.ed-layer', '.ed-transcript-row', '.v5-media-grid', '.v5-media', '.v8-word', '.v11-word', '.v15-clip-name', '.v15-file',
    '.v15-files', '.v15-result', '.v10-project', '.v10-job', '.v13-job', '.v19-item', '.projecttitle', '.v13-code',
    'pre', 'code', 'canvas', 'video', '[contenteditable]:not([contenteditable="false"])',
  ].join(',');
  const FIELDS = USER + ',input,textarea,select,option';
  const fix = text => { let out = text; for (const [re, to] of RULES) out = out.replace(re, to); return out; };
  const needs = text => /[⌘⌥⇧⌫]|\bMac\b|menu-bar icon/.test(text);
  const userText = node => { const el = node.parentElement; return !el || !!el.closest(FIELDS); };
  const userEl = el => !!el.closest?.(USER);
  const filter = { acceptNode: n => (needs(n.nodeValue) && !userText(n)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT };
  function pass(root) {
    if (root.nodeType === 3) { if (needs(root.nodeValue) && !userText(root)) root.nodeValue = fix(root.nodeValue); return; }
    if (root.nodeType !== 1 || userEl(root)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, filter);
    const hits = []; for (let n = walker.nextNode(); n; n = walker.nextNode()) hits.push(n);
    for (const n of hits) n.nodeValue = fix(n.nodeValue);
    const els = root.querySelectorAll ? [root, ...root.querySelectorAll('[title],[aria-label],[placeholder]')] : [root];
    for (const el of els) { if (userEl(el)) continue; for (const a of ATTRS) { const v = el.getAttribute?.(a); if (v && needs(v)) el.setAttribute(a, fix(v)); } }
  }
  let queued = [];
  const flush = () => { const list = queued; queued = []; for (const n of list) if (n.isConnected) pass(n); };
  const start = () => {
    pass(document.body); if (needs(document.title)) document.title = fix(document.title);
    new MutationObserver(records => {
      if (!queued.length) setTimeout(flush, 0);
      for (const r of records) {
        if (r.type === 'childList') r.addedNodes.forEach(n => queued.push(n));
        else queued.push(r.target);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
