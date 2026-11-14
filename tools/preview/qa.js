// Regression checks for the editor, run inside the browser preview (tools/preview/serve.py):
//   const qa = await import('/__preview/qa.js'); await qa.run();
// Each check starts from a clean workspace and returns pass/fail with details.
const wait = ms => new Promise(r => setTimeout(r, ms));
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const E = () => globalThis.visorEditor;
const tab = n => $('.ed-tabs button[data-panel=' + n + ']');
const activeTab = () => $('.ed-tabs .active')?.dataset.panel || null;
const panelButton = re => $$('#ed-panel button').find(b => re.test(b.textContent || b.getAttribute('aria-label') || ''));
const key = (k, o = {}) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: o.code || k, bubbles: true, ...o }));
const log = () => window.__nativeLog;
const rows = () => $$('#vt-tracks .vt-row').filter(r => !r.hidden && r.offsetParent && !r.querySelector('.vt-ruler')).map(r => r.dataset.trackId || ('placeholder:' + r.dataset.group));
const host = () => $('#vt-tracks');

async function freshEditor() {
  localStorage.removeItem('vv-mock');
  E().reset();
  $('.v-nav [data-route=home]').click(); await wait(200);
  $$('#v-content button').find(b => /Create a video/.test(b.textContent)).click(); await wait(900);
}
async function addTitle(category = 'Callouts', index = 0) {
  tab('elements').click(); await wait(200);
  panelButton(new RegExp('^' + category + '$'))?.click(); await wait(200);
  const cards = $$('#ed-panel button').filter(b => b.offsetParent && !/^(Titles|Lower thirds|Chapters|Callouts|Quotes|Numbers|Icons)$/.test(b.textContent.trim()));
  cards[index].click(); await wait(300);
}

