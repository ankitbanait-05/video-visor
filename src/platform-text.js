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
    /* 0.15 (Win-fix 9): macOS settings steps and places, as Windows names them */
    [/Check Screen Recording access in macOS Privacy & Security, then refresh\./g, 'Refresh. If your screens still don’t appear, restart Video Visor.'],
    [/System Settings → Privacy & Security → (Camera|Microphone)/g, 'Windows Settings → Privacy & security → $1 (allow desktop apps)'],
    [/\bOpen System Settings\b/g, 'Open Windows Settings'], [/\bSystem Settings\b/g, 'Windows Settings'],
    [/\bin the menu bar\b/g, 'in the taskbar tray'], [/\bthe menu bar\b/g, 'the taskbar tray'],
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
    /* 0.15 (Win-fix 14): timeline blocks show clip, title and caption text as typed */ '.vt-block',
  ].join(',');
  const FIELDS = USER + ',input,textarea,select,option';
  const fix = text => { let out = text; for (const [re, to] of RULES) out = out.replace(re, to); return out; };
  const needs = text => /[⌘⌥⇧⌫]|\bMac\b|menu-bar icon|menu bar|System Settings|macOS Privacy/.test(text);
  const userText = node => { const el = node.parentElement; return !el || !!el.closest(FIELDS); };
  const userEl = el => !!el.closest?.(USER);
  const filter = { acceptNode: n => (needs(n.nodeValue) && !userText(n)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT };
  /* 0.15 (Win-fix 14): write only when the text really changes. Writing the same value back is still a DOM mutation, so text
     that `needs` matched but no rule changed ("menu bar" in an uncovered phrase, say) re-queued itself forever and froze the page
     (seen after closing the recorder panel). */
  const setText = n => { const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; };
  function pass(root) {
    if (root.nodeType === 3) { if (needs(root.nodeValue) && !userText(root)) setText(root); return; }
    if (root.nodeType !== 1 || userEl(root)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, filter);
    const hits = []; for (let n = walker.nextNode(); n; n = walker.nextNode()) hits.push(n);
    for (const n of hits) setText(n);
    const els = root.querySelectorAll ? [root, ...root.querySelectorAll('[title],[aria-label],[placeholder]')] : [root];
    for (const el of els) { if (userEl(el)) continue; for (const a of ATTRS) { const v = el.getAttribute?.(a); if (v && needs(v)) { const f = fix(v); if (f !== v) el.setAttribute(a, f); } } }
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
