// 0.15 (Phase 32): on Windows, words and shortcut symbols written for the Mac read as their Windows equivalents
// ("this Mac" → "this PC", ⌘ → Ctrl+, ⌥ → Alt+, ⇧ → Shift+). Text is rewritten as it appears, in the main window and
// the recorder windows. Does nothing on a Mac.
(function () {
  'use strict';
  if (!/^Win/.test(navigator.platform || '')) return;
  const RULES = [
    [/⇧⌘/g, 'Ctrl+Shift+'], [/⌥⌘/g, 'Ctrl+Alt+'], [/⌘⇧/g, 'Ctrl+Shift+'], [/⌘⌥/g, 'Ctrl+Alt+'],
    [/⌘/g, 'Ctrl+'], [/⌥/g, 'Alt+'], [/⇧(?=\S)/g, 'Shift+'], [/⌫/g, 'Backspace'],
    [/\bthis Mac\b/g, 'this PC'], [/\byour Mac\b/g, 'your PC'], [/\bthe Mac\b/g, 'the PC'], [/\bMac's\b/g, "PC's"],
    [/\bMac sound\b/g, 'PC sound'], [/\bon Mac\b/g, 'on Windows'], [/\bthe menu-bar icon\b/g, 'the tray icon'],
  ];
  const ATTRS = ['title', 'aria-label', 'placeholder'];
  const fix = text => { let out = text; for (const [re, to] of RULES) out = out.replace(re, to); return out; };
  const needs = text => /[⌘⌥⇧⌫]|\bMac\b|menu-bar icon/.test(text);
  function pass(root) {
    if (root.nodeType === 3) { if (needs(root.nodeValue)) root.nodeValue = fix(root.nodeValue); return; }
    if (root.nodeType !== 1) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (needs(n.nodeValue)) n.nodeValue = fix(n.nodeValue);
    const els = root.querySelectorAll ? [root, ...root.querySelectorAll('[title],[aria-label],[placeholder]')] : [root];
    for (const el of els) for (const a of ATTRS) { const v = el.getAttribute?.(a); if (v && needs(v)) el.setAttribute(a, fix(v)); }
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
