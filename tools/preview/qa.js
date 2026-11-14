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

// ---------- Phase 1 helpers ----------
const lane = () => $('#vt-tracks .vt-video');
const secondsPerPx = () => E().get().clips.reduce((n, c) => n + c.end - c.start, 0) / lane().getBoundingClientRect().width;
const pxOf = t => lane().getBoundingClientRect().left + t / secondsPerPx();
const block = (type, id) => $$('#vt-tracks .vt-block').find(b => b.dataset.v7Type === type && b.dataset.v7Id === id && b.offsetParent);
function pointer(el, x, y, x2, y2, opts = {}) {
  const base = { bubbles: true, cancelable: true, pointerId: 7, button: 0, isPrimary: true, ...opts };
  el.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: x, clientY: y, buttons: 1 }));
  const steps = 6;
  for (let i = 1; i <= steps; i++) window.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: x + (x2 - x) * i / steps, clientY: y + (y2 - y) * i / steps, buttons: 1 }));
  window.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: x2, clientY: y2, buttons: 0 }));
}
const centre = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
const setTime = async t => { const sc = $('#ed-scrub'); sc.value = t; sc.dispatchEvent(new Event('input', { bubbles: true })); await wait(80); };
async function twoTitles(a, b) {
  await addTitle('Callouts', 0); await addTitle('Callouts', 1);
  const st = E().get(), track = st.elements[0].trackId;
  st.elements[0] = { ...st.elements[0], start: a[0], end: a[1], trackId: track };
  st.elements[1] = { ...st.elements[1], start: b[0], end: b[1], trackId: track };
  E().patch({ elements: st.elements }); await wait(250);
  return E().get().elements;
}