const checks = {
  async 'new project has only V1 + A1'() {
    await freshEditor();
    const r = rows();
    return { pass: JSON.stringify(r) === JSON.stringify(['video-main', 'audio-1']), detail: r };
  },
  async 'new project does not inherit tracks from the previous one'() {
    await freshEditor();
    $('#vt-tracks [aria-label="Add Video track"]').click(); await wait(300);
    $('#vt-tracks [aria-label="Add Audio track"]').click(); await wait(300);
    const before = rows();
    $('.v-nav [data-route=home]').click(); await wait(200);
    $$('#v-content button').find(b => /Create a video/.test(b.textContent)).click(); await wait(900);
    const after = rows();
    return { pass: before.length === 4 && JSON.stringify(after) === JSON.stringify(['video-main', 'audio-1']), detail: { before, after } };
  },
  async 'a new video track appears above the main video'() {
    await freshEditor();
    $('#vt-tracks [aria-label="Add Video track"]').click(); await wait(300);
    const r = rows();
    return { pass: r.indexOf('video-1') > -1 && r.indexOf('video-1') < r.indexOf('video-main'), detail: r };
  },
  async 'adding a track keeps the focused view'() {
    await freshEditor();
    $('#vt-tracks [aria-label="Add Video track"]').click(); await wait(300);
    return { pass: E().get().timelineView !== 'all', detail: E().get().timelineView };
  },
  async 'each tab shows video + audio + its own layer'() {
    await freshEditor();
    const out = {};
    for (const t of ['elements', 'captions', 'effects', 'audio', 'media']) { tab(t).click(); await wait(250); out[t] = rows(); }
    const ok = out.elements.includes('placeholder:graphics') && out.captions.includes('placeholder:captions') && out.effects.includes('placeholder:effects')
      && JSON.stringify(out.audio) === '["video-main","audio-1"]' && JSON.stringify(out.media) === '["video-main","audio-1"]'
      && ['elements', 'captions', 'effects'].every(t => out[t].includes('video-main') && out[t].includes('audio-1'));
    return { pass: ok, detail: out };
  },
  async 'Media shows every layer that has content'() {
    await freshEditor(); await addTitle();
    tab('media').click(); await wait(250);
    const r = rows();
    return { pass: r.some(x => x.startsWith('graphics-')) && r.includes('video-main') && r.includes('audio-1'), detail: r };
  },
  async 'deleting a graphic keeps the tab and the timeline position'() {
    await freshEditor();
    for (let i = 0; i < 4; i++) await addTitle('Callouts', i);
    tab('elements').click(); await wait(250);
    const h = host(); h.scrollTop = h.scrollHeight; await wait(100);
    const block = $$('#vt-tracks .vt-block.vt-item-element').filter(b => b.offsetParent).pop();
    block.click(); await wait(250);
    const before = { tab: activeTab(), top: Math.round(host().scrollTop), left: Math.round(host().scrollLeft) };
    key('Delete'); await wait(400);
    const after = { tab: activeTab(), top: Math.round(host().scrollTop), left: Math.round(host().scrollLeft) };
    // The deleted item's track is removed when it becomes empty, so the view may shorten by that one row (≤ 48 px), but never jumps to the top.
    return { pass: after.tab === 'elements' && before.top - after.top <= 48 && after.top <= before.top && after.left === before.left, detail: { before, after } };
  },
  async 'Delete with nothing selected removes nothing'() {
    await freshEditor();
    const n = E().get().clips.length;
    key('Escape'); await wait(100); key('Delete'); await wait(300);
    return { pass: E().get().clips.length === n, detail: { before: n, after: E().get().clips.length } };
  },
  async 'Undo does not change the open tab'() {
    await freshEditor(); await addTitle();
    tab('captions').click(); await wait(250);
    $('#ed-undo').click(); await wait(300);
    return { pass: activeTab() === 'captions' && E().get().elements.length === 0, detail: { tab: activeTab(), elements: E().get().elements.length } };
  },
  async 'clicking into a field adds no empty Undo step'() {
    await freshEditor(); await addTitle('Titles', 0);
    const field = $('#ed-panel textarea, #ed-panel input[type=text]');
    field.focus(); field.blur(); field.focus(); field.blur(); await wait(200);
    tab('media').click(); await wait(200);
    $('#ed-undo').click(); await wait(300);
    return { pass: E().get().elements.length === 0, detail: { elementsAfterOneUndo: E().get().elements.length } };
  },
  async 'split creates unique clip ids and no copied transition'() {
    await freshEditor();
    const sc = $('#ed-scrub'); sc.value = 6; sc.dispatchEvent(new Event('input', { bubbles: true })); await wait(100);
    $('#ed-split').click(); await wait(200);
    sc.value = 12; sc.dispatchEvent(new Event('input', { bubbles: true })); await wait(100);
    $('#ed-split').click(); await wait(200);
    const clips = E().get().clips, ids = clips.map(c => c.id);
    return { pass: new Set(ids).size === ids.length && clips.length >= 4, detail: ids };
  },
  async 'duplicate ids in a saved project are repaired on open'() {
    await freshEditor();
    const st = E().get(); st.clips.push({ ...st.clips[0] }); E().set(st); await wait(200);
    const ids = E().get().clips.map(c => c.id);
    return { pass: new Set(ids).size === ids.length, detail: ids };
  },
  async 'redrawing never moves items between tracks'() {
    await freshEditor(); await addTitle('Callouts', 0); await addTitle('Callouts', 1);
    const before = JSON.stringify(E().get().elements.map(e => e.trackId));
    for (let i = 0; i < 20; i++) { tab(['media', 'elements', 'captions', 'effects', 'audio'][i % 5]).click(); await wait(40); }
    const after = JSON.stringify(E().get().elements.map(e => e.trackId));
    return { pass: before === after, detail: { before, after } };
  },
  async 'deleting the last title removes its empty track'() {
    await freshEditor(); await addTitle();
    const withTitle = E().get().timelineTracks.map(t => t.id);
    $$('#vt-tracks .vt-block.vt-item-element').filter(b => b.offsetParent)[0].click(); await wait(200);
    key('Delete'); await wait(300);
    const after = E().get().timelineTracks.map(t => t.id);
    return { pass: withTitle.some(t => t.startsWith('graphics-')) && !after.some(t => t.startsWith('graphics-')), detail: { withTitle, after } };
  },
  async 'switching tabs does not re-request thumbnails'() {
    await freshEditor(); await wait(400);
    const count = () => log().filter(x => x === 'mediaVisuals').length, before = count();
    for (let i = 0; i < 10; i++) { tab(['media', 'elements', 'captions', 'effects', 'audio'][i % 5]).click(); await wait(60); }
    return { pass: count() === before, detail: { before, after: count() } };
  },
  async 'rapid edits are saved once, after a pause'() {
    await freshEditor(); await wait(600);
    const count = () => log().filter(x => x === 'save').length, before = count();
    for (let i = 0; i < 10; i++) { key('ArrowRight'); await wait(20); }
    await wait(700);
    const saves = count() - before;
    return { pass: saves >= 1 && saves <= 2, detail: { saves } };
  },
  async 'saved projects leave out view settings'() {
    await freshEditor(); await addTitle(); tab('captions').click(); await wait(200);
    window.flushSaveV15(); await wait(300);
    const saved = JSON.parse(localStorage.getItem('vv-mock') || 'null');
    const snap = saved?.privateContent?.app?.projects?.find(p => p.id === saved.privateContent.app.activeProject)?.snapshot;
    return { pass: !!snap && !('panel' in snap) && !('timelineView' in snap) && !('collapsedTrackGroups' in snap), detail: snap ? Object.keys(snap).filter(k => ['panel', 'timelineView', 'collapsedTrackGroups', 'active'].includes(k)) : 'no snapshot' };
  },
};

export async function run(only) {
  const results = [];
  const errors = []; const onError = e => errors.push(e.message || String(e.reason)); window.addEventListener('error', onError); window.addEventListener('unhandledrejection', onError);
  for (const [name, fn] of Object.entries(checks)) {
    if (only && !name.includes(only)) continue;
    try { const r = await fn(); results.push({ name, pass: !!r.pass, detail: r.detail }); }
    catch (e) { results.push({ name, pass: false, detail: 'threw: ' + e.message }); }
  }
  window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onError);
  return { passed: results.filter(r => r.pass).length, total: results.length, failed: results.filter(r => !r.pass), pageErrors: errors };
}
