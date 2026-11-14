// Button crawler for the browser preview (tools/preview/serve.py):
//   const c = await import('/__preview/crawl.js'); await c.crawl()
// On every page, editor tab and panel it clicks each visible button once (returning to the same screen before each
// click) and reports buttons that throw, and buttons that change nothing (no DOM change, no state change, no dialog,
// no route change, no status message). Some "nothing happened" results are expected (a selected tab, a disabled
// state); they are listed for review, not failures.
const wait = ms => new Promise(r => setTimeout(r, ms));
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const E = () => globalThis.visorEditor;
const visible = b => b.offsetParent && !b.disabled && b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden';
const label = b => (b.getAttribute('aria-label') || b.title || b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) || ('#' + b.id) || b.className;
const sig = b => [b.id, b.dataset.action, b.dataset.flow, b.dataset.v10, b.dataset.route, b.dataset.panel, b.dataset.tool, b.dataset.native, b.dataset.anim, b.dataset.speed, label(b)].join('|');

async function newProject() {
  localStorage.removeItem('vv-mock'); E().reset();
  $('.v-nav [data-route=home]').click(); await wait(250);
  $$('#v-content button').find(b => /New video|Create a video/.test(b.textContent)).click(); await wait(1000);
}
const route = r => async () => { $('#v-overlay').hidden || $('#v-dialog-close')?.click(); $('.v-nav [data-route=' + r + ']')?.click(); await wait(300); };
const tool = (g, id) => async () => { await route(g)(); $('#v-content [data-tool="' + id + '"]')?.click(); await wait(300); };
const toolFiles = (g, id) => async () => { await tool(g, id)(); $$('#v-content button').find(b => /Choose files/.test(b.textContent))?.click(); await wait(700); };
const editorTab = p => async () => { $('#v-overlay').hidden || $('#v-dialog-close')?.click(); $('.v-nav [data-route=editor]').click(); await wait(250);
  if ($('#vv-editor')?.classList.contains('v10-large')) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(150); }
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {}); (p === 'media' ? $('.ed-tabs [data-panel=elements]') : $('.ed-tabs [data-panel=media]'))?.click(); await wait(80); if ($('.ed-tabs [data-panel=' + p + ']') && !$('.ed-tabs [data-panel=' + p + ']').hidden) $('.ed-tabs [data-panel=' + p + ']').click(); else E().open(p); await wait(300); };
const scopes = {
  page: '#v-content', editorPanel: '#ed-panel', editorTop: '.ed-header', transport: '.ed-transport', timelineTop: '.ed-timeline-top', nav: '.v-nav',
};
// Each context: a name, how to get there, and where to look for buttons.
export const contexts = [
  ['Home', route('home'), scopes.page], ['Projects', route('projects'), scopes.page], ['Video tools', route('video'), scopes.page], ['Image tools', route('image'), scopes.page],
  ['Audio tools', route('audio'), scopes.page], ['PDF tools', route('pdf'), scopes.page], ['Settings', route('settings'), scopes.page], ['Screen recorder', route('record'), scopes.page],
  ['Tool: compress (files)', toolFiles('video', 'vcompress'), scopes.page], ['Tool: frame (files)', toolFiles('video', 'frame'), scopes.page], ['Tool: bg remove (files)', toolFiles('image', 'bgremove'), scopes.page],
  ['Tool: merge (files)', toolFiles('pdf', 'merge'), scopes.page], ['Tool: sign (files)', toolFiles('pdf', 'sign'), scopes.page], ['Tool: watermark (files)', toolFiles('pdf', 'watermark'), scopes.page], ['Tool: clean audio (files)', toolFiles('audio', 'aclean'), scopes.page],
  ['Editor: top bar', editorTab('media'), scopes.editorTop], ['Editor: transport', editorTab('media'), scopes.transport], ['Editor: timeline bar', editorTab('media'), scopes.timelineTop],
  ['Editor: Media', editorTab('media'), scopes.editorPanel], ['Editor: Text & graphics', editorTab('elements'), scopes.editorPanel], ['Editor: Captions', editorTab('captions'), scopes.editorPanel],
  ['Editor: Audio', editorTab('audio'), scopes.editorPanel], ['Editor: Effects', editorTab('effects'), scopes.editorPanel], ['Editor: Transitions', editorTab('transitions'), scopes.editorPanel],
  ['Editor: Clip', editorTab('clip'), scopes.editorPanel], ['Editor: Speed', editorTab('speed'), scopes.editorPanel], ['Editor: Colour', editorTab('adjustments'), scopes.editorPanel],
  ['Editor: Brand style', editorTab('style'), scopes.editorPanel], ['Editor: Focus & zoom', editorTab('zoom'), scopes.editorPanel], ['Editor: Canvas', editorTab('canvas'), scopes.editorPanel],
];

export async function crawl({ only, skip = /Delete project|Delete$/ } = {}) {
  const report = [];
  // settings the app remembers (snapping, tool use, last Settings tab…) are put back afterwards
  const saved = Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]));
  const restore = () => { for (const k of Object.keys(localStorage)) if (!(k in saved)) localStorage.removeItem(k); for (const [k, v] of Object.entries(saved)) localStorage.setItem(k, v); };
  const errors = []; const onErr = e => errors.push(String(e.message || e.reason || e)); addEventListener('error', onErr); addEventListener('unhandledrejection', onErr);
  await newProject();
  for (const [name, go, scope] of contexts) {
    if (only && !name.includes(only)) continue;
    // project cards repeat: a few are enough; at most 45 buttons per screen
    await go(); let cards = 0; const list = $$(scope + ' button').filter(visible).filter(b => !b.closest('.v10-project') || cards++ < 4).map(sig).slice(0, 45); const seen = new Set();
    for (const key of list) {
      if (seen.has(key)) continue; seen.add(key); (crawl.visited ??= {})[name] = (crawl.visited[name] || 0) + 1;
      await go(); const b = $$(scope + ' button').filter(visible).find(x => sig(x) === key); if (!b) { report.push({ name, button: key.split('|').pop(), result: 'gone' }); continue; }
      const text = label(b); if (skip.test(text)) continue;
      const before = { state: JSON.stringify(E()?.get?.() || {}), route: window.__routeV15, overlay: $('#v-overlay').hidden, status: $('#v-status')?.textContent + $('#ed-status')?.textContent };
      let mutations = 0; const mo = new MutationObserver(m => { mutations += m.length; }); mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      const errs = errors.length;
      try { b.click(); } catch (e) { errors.push(e.message); }
      await wait(350); mo.disconnect();
      const after = { state: JSON.stringify(E()?.get?.() || {}), route: window.__routeV15, overlay: $('#v-overlay').hidden, status: $('#v-status')?.textContent + $('#ed-status')?.textContent };
      const changed = mutations > 0 || before.state !== after.state || before.route !== after.route || before.overlay !== after.overlay || before.status !== after.status;
      const thrown = errors.slice(errs);
      if (thrown.length || !changed) report.push({ name, button: text, result: thrown.length ? 'error: ' + thrown.join(' / ').slice(0, 200) : 'no visible effect' });
      if (!$('#v-overlay').hidden) $('#v-dialog-close')?.click();
      if (E()?.get?.().clips?.length > 6 || /Delete|Remove/.test(text)) await newProject();
    }
  }
  removeEventListener('error', onErr); removeEventListener('unhandledrejection', onErr);
  restore();
  return report;
}