Object.assign(checks, {
  async 'N toggles snapping'() {
    await freshEditor();
    const on = () => $('#v15-snap')?.getAttribute('aria-pressed');
    const first = on(); key('n'); await wait(100); const second = on(); key('n'); await wait(100);
    return { pass: first === 'true' && second === 'false' && on() === 'true', detail: { first, second, third: on() } };
  },
  async 'a dragged title snaps to the playhead'() {
    await freshEditor(); await setTime(10); await addTitle('Callouts', 0);
    tab('elements').click(); await wait(200); await setTime(3);
    const e = E().get().elements[0], b = block('element', e.id), [x, y] = centre(b);
    const dx = (3 - e.start) / secondsPerPx() + 4; // 4 px past the playhead: should snap onto it
    pointer(b, x, y, x + dx, y); await wait(300);
    const after = E().get().elements[0];
    return { pass: Math.abs(after.start - 3) < 1e-6 || Math.abs(after.end - 3) < 1e-6, detail: { before: e.start, after: after.start } };
  },
  async 'trimming cannot run over the next item'() {
    await freshEditor(); tab('elements').click();
    const els = await twoTitles([1, 4], [6, 9]); tab('elements').click(); await wait(200);
    const b = block('element', els[0].id); b.click(); await wait(150);
    const edge = block('element', els[0].id).querySelector('.v6-edge.end'), [x, y] = centre(edge);
    pointer(edge, x, y, x + 5 / secondsPerPx(), y); await wait(300);
    const a = E().get().elements.find(e => e.id === els[0].id);
    return { pass: a.end <= 6 + 1e-6 && a.end > 4, detail: { end: a.end } };
  },
  async 'a tracking blur can be trimmed'() {
    await freshEditor();
    const data = await (await fetch('/__preview/track.json')).json(), st = E().get();
    st.elements.push({ id: 'tb1', kind: 'tracking-blur', text: '', x: 50, y: 50, width: 40, start: 2, end: 24, animation: 'none', tracking: { ...data, asset: st.clips[0].asset, start: 2, end: 20, limitStart: 2, limitEnd: 20 } });
    E().patch({ elements: st.elements }); tab('effects').click(); await wait(300);
    const edge = block('element', 'tb1')?.querySelector('.v6-edge.end'); if (!edge) return { pass: false, detail: 'no end handle on the tracking blur' };
    const [x, y] = centre(edge); pointer(edge, x, y, x - 4 / secondsPerPx(), y); await wait(300);
    const t = E().get().elements.find(e => e.id === 'tb1').tracking;
    return { pass: t.end < 19 && t.end > 14, detail: { end: t.end } };
  },
  async 'a main clip moves up to V2 and back'() {
    await freshEditor();
    $('#vt-tracks [aria-label="Add Video track"]').click(); await wait(300);
    const c = E().get().clips[0], b = block('video', c.id), [x, y] = centre(b);
    const v2 = $('#vt-tracks .vt-lane[data-track-id="video-1"]'), [, y2] = centre(v2);
    pointer(b, x, y, x, y2); await wait(400);
    const up = E().get();
    const lifted = { overlays: up.overlays?.length || 0, gap: up.clips.some(c => c.gap), linkedAudio: (up.audioClips || []).filter(a => a.linkOverlay).length };
    const ob = block('overlay', up.overlays?.[0]?.id); if (!ob) return { pass: false, detail: { lifted, note: 'overlay block not drawn' } };
    const [ox, oy] = centre(ob), [, my] = centre(lane());
    pointer(ob, ox, oy, ox, my); await wait(400);
    const down = E().get();
    const back = { overlays: down.overlays?.length || 0, gap: down.clips.some(c => c.gap), audioClips: (down.audioClips || []).length, clips: down.clips.length };
    return { pass: lifted.overlays === 1 && lifted.gap && lifted.linkedAudio === 1 && back.overlays === 0 && !back.gap && back.audioClips === 0 && back.clips === 2, detail: { lifted, back } };
  },
  async 'a locked track refuses edits'() {
    await freshEditor();
    $('#vt-tracks .vt-row[data-track-id="video-main"] .vt-label button').click(); await wait(200);
    await setTime(6); const n = E().get().clips.length; $('#ed-split').click(); await wait(200);
    const st = E().get(); st.clips[0] = { ...st.clips[0], end: st.clips[0].end - 2 }; E().patch({ clips: st.clips }); await wait(200);
    return { pass: E().get().clips.length === n && E().get().clips[0].end === st.clips[0].end + 2, detail: { clips: E().get().clips.length, end: E().get().clips[0].end } };
  },
  async 'an empty project shows no fake clip'() {
    localStorage.removeItem('vv-mock'); E().reset(); $('.v-nav [data-route=editor]').click(); await wait(500);
    return { pass: !!$('#vt-tracks .v15-empty-main') && $('#ed-play').disabled && $('#ed-time').textContent === '00:00.0 / 00:00.0', detail: { prompt: !!$('#vt-tracks .v15-empty-main'), play: $('#ed-play').disabled, time: $('#ed-time').textContent } };
  },
  async 'adding a title keeps the playhead'() {
    await freshEditor(); await setTime(8); const t = E().get().time;
    await addTitle('Titles', 0); await addTitle('Callouts', 0);
    const e = E().get().elements;
    return { pass: Math.abs(E().get().time - t) < 1e-6 && e.every(x => x.start <= t && x.end > t), detail: { before: t, after: E().get().time, ranges: e.map(x => [x.start, x.end]) } };
  },
  async 'pasting at the end never makes a zero-length item'() {
    await freshEditor(); await addTitle('Callouts', 0); tab('elements').click(); await wait(200);
    block('element', E().get().elements[0].id).click(); await wait(150);
    key('c', { metaKey: true }); const total = E().get().clips.reduce((n, c) => n + c.end - c.start, 0);
    await setTime(total); key('v', { metaKey: true }); await wait(300);
    const els = E().get().elements;
    return { pass: els.length === 2 && els.every(e => e.end - e.start >= .1 && e.end <= total + 1e-6), detail: els.map(e => [e.start, e.end]) };
  },
  async 'a caption cannot be dragged over the next one'() {
    await freshEditor(); tab('captions').click(); await wait(200);
    panelButton(/Generate captions/).click(); await wait(1400); tab('captions').click(); await wait(200);
    const lines = E().get().transcript, b = block('caption', lines[0].id); if (!b) return { pass: false, detail: 'no caption block' };
    const [x, y] = centre(b); pointer(b, x, y, x + 6 / secondsPerPx(), y); await wait(300);
    const l = E().get().transcript;
    return { pass: l[0].end <= l[1].start + 1e-6, detail: { first: [l[0].start, l[0].end], second: [l[1].start, l[1].end] } };
  },
  async 'the first clip never keeps a transition'() {
    await freshEditor(); const st = E().get();
    st.clips[1] = { ...st.clips[1], transitionIn: { type: 'dissolve', duration: .5 } };
    E().patch({ clips: [st.clips[1], st.clips[0]] }); await wait(200);
    return { pass: !E().get().clips[0].transitionIn, detail: E().get().clips.map(c => c.transitionIn?.type || '-') };
  },
  async 'music can be trimmed and then moved'() {
    await freshEditor(); tab('audio').click(); await wait(200);
    panelButton(/Music library/).click(); await wait(900);
    $$('.v-dialog button').find(b => b.textContent.trim() === 'Add').click(); await wait(500);
    if (!$('#v-overlay').hidden) $('#v-dialog-close').click();
    tab('audio').click(); await wait(300);
    const m = E().get().music, b = block('music', m.asset); if (!b) return { pass: false, detail: 'no music block' };
    const edge = b.querySelector('.v6-edge.end'); if (!edge) return { pass: false, detail: 'no end handle on music' };
    const [x, y] = centre(edge); pointer(edge, x, y, x - 10 / secondsPerPx(), y); await wait(300);
    const trimmed = E().get().music;
    const b2 = block('music', m.asset), [bx, by] = centre(b2); pointer(b2, bx, by, bx + 3 / secondsPerPx(), by); await wait(300);
    const moved = E().get().music;
    return { pass: trimmed.end < 20 && moved.start > 2, detail: { trimmed: [trimmed.start, trimmed.end], moved: [moved.start, moved.end] } };
  },
  async 'a locked item’s panel is read-only'() {
    await freshEditor(); await addTitle('Callouts', 0); tab('elements').click(); await wait(200);
    const id = E().get().elements[0].id; { const b = block('element', id), [x, y] = centre(b); pointer(b, x, y, x, y); } await wait(250);
    const row = $$('#vt-tracks .vt-row').find(r => r.dataset.trackId?.startsWith('graphics-'));
    row.querySelector('.vt-label button').click(); await wait(250);
    // A locked item can't be selected; the panel that was already open becomes read-only.
    const inputs = $$('#ed-panel input,#ed-panel select,#ed-panel textarea');
    return { pass: !!$('#ed-panel .v15-locked-note') && inputs.length > 0 && inputs.every(i => i.disabled), detail: { note: !!$('#ed-panel .v15-locked-note'), inputs: inputs.length, disabled: inputs.filter(i => i.disabled).length } };
  },
  async 'tracks have short names (V1, V2, A1)'() {
    await freshEditor(); $('#vt-tracks [aria-label="Add Video track"]').click(); await wait(300);
    const names = $$('#vt-tracks .vt-row').filter(r => r.dataset.trackId && !r.hidden).map(r => r.querySelector('.vt-label span')?.textContent);
    return { pass: JSON.stringify(names) === '["V2","V1","A1"]', detail: names };
  },
});

// ---------- Phase 3 ----------
const press = el => { const [x, y] = centre(el); pointer(el, x, y, x, y); };
const selectClip = async (i = 0) => { press(block('video', E().get().clips[i].id)); await wait(250); };
const num = label => $$('#ed-panel label').find(l => l.textContent.trim().startsWith(label))?.querySelector('input.v15-num');
const setNum = async (label, v) => { const n = num(label); n.value = v; n.dispatchEvent(new Event('change', { bubbles: true })); await wait(250); };
Object.assign(checks, {
  async 'Esc returns from the clip panel to the tab you were in'() {
    await freshEditor(); tab('captions').click(); await wait(200); await selectClip();
    const opened = E().get().panel; key('Escape'); await wait(250);
    return { pass: opened === 'clip' && E().get().panel === 'captions' && activeTab() === 'captions', detail: { opened, after: E().get().panel, tab: activeTab() } };
  },
  async 'clicking empty timeline closes an item panel'() {
    await freshEditor(); await addTitle('Callouts', 0); tab('elements').click(); await wait(200);
    press(block('element', E().get().elements[0].id)); await wait(250); const opened = E().get().panel;
    const laneEl = $('#vt-tracks .vt-lane[data-group="graphics"]'), r = laneEl.getBoundingClientRect();
    pointer(laneEl, r.right - 20, r.top + r.height / 2, r.right - 20, r.top + r.height / 2); await wait(250);
    return { pass: opened === 'element' && E().get().panel === 'elements', detail: { opened, after: E().get().panel } };
  },
  async 'a solid cover belongs to Effects (tab, back arrow, remove)'() {
    await freshEditor(); tab('effects').click(); await wait(200); panelButton(/Solid cover/).click(); await wait(300);
    const back = $('#ed-panel .v15-back'), info = { panel: E().get().panel, tab: activeTab(), back: back?.title, heading: $('#ed-panel .v15-head h3')?.textContent };
    back.click(); await wait(250); info.afterBack = E().get().panel;
    return { pass: info.panel === 'element' && info.tab === 'effects' && info.back === 'Back to Effects' && info.heading === 'Solid cover' && info.afterBack === 'effects', detail: info };
  },
  async 'the clip panel has Video and Audio sections with number boxes'() {
    await freshEditor(); await selectClip();
    const sections = $$('#ed-panel .v15-section > summary').map(s => s.textContent), ranges = $$('#ed-panel input[type=range]').length, boxes = $$('#ed-panel input.v15-num').length;
    return { pass: JSON.stringify(sections) === '["Video","Audio"]' && ranges > 8 && ranges === boxes, detail: { sections, ranges, boxes } };
  },
  async 'a fade in darkens the start of the clip'() {
    await freshEditor(); await selectClip(); await setNum('Fade in', 2);
    await setTime(1); const v = $('#native-video'), op = +getComputedStyle(v).opacity;
    return { pass: E().get().clips[0].fadeIn === 2 && op > .4 && op < .6, detail: { fadeIn: E().get().clips[0].fadeIn, opacityAt1s: op } };
  },
  async 'audio can be detached and re-attached'() {
    await freshEditor(); await selectClip(); panelButton(/^Detach audio$/).click(); await wait(300);
    const d = E().get(), detached = { muted: d.clips[0].muted, audioClips: (d.audioClips || []).length, from: d.audioClips?.[0]?.detachedFrom === d.clips[0].id };
    await selectClip(); panelButton(/Re-attach audio/).click(); await wait(300);
    const r = E().get();
    return { pass: detached.muted && detached.audioClips === 1 && detached.from && !r.clips[0].muted && !(r.audioClips || []).length, detail: { detached, reattached: { muted: !!r.clips[0].muted, audioClips: (r.audioClips || []).length } } };
  },
  async 'right-click: delete audio only keeps the video'() {
    await freshEditor(); const id = E().get().clips[0].id, n = E().get().clips.length;
    const src = $('#vt-tracks .vt-item-source'); const [x, y] = centre(src);
    src.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })); await wait(200);
    const item = $$('#v7-context button').find(b => b.textContent.trim() === 'Delete audio only'); if (!item) return { pass: false, detail: $$('#v7-context button').map(b => b.textContent) };
    item.click(); await wait(300);
    const c = E().get().clips.find(c => c.id === id);
    return { pass: !!c && c.muted === true && E().get().clips.length === n, detail: { muted: c?.muted, clips: E().get().clips.length } };
  },
  async 'dragging a fade handle on the timeline sets a fade'() {
    await freshEditor(); const b = block('video', E().get().clips[0].id), knob = b.querySelector('.v15-fade.in'); if (!knob) return { pass: false, detail: 'no fade handle' };
    const [x, y] = centre(knob); const base = { bubbles: true, pointerId: 9, button: 0 };
    knob.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: x, clientY: y, buttons: 1 }));
    knob.onpointermove?.(new PointerEvent('pointermove', { ...base, clientX: x + 1.5 / secondsPerPx(), clientY: y, buttons: 1 }));
    knob.onpointerup?.(new PointerEvent('pointerup', { ...base, clientX: x + 1.5 / secondsPerPx(), clientY: y }));
    await wait(250);
    const f = E().get().clips[0].fadeIn;
    return { pass: f >= 1.3 && f <= 1.7, detail: { fadeIn: f } };
  },
  async 'the editor tabs stay on one row'() {
    localStorage.removeItem('vv-mock'); E().reset(); $('.v-nav [data-route=editor]').click(); await wait(400);
    const tops = [...new Set($$('.ed-tabs button').filter(b => b.offsetParent).map(b => Math.round(b.getBoundingClientRect().top)))];
    return { pass: tops.length === 1, detail: tops };
  },
  async 'typing in a number box changes the setting'() {
    await freshEditor(); tab('adjustments').click(); await wait(250); await setNum('Exposure', 30);
    const adj = E().get().clips[E().get().selected]?.adjustments; // adjustments belong to the selected clip
    return { pass: adj?.exposure === 30, detail: adj };
  },
  async 'panel headings name the kind of item'() {
    await freshEditor(); await addTitle('Lower thirds', 0); const lower = $('#ed-panel .v15-head h3')?.textContent;
    await addTitle('Callouts', 0); const callout = $('#ed-panel .v15-head h3')?.textContent;
    return { pass: lower === 'Edit lower third' && callout === 'Edit callout', detail: { lower, callout } };
  },
});

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
