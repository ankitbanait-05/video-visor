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
  localStorage.removeItem('vv-mock'); localStorage.removeItem('vv-snap'); // remembered view settings start from default

  E().reset();
  $('.v-nav [data-route=home]').click(); await wait(200);
  $$('#v-content button').find(b => /New video|Create a video/.test(b.textContent)).click(); await wait(900);
}
async function addTitle(category = 'Callouts', index = 0) {
  tab('elements').click(); await wait(200);
  panelButton(new RegExp('^' + category + '$'))?.click(); await wait(200);
  const cards = $$('#ed-panel button').filter(b => b.offsetParent && b.id !== 'v16-brand' && !/^(Titles|Lower thirds|Chapters|Callouts|Quotes|Numbers|Icons)$/.test(b.textContent.trim()));
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
    $$('#v-content button').find(b => /New video|Create a video/.test(b.textContent)).click(); await wait(900);
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
    b.scrollIntoView({ block: 'nearest' }); await wait(100);
    const edge = b.querySelector('.v6-edge.end'); if (!edge) return { pass: false, detail: 'no end handle on music' };
    const [x, y] = centre(edge); pointer(edge, x, y, x - 10 / secondsPerPx(), y); await wait(300);
    const trimmed = E().get().music;
    block('music', m.asset).scrollIntoView({ block: 'nearest' }); await wait(100);
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
  async 'the clip panel has its sections (Phase 22) with number boxes'() {
    await freshEditor(); await selectClip();
    const sections = $$('#ed-panel .v15-section > summary').map(s => s.textContent), ranges = $$('#ed-panel input[type=range]').length, boxes = $$('#ed-panel input.v15-num').length;
    return { pass: JSON.stringify(sections) === '["Transform","Crop","Fades","Speed & colour","Animation","Audio"]' && ranges > 8 && ranges === boxes, detail: { sections, ranges, boxes } };
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
    await freshEditor(); E().open('adjustments'); await wait(250); await setNum('Exposure', 30);
    const adj = E().get().clips[E().get().selected]?.adjustments; // adjustments belong to the selected clip
    return { pass: adj?.exposure === 30, detail: adj };
  },
  async 'panel headings name the kind of item'() {
    await freshEditor(); await addTitle('Lower thirds', 0); const lower = $('#ed-panel .v15-head h3')?.textContent;
    await addTitle('Callouts', 0); const callout = $('#ed-panel .v15-head h3')?.textContent;
    return { pass: lower === 'Edit lower third' && callout === 'Edit callout', detail: { lower, callout } };
  },
});

// ---------- Phase 4 ----------
const total = () => E().get().clips.reduce((n, c) => n + c.end - c.start, 0);
async function speed(label) { E().open('clip'); await wait(250); $('#v15-open-speed').click(); await wait(250); $$('#ed-panel .v15-speed-tile').find(b => b.textContent.trim() === label).click(); await wait(500); }
Object.assign(checks, {
  async 'a solid cover’s colour and opacity can be changed'() {
    await freshEditor(); tab('effects').click(); await wait(200); panelButton(/Solid cover/).click(); await wait(300);
    $('#ed-panel .v15-swatch[data-fill="#e5484d"]').click(); await wait(250); await setNum('Opacity', 60);
    const e = E().get().elements[0], el = $('.ed-layer[data-id="' + e.id + '"]');
    return { pass: e.fill === '#e5484d' && e.fillOpacity === 60 && getComputedStyle(el).backgroundColor === 'rgba(229, 72, 77, 0.6)', detail: { fill: e.fill, opacity: e.fillOpacity, bg: getComputedStyle(el).backgroundColor } };
  },
  async 'blur strength matches the export (1.5% of the canvas width)'() {
    await freshEditor(); tab('effects').click(); await wait(200); panelButton(/Blur region/).click(); await wait(300);
    const el = $('.ed-layer[data-kind="blur"]'), px = parseFloat(/blur\(([\d.]+)px\)/.exec(getComputedStyle(el).backdropFilter)?.[1]), w = $('#ed-canvas').getBoundingClientRect().width;
    return { pass: Math.abs(px - w * .015) < 1.5, detail: { blurPx: px, expected: +(w * .015).toFixed(1) } };
  },
  async 'Focus & zoom has one clear action'() {
    await freshEditor(); tab('effects').click(); await wait(200); panelButton(/Focus & zoom/).click(); await wait(250);
    const buttons = $$('#ed-panel button').map(b => b.textContent.trim()), disabled = $$('#ed-panel button:disabled').map(b => b.textContent.trim());
    return { pass: buttons.includes('Add zoom at the playhead') && !buttons.some(t => /cursor/i.test(t)) && !disabled.length && !!$('#ed-panel .v15-hint'), detail: { buttons, disabled } };
  },
  async 'Quotes are merged into Titles and Lower thirds'() {
    await freshEditor(); tab('elements').click(); await wait(200);
    const cats = $$('#ed-panel button').map(b => b.textContent.trim()).filter(t => /^(Titles|Lower thirds|Chapters|Callouts|Quotes|Numbers|Icons)$/.test(t));
    panelButton(/^Titles$/).click(); await wait(200); const titles = $('#ed-panel').textContent;
    panelButton(/^Lower thirds$/).click(); await wait(200); const lower = $('#ed-panel').textContent;
    return { pass: !cats.includes('Quotes') && /Pull quote/.test(titles) && /Statement/.test(titles) && /Testimonial card/.test(lower), detail: cats };
  },
  async 'an old hidden zoom becomes an editable zoom'() {
    await freshEditor(); const st = E().get(); E().set({ ...st, zoom: true, focus: { mode: 'manual', x: 30, y: 40, start: 1, end: 4 }, strength: 1.5 }); await wait(200);
    const s = E().get();
    return { pass: s.zoom === false && s.zooms?.length === 1 && s.zooms[0].x === 30 && s.zooms[0].start === 1, detail: { zoom: s.zoom, zooms: s.zooms } };
  },
  async 'speed 2× halves the clip, Normal restores it'() {
    await freshEditor(); await selectClip(); const before = E().get().clips[0];
    await speed('2×'); const fast = E().get().clips[0];
    await speed('Normal'); const back = E().get().clips[0];
    return { pass: Math.abs(fast.end - fast.start - (before.end - before.start) / 2) < .01 && fast.speed?.preset.value === 2 && back.asset === before.asset && back.end === before.end && !back.speed, detail: { before: before.end - before.start, fast: fast.end - fast.start, back: back.end - back.start } };
  },
  async 'a speed curve uses its curve duration'() {
    await freshEditor(); await selectClip(); const d = E().get().clips[0].end - E().get().clips[0].start;
    await speed('Bullet'); const c = E().get().clips[0], expected = window.speedModelV15.outputDuration({ kind: 'curve', name: 'bullet' }, d);
    return { pass: Math.abs(c.end - c.start - expected) < .01 && c.speed?.preset.name === 'bullet', detail: { length: c.end - c.start, expected } };
  },
  async 'captions follow a speed change'() {
    await freshEditor(); tab('captions').click(); await wait(200); panelButton(/Generate captions/).click(); await wait(1400);
    const line = E().get().transcript.find(l => l.asset === E().get().clips[0].asset && l.start > 3);
    await selectClip(); await speed('2×');
    const s = E().get(), moved = s.transcript.find(l => l.asset === s.clips[0].asset && l.text === line.text);
    return { pass: !!moved && Math.abs(moved.start - line.start / 2) < .01, detail: { original: line?.start, mapped: moved?.start } };
  },
  async 'the clip panel shows the clip’s speed'() {
    await freshEditor(); await selectClip(); await speed('1.5×'); await selectClip();
    return { pass: $('#ed-panel .v15-speed-row strong')?.textContent === '1.5×', detail: $('#ed-panel .v15-speed-row')?.textContent };
  },
});

// Phase 5: captions and text.
async function captioned() {
  await freshEditor(); tab('captions').click(); await wait(200); panelButton(/Generate captions/).click(); await wait(1400); tab('captions').click(); await wait(200);
}
Object.assign(checks, {
  async 'captions offer 12 distinct styles and a Hinglish script'() {
    await captioned();
    const tiles = $$('#ed-panel [data-cs15]').map(b => b.textContent.trim()), hinglish = [...($('#v5-script')?.options || [])].some(o => /^Hinglish/.test(o.textContent));
    return { pass: tiles.length === 12 && new Set(tiles).size === 12 && hinglish && !$('#ed-cap-browse'), detail: { tiles, hinglish } };
  },
  async 'every caption style looks different'() {
    await captioned(); const line = E().get().transcript[1], sigs = {};
    for (const b of $$('#ed-panel [data-cs15]')) {
      const k = b.dataset.cs15; $('#ed-panel [data-cs15="' + k + '"]').click(); await wait(60); E().jump(line.start + .9); await wait(30);
      const cap = $('#ed-captions'), span = cap.querySelector(':scope>span'), cur = cap.querySelector('.current'), a = getComputedStyle(span), c = cur ? getComputedStyle(cur) : {};
      sigs[k] = [cap.dataset.cs, cap.querySelectorAll('b').length, a.backgroundColor, a.fontFamily.split(',')[0], a.fontWeight, a.fontStyle, a.textTransform, a.webkitTextStroke, a.textShadow.slice(0, 30), c.color, c.backgroundImage?.slice(0, 20), c.transform, cap.querySelector('.key') ? 'key' : '', cap.querySelector('.tw-rest') ? 'tw' : ''].join('|');
    }
    const unique = new Set(Object.values(sigs)).size;
    return { pass: unique === 12 && Object.keys(sigs).every(k => sigs[k].startsWith(k + '|')), detail: unique === 12 ? unique : sigs };
  },
  async 'old caption styles open as their new equivalents'() {
    await freshEditor(); const s = E().get(); s.captionStyle = 'marker'; s.captionFont = 'Georgia'; E().set(s); await wait(200);
    return { pass: E().get().captionStyle === 'highlighter' && E().get().captionFont === 'DM Serif Display', detail: [E().get().captionStyle, E().get().captionFont] };
  },
  async 'caption highlight colour applies to the spoken word'() {
    await captioned(); $('#ed-panel [data-cs15="pop"]').click(); await wait(100);
    $('#ed-panel [data-cap-colour="#ffd400"]').click(); await wait(100); E().jump(E().get().transcript[1].start + .9); await wait(50);
    const cur = $('#ed-captions .current');
    return { pass: E().get().captionColour === '#ffd400' && !!cur && getComputedStyle(cur).color === 'rgb(255, 212, 0)', detail: cur && getComputedStyle(cur).color };
  },
  async 'caption and title font lists match'() {
    await captioned(); const cap = [...$('#ed-cap-font').options].map(o => o.value);
    E().open('style'); await wait(200); const style = [...($('#ed-style-font')?.options || [])].map(o => o.value);
    const titles = window.titleModelV11.fonts.map(f => f[0]);
    return { pass: JSON.stringify(cap) === JSON.stringify(titles) && JSON.stringify(style) === JSON.stringify(titles), detail: { cap, style, titles } };
  },
  async 'generating captions again keeps corrections'() {
    await captioned(); const before = E().get(); before.transcript[0].text = 'Corrected by hand'; E().patch({ transcript: before.transcript });
    const ask = window.confirm; let asked = 0; window.confirm = () => { asked++; return false; };
    try { panelButton(/Generate captions/).click(); await wait(1400); } finally { window.confirm = ask; }
    const kept = E().get().transcript[0].text;
    window.confirm = () => true; try { panelButton(/Generate captions/).click(); await wait(1400); } finally { window.confirm = ask; }
    const redone = E().get().transcript[0].text;
    return { pass: asked === 1 && kept === 'Corrected by hand' && redone !== 'Corrected by hand', detail: { asked, kept, redone } };
  },
  async 'an SRT file can be imported from the Captions tab'() {
    await freshEditor(); tab('captions').click(); await wait(200);
    const b = panelButton(/Import SRT/); if (!b) return { pass: false, detail: 'no button' };
    b.click(); await wait(500); const s = E().get(), l = s.transcript;
    return { pass: l.length === 2 && l[0].asset === s.clips[0].asset && Math.abs(l[0].start - (s.clips[0].start + 1)) < .01 && s.captions, detail: l.map(x => [x.asset, x.start, x.end, x.text]) };
  },
});

// Phase 6: look, theme, navigation.
async function setTheme(mode) {
  $('.v-nav [data-route=settings]').click(); await wait(250);
  $('[data-theme-choice="' + mode + '"]').click(); await wait(150);
}
const bgLum = el => { const m = getComputedStyle(el).backgroundColor.match(/\d+/g).map(Number); return (m[0] * .299 + m[1] * .587 + m[2] * .114) / 255; };
Object.assign(checks, {
  async 'Settings switches the whole app between light and dark'() {
    await setTheme('dark'); await freshEditor(); const dark = { app: $('#visor-app').dataset.theme, timeline: bgLum($('.ed-timeline')), panel: bgLum($('#ed-panel')) };
    await setTheme('light'); await freshEditor(); const light = { app: $('#visor-app').dataset.theme, timeline: bgLum($('.ed-timeline')), panel: bgLum($('#ed-panel')) };
    await setTheme('system');
    return { pass: dark.app === 'dark' && dark.timeline < .3 && dark.panel < .3 && light.app === 'light' && light.timeline > .8 && light.panel > .8, detail: { dark, light } };
  },
  async 'the primary button keeps its colour in dark'() {
    await setTheme('dark'); await freshEditor(); const b = $$('#vv-editor button').find(x => /^Export/.test(x.textContent.trim())), c = getComputedStyle(b), bg = c.backgroundImage === 'none' ? c.backgroundColor : c.backgroundImage; // Phase 22: a solid primary
    await setTheme('system');
    return { pass: /rgb\(31, 122, 224\)/.test(bg), detail: bg.slice(0, 60) };
  },
  async 'no interface text is smaller than 12 px'() {
    await freshEditor(); const small = [];
    for (const t of ['media', 'elements', 'captions', 'effects']) {
      tab(t).click(); await wait(250);
      for (const el of $$('#visor-app *')) {
        if (el.closest('#ed-canvas, svg, .v15-cap-art, .v10-cap-thumb, .cap-art, .template-art, .v11-card, .v11-thumb, .v5-transition-demo')) continue;
        const r = el.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
        if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 12) small.push(t + ': ' + el.tagName + '.' + el.className + ' ' + fs);
      }
    }
    return { pass: !small.length, detail: small.slice(0, 8) };
  },
  async 'Graphik is the company font for titles and captions'() {
    await freshEditor(); const s = E().get(), fonts = window.titleModelV11.fonts.map(f => f[0]);
    await document.fonts.load('600 20px Graphik');
    return { pass: fonts[0] === 'Graphik' && s.captionFont === 'Graphik' && s.style.font === 'Graphik' && document.fonts.check('600 20px Graphik'), detail: { fonts, caption: s.captionFont, style: s.style.font } };
  },
  async 'canvas shape and framing are tiles'() {
    await freshEditor(); $('#v5-canvas').click(); await wait(300);
    const tile = $$('#ed-panel .v15-choice').find(b => /^1:1/.test(b.textContent)); if (!tile) return { pass: false, detail: 'no tiles' };
    tile.click(); await wait(250); const fill = $$('#ed-panel .v15-choice').find(b => /^Fill/.test(b.textContent)); fill?.click(); await wait(250);
    return { pass: E().get().ratio === '1/1' && !!fill && $('#v5-ratio-select').hidden, detail: { ratio: E().get().ratio } };
  },
  async 'export shows format and resolution only for Custom'() {
    await freshEditor(); $$('#vv-editor button').find(x => /^Export/.test(x.textContent.trim())).click(); await wait(400);
    const before = $('#v15-export-custom').hidden; $('[data-purpose=custom]').click(); await wait(100); const after = $('#v15-export-custom').hidden;
    const shapes = !!$('#v13-export-queue.v15-shapes-button'); $('#v-dialog-body')?.closest('dialog, .v-modal, #v-dialog')?.querySelector('[data-action=close], .v-close, button[aria-label=Close]')?.click(); key('Escape'); await wait(200);
    return { pass: before === true && after === false && shapes, detail: { before, after, shapes } };
  },
  async 'home has one New video entry and no version pill'() {
    $('.v-nav [data-route=home]').click(); await wait(300);
    const starts = $$('#v-content [data-flow=start-edit]').length, pill = !!$('.v-top .v-pill');
    return { pass: starts === 1 && !pill && /New video/.test($('#v-content [data-flow=start-edit]').textContent), detail: { starts, pill } };
  },
  async 'rename: Enter saves, an empty name explains itself'() {
    $('.v-nav [data-route=projects]').click(); await wait(300); $('[data-v10=project-rename]').click(); await wait(200);
    const f = $('#v10-project-name'), old = f.value; f.value = ''; f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(100);
    const msg = $('#v15-name-error')?.textContent; f.value = old + ' & co'; f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(250);
    const saved = !$('#v10-project-name') && $$('#v-content *').some(x => !x.children.length && x.textContent === old + ' & co');
    return { pass: !!msg && saved, detail: { msg, saved } };
  },
});

// Phase 7: audio and export correctness (the export itself is measured by `VV_BENCH_ONLY=audio` in the real app).
async function exportDialog() { $$('#vv-editor button').find(x => /^Export/.test(x.textContent.trim())).click(); await wait(400); }
const closeDialog = async () => { $('#v-dialog-close')?.click(); await wait(150); };
const mb = () => parseFloat($('#flow-estimate').textContent.replace(/[^\d.]/g, ''));
Object.assign(checks, {
  async 'music ducks only while someone speaks in the preview'() {
    await captioned(); const s = E().get(), line = s.transcript[1], c = s.clips[0];
    const at = t => { const st = { ...s, time: t }; let v; for (let i = 0; i < 40; i++) v = window.duckLevelV15(st); return +v.toFixed(2); };
    const speaking = at(line.start - c.start + (line.end - line.start) / 2), pause = at(s.transcript.at(-1).end + 1.5 - c.start); // brief gaps between lines stay lowered, so the music doesn't pump
    const noCaptions = (() => { const st = { ...s, transcript: [], time: 1 }; let v; for (let i = 0; i < 40; i++) v = window.duckLevelV15(st); return +v.toFixed(2); })();
    return { pass: speaking === .45 && pause === 1 && noCaptions === .45, detail: { speaking, pause, noCaptions } };
  },
  async 'export size estimate follows resolution, frame rate and format'() {
    await freshEditor(); await exportDialog(); $('[data-purpose=custom]').click(); await wait(100);
    const set = async (id, v) => { const x = $('#' + id); x.value = v; x.dispatchEvent(new Event('change', { bubbles: true })); x.onchange?.(); await wait(60); };
    await set('v-export-resolution', '720p'); const r720 = mb(); await set('v-export-resolution', '1080p'); const r1080 = mb();
    await set('v-export-fps', '60 fps'); const f60 = mb(); await set('v-export-fps', '30 fps');
    await set('v-export-format', 'Audio only'); const audio = mb(); await set('v-export-format', 'GIF'); const warn = !$('#v15-export-warn').hidden;
    await closeDialog();
    return { pass: r720 < r1080 && f60 > r1080 && audio < r720 && warn, detail: { r720, r1080, f60, audio, gifWarning: warn } };
  },
  async 'a very wide canvas at 4K explains its size'() {
    await freshEditor(); E().patch({ ratio: '32/9' }); await exportDialog(); $('[data-purpose=quality]').click(); await wait(100);
    const text = $('#v15-export-warn').hidden ? '' : $('#v15-export-warn').textContent; await closeDialog();
    return { pass: /4096 × 1152|too wide/.test(text), detail: text };
  },
  async 'recording narration asks before replacing the old one'() {
    await freshEditor(); E().patch({ voiceover: { asset: 'x', name: 'Old take', start: 0 } });
    const ask = window.confirm; let asked = 0; window.confirm = () => { asked++; return false; };
    try { window.dispatchEvent(new CustomEvent('vv-voiceover')); await wait(300); } finally { window.confirm = ask; }
    const opened = !$('#v-overlay').hidden; if (opened) await closeDialog();
    return { pass: asked === 1 && !opened && E().get().voiceover?.name === 'Old take', detail: { asked, opened } };
  },
  async 'frame step moves one exported frame at any project speed'() {
    await freshEditor(); const s = { ...E().get(), speed: 2 }, fps = s.assets.find(a => a.id === s.clips[0].asset)?.fps || 30;
    const step = window.editModel.frameStep(s, 1, 1);
    return { pass: Math.abs(step - (1 + 2 / fps)) < 1e-6, detail: { step, expected: 1 + 2 / fps } };
  },
});

// Phase 9: projects, storage, reliability.
const projectNames = async () => { $('.v-nav [data-route=projects]').click(); await wait(300); return $$('#v-content .v10-project h3, #v-content .v10-project strong').map(x => x.textContent.trim()).filter(Boolean); };
Object.assign(checks, {
  async 'a missing media file can be relinked from the Media tab'() {
    await freshEditor(); const id = E().get().clips[0].asset; window.__missing = [id];
    await wait(5100); tab('elements').click(); await wait(150); tab('media').click(); await wait(400);
    const row = $('#ed-panel .v15-missing'), btn = row?.querySelector('[data-native^="relink-"]');
    if (!btn) { window.__missing = []; return { pass: false, detail: 'no relink row' }; }
    btn.click(); await wait(500); const name = E().get().assets.find(a => a.id === id)?.name; window.__missing = [];
    return { pass: /^Relinked /.test(name || ''), detail: name };
  },
  async 'new videos from the same file get distinct names'() {
    await freshEditor(); await freshEditor.call(null, true).catch?.(() => {});
    $('.v-nav [data-route=home]').click(); await wait(200); $$('#v-content button').find(b => /New video|Create a video/.test(b.textContent)).click(); await wait(900);
    const names = (await projectNames()).filter(n => /^Product demo/.test(n));
    return { pass: names.length >= 2 && names[0] !== names[1], detail: names.slice(0, 3) };
  },
  async 'importing into an emptied project keeps that project'() {
    await freshEditor(); const before = (await projectNames()).length;
    $('.v-nav [data-route=editor]').click(); await wait(400);
    E().patch({ assets: [], clips: [{ id: 'blank', asset: 'blank', name: 'Add footage', kind: 'image', start: 0, end: 5, limit: 5 }] }); await wait(100);
    await window.nativeImport(false); await wait(700);
    const after = (await projectNames()).length;
    return { pass: after === before, detail: { before, after } };
  },
  async 'Settings shows storage and clears caches'() {
    window.__orphans = true; $('.v-nav [data-route=settings]').click(); await wait(500);
    const box = $('#v15-storage'), text = box?.textContent || ''; const clear = box?.querySelector('[data-v10="storage-cache"]');
    clear?.click(); await wait(300); window.__orphans = false;
    return { pass: /412 MB/.test(text) && /180 MB/.test(text) && /2 recordings/.test(text) && window.__cleaned?.opts?.media === false && Array.isArray(window.__cleaned?.used), detail: text.slice(0, 160) };
  },
  async 'a failed save is shown, not just noted in the footer'() {
    await freshEditor(); const orig = window.openai.setWidgetState; window.openai.setWidgetState = () => Promise.reject(Error('Disk full (test)'));
    try { E().patch({ ratio: '1/1' }); await wait(900); } finally { window.openai.setWidgetState = orig; }
    const shown = !$('#v-overlay').hidden && /not being saved/.test($('#v-dialog-body')?.closest('#v-overlay')?.textContent || '');
    $('#v-dialog-close')?.click(); E().patch({ ratio: '16/9' }); await wait(700);
    return { pass: shown, detail: shown };
  },
  async 'opening a project does not mark the previous one as edited'() {
    await freshEditor(); await wait(600); $('.v-nav [data-route=projects]').click(); await wait(300);
    const cards = $$('#v-content [data-project]'); if (cards.length < 2) return { pass: false, detail: 'need two projects' };
    const firstText = cards[0].textContent; cards[1].click(); await wait(800);
    $('.v-nav [data-route=projects]').click(); await wait(300);
    const order = $$('#v-content [data-project]').map(c => c.textContent);
    return { pass: order[0] === firstText, detail: { before: firstText.slice(0, 40), nowFirst: order[0]?.slice(0, 40) } };
  },
});

// Phase 10: file tools (the engine itself is measured by `VV_BENCH_ONLY=tools` in the real app).
async function openToolV(group, id) { $('.v-nav [data-route=' + group + ']').click(); await wait(300); $('#v-content [data-tool="' + id + '"]').click(); await wait(300); }
Object.assign(checks, {
  async 'PDF tools show one editor card and honest names'() {
    $('.v-nav [data-route=pdf]').click(); await wait(300);
    const ids = $$('#v-content [data-tool]').map(b => b.dataset.tool), names = $$('#v-content [data-tool] h3').map(h => h.textContent);
    return { pass: !ids.includes('forms') && !ids.includes('organize') && ids.includes('editpdf') && !names.some(n => /Summarize|Recognize text \(OCR\)/.test(n)), detail: names };
  },
  async 'Process files waits for a file'() {
    await openToolV('video', 'vcompress'); const before = $('[data-action="run-tool"]').disabled;
    return { pass: before === true, detail: { disabledWithoutFiles: before } };
  },
  async 'single-choice settings are hidden'() {
    await openToolV('pdf', 'ocr'); const visible = $$('aside select').filter(x => x.offsetParent && x.options.length < 2).length;
    return { pass: visible === 0, detail: visible };
  },
  async 'Sign PDF offers drawing and typing, and needs a signature'() {
    await openToolV('pdf', 'sign'); const pad = $('#v15-sign-pad'), modes = $$('[data-sign-mode]').length;
    let err = ''; const n = window.__notifyHook; try { $('[data-action="run-tool"]').disabled = false; $('[data-action="run-tool"]').click(); await wait(200); err = $('#v-status')?.textContent || ''; } catch (e) { err = e.message; }
    $$('[data-sign-mode]')[1].click(); $('#v-signname').value = 'Test Person'; $('#v-signname').dispatchEvent(new Event('input')); await wait(300);
    const inked = pad.dataset.ink === '1';
    return { pass: !!pad && modes === 2 && /signature first/i.test(err) && inked, detail: { modes, err: err.slice(0, 60), inked } };
  },
  async 'Hindi text is drawn as an image for PDFs'() {
    const url = window.textImageV15('ड्राफ़्ट ₹500', { size: 30 });
    const b = atob(url.slice(22, 22 + 44)), u = i => (b.charCodeAt(i) << 24 | b.charCodeAt(i + 1) << 16 | b.charCodeAt(i + 2) << 8 | b.charCodeAt(i + 3)) >>> 0, width = u(16), height = u(20); // PNG header (decode() stalls in a hidden pane)
    return { pass: url.startsWith('data:image/png') && width > 60, detail: { width, height } };
  },
});

// Phase 11: AI, security, distribution.
Object.assign(checks, {
  async 'Draft with AI stays out of the way until there is a key or it is turned on'() {
    $('.v-nav [data-route=settings]').click(); await wait(400); const box = $('#v15-show-ai'); if (box.checked) { box.checked = false; box.dispatchEvent(new Event('change')); await wait(200); }
    $('.v-nav [data-route=home]').click(); await wait(400); const hidden = !$('#v-content [data-flow="start-ai"]')?.offsetParent;
    $('.v-nav [data-route=settings]').click(); await wait(300); $('#v15-show-ai').checked = true; $('#v15-show-ai').dispatchEvent(new Event('change')); await wait(200);
    $('.v-nav [data-route=home]').click(); await wait(400); const shown = !!$('#v-content [data-flow="start-ai"]')?.offsetParent;
    return { pass: hidden && shown, detail: { hiddenWithoutKey: hidden, shownWhenOn: shown } };
  },
});

// Phase 13: quick fixes from hands-on testing.
// Surfaces whose colour belongs to the other theme (dark panels in light mode, light panels in dark mode).
// The video canvas, anything coloured by the user (swatches, inline styles) and the badges drawn over a media
// thumbnail (Phase 23: they belong to the picture) are skipped.
function themeMismatches(mode) {
  const lumOf = c => { const m = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?/.exec(c); if (!m || (m[4] !== undefined && +m[4] < .6)) return null; return (.2126 * m[1] + .7152 * m[2] + .0722 * m[3]) / 255; };
  const bad = new Set();
  for (const el of document.querySelectorAll('#visor-app *')) {
    if (!el.offsetParent || el.offsetWidth < 24 || el.offsetHeight < 10) continue;
    if (el.closest('#ed-stage,#ed-canvas,#ed-screen,#ed-captions,.v15-cap,.vt-block,.v23-thumb,canvas,video,img,.v15-theme-art,.v15-swatch,[style*=background]')) continue;
    const l = lumOf(getComputedStyle(el).backgroundColor); if (l == null) continue;
    if ((mode === 'light' && l < .35) || (mode === 'dark' && l > .75)) bad.add((el.id ? '#' + el.id : '') + '.' + String(el.className).split(' ').filter(Boolean).slice(0, 2).join('.'));
  }
  return [...bad];
}
Object.assign(checks, {
  async 'changing speed closes its progress dialog and keeps the copy out of Media'() {
    await freshEditor(); $('#vt-tracks .vt-block.vt-item-video').click(); await wait(200);
    await speed('2×'); await wait(300);
    const dialogOpen = !$('#v-overlay').hidden && !!$('#native-job-label');
    tab('elements').click(); await wait(150); tab('media').click(); await wait(300);
    const names = $$('#ed-panel .v5-media strong').map(x => x.textContent), copy = E().get().assets.filter(a => a.speedOf).length;
    window.__speedFail = true; try { await speed('3×'); await wait(300); } finally { window.__speedFail = false; }
    const openAfterFail = !$('#v-overlay').hidden && !!$('#native-job-label');
    return { pass: !dialogOpen && !openAfterFail && copy === 1 && !names.some(n => /speed/i.test(n)), detail: { dialogOpen, openAfterFail, speedCopies: copy, media: names } };
  },
  async 'no surface keeps the other theme’s colour'() {
    await freshEditor(); tab('captions').click(); await wait(200); panelButton(/Generate captions/).click(); await wait(1400); $('#v-dialog-close')?.click();
    const out = {};
    for (const mode of ['light', 'dark']) {
      document.documentElement.dataset.theme = mode; $('#visor-app').dataset.theme = mode; await wait(100);
      const found = new Set();
      $$('#vt-tracks [aria-expanded=true]').filter(b => !/Video|Audio/.test(b.textContent)).forEach(b => b.click()); await wait(200);
      for (const p of ['media', 'elements', 'captions', 'audio', 'effects', 'transitions', 'clip', 'speed', 'adjustments', 'style']) { if (tab(p) && !tab(p).hidden) tab(p).click(); else E().open(p); await wait(250); themeMismatches(mode).forEach(x => found.add('editor/' + p + ' ' + x)); }
      for (const r of ['home', 'projects', 'video', 'image', 'audio', 'pdf', 'settings']) { $('.v-nav [data-route=' + r + ']').click(); await wait(300); themeMismatches(mode).forEach(x => found.add(r + ' ' + x)); }
      $('.v-nav [data-route=editor]').click(); await wait(300);
      out[mode] = [...found];
    }
    window.applyThemeV15?.();
    return { pass: !out.light.length && !out.dark.length, detail: out };
  },
  async 'the status line is cleared when changing page'() {
    await freshEditor(); window.nativeShell.notify('Editor message (test)');
    $('.v-nav [data-route=image]').click(); await wait(300);
    const text = $('#v-status').textContent;
    return { pass: !/Editor message/.test(text), detail: text };
  },
  async 'transitions stay usable after a project with more clips'() {
    await freshEditor(); const c = E().get().clips[0];
    E().patch({ clips: [c, { ...c, id: 'x2' }, { ...c, id: 'x3' }, { ...c, id: 'x4' }] }); await wait(100);
    tab('transitions').click(); await wait(200); $('#v5-boundary').value = '3'; $('#v5-boundary').dispatchEvent(new Event('change')); await wait(150);
    E().patch({ clips: [c, { ...c, id: 'y2' }] }); tab('media').click(); await wait(100); tab('transitions').click(); await wait(200);
    const disabled = $$('#ed-panel [data-v5-transition]').filter(b => b.disabled).length;
    return { pass: disabled === 0, detail: { disabled } };
  },
  async 'a tool refuses files it cannot use when they are added'() {
    $('.v-nav [data-route=image]').click(); await wait(300); $('#v-content [data-tool="bgremove"]').click(); await wait(300);
    $$('#v-content button').find(b => /Choose files/.test(b.textContent)).click(); await wait(900);
    const listed = $$('#v-filelist strong').map(x => x.textContent), status = $('#v-status').textContent;
    return { pass: listed.length && !listed.some(n => /\.mp4$/.test(n)) && /not added/.test(status), detail: { listed, status } };
  },
});

// Phase 14: export speed (the export itself is measured by `VV_BENCH_ONLY=export` in the real app, and the
// plain-stretch planner by tools/export_plan_test.cjs).
Object.assign(checks, {
  async 'frame rate is Automatic by default: 60 fps footage exports at 30'() {
    await freshEditor(); const s = E().get(), at = id => ({ ...s, assets: s.assets.map(a => a.id === s.clips[0].asset ? { ...a, fps: id } : a) });
    const auto60 = window.exportFpsV15(at(60), 'Automatic'), match60 = window.exportFpsV15(at(60), 'Match source'), auto24 = window.exportFpsV15(at(24), 'Automatic'), fixed = window.exportFpsV15(at(60), '24 fps');
    await exportDialog(); const options = [...$('#v-export-fps').options].map(o => o.value), first = $('#v-export-fps').value; await closeDialog();
    return { pass: auto60 === 30 && match60 === 60 && auto24 === 24 && fixed === 24 && first === 'Automatic' && options.includes('Match source'), detail: { auto60, match60, auto24, fixed, first } };
  },
  async 'the export sends the chosen frame rate'() {
    await freshEditor(); window.__exportCfg = null; const orig = window.native.export; window.native.export = async (st, cfg) => { window.__exportCfg = cfg; return null; };
    try { await exportDialog(); $('[data-purpose=custom]').click(); await wait(100); $('#v-export-fps').value = 'Match source'; $('#v-export-fps').dispatchEvent(new Event('change')); await window.nativeExport(); await wait(200); }
    finally { window.native.export = orig; await closeDialog(); }
    const src = E().get().assets.find(a => a.id === E().get().clips[0].asset)?.fps || 30;
    return { pass: window.__exportCfg?.fps === Math.round(src), detail: { sent: window.__exportCfg?.fps, source: src } };
  },
});

// Phase 15: file tools in one column.
async function toolWithFiles(group, id) { await openToolV(group, id); $$('#v-content button').find(b => /Choose files/.test(b.textContent))?.click(); await wait(900); }
Object.assign(checks, {
  async 'tool pages are one column without the extra text'() {
    await openToolV('image', 'bgremove');
    const text = $('#v-content').innerText;
    const gone = !/Local processing|Files stay on this device|Processing runs locally|Save these settings as a preset|Output settings|Foreground extraction/.test(text);
    return { pass: gone && !$('#v-content .v-two') && !!$('#v-content .v15-tool'), detail: text.replace(/\n+/g, ' | ').slice(0, 200) };
  },
  async 'the main button says what the tool makes'() {
    const names = {};
    for (const [g, id] of [['image', 'bgremove'], ['video', 'frame'], ['pdf', 'merge'], ['audio', 'aclean'], ['pdf', 'sign']]) { await openToolV(g, id); names[id] = $('[data-action="run-tool"]').textContent.trim(); }
    return { pass: names.bgremove === 'Remove background' && names.frame === 'Save frame' && names.merge === 'Merge PDFs' && names.aclean === 'Clean up audio' && names.sign === 'Save signed PDF', detail: names };
  },
  async 'files show as cards with thumbnails; order arrows only where order matters'() {
    await toolWithFiles('pdf', 'merge'); await wait(300);
    const thumbs = $$('#v-filelist .v15-thumb img').length, arrows = $$('#v-filelist [data-file-up]').length, addMore = $('[data-action="choose-files"]').textContent.trim();
    await toolWithFiles('pdf', 'pcompress'); await wait(300); const arrowsElsewhere = $$('#v-filelist [data-file-up]').length;
    return { pass: thumbs === 2 && arrows === 2 && arrowsElsewhere === 0 && addMore === 'Add more files', detail: { thumbs, arrows, arrowsElsewhere, addMore } };
  },
  async 'a one-file tool keeps one file'() {
    await toolWithFiles('pdf', 'sign');
    const cards = $$('#v-filelist .v15-file').length, dropHidden = $('#v-drop').hidden;
    return { pass: cards === 1 && dropHidden && /one file at a time/.test($('#v-status').textContent), detail: { cards, dropHidden, status: $('#v-status').textContent } };
  },
  async 'settings beyond two sit under More settings'() {
    await openToolV('image', 'iresize');
    const visible = [...$('#v15-tool-settings').children].filter(x => x.tagName === 'LABEL' && !x.hidden).length, more = $('#v15-tool-settings .v15-more');
    return { pass: visible === 2 && !!more && !!more.querySelector('#v-crop'), detail: { visible, inMore: more ? [...more.querySelectorAll('label')].map(l => l.firstChild.textContent) : null } };
  },
  async 'the result appears on the page, and Start again clears it'() {
    await toolWithFiles('image', 'bgremove'); $('[data-action="run-tool"]').click(); await wait(900);
    const dialog = !$('#v-overlay').hidden, result = $('#v-result .v15-result'), compare = $$('#v-result .v15-before-after img').length, actions = $$('#v-result [data-native]').map(b => b.textContent.trim());
    $$('#v-result button').find(b => /Start again/.test(b.textContent))?.click(); await wait(300);
    const cleared = !$('#v-result .v15-result') && !$$('#v-filelist .v15-file').length;
    return { pass: !dialog && !!result && compare === 2 && actions.includes('Open') && actions.includes('Show in Finder') && cleared, detail: { dialog, compare, actions, cleared } };
  },
  async 'settings are sent by name, not by position'() {
    await toolWithFiles('image', 'iresize'); $('#v-width').value = '800'; $('#v-height').value = '600'; $('[data-action="run-tool"]').click(); await wait(700);
    const o = window.__lastToolOpts || {};
    return { pass: o['v-width'] === '800' && o['v-height'] === '600', detail: { width: o['v-width'], height: o['v-height'] } };
  },
});

// Phase 16: preview zoom and editor clarity.
Object.assign(checks, {
  async 'pinch zooms the preview around the pointer, and Fit goes back'() {
    await freshEditor(); const c = $('#ed-canvas'), r = c.getBoundingClientRect(), px = r.left + r.width * .8, py = r.top + r.height * .5;
    // the point under the pointer stays put while zooming
    const probe = () => { const b = c.getBoundingClientRect(); return [(px - b.left) / b.width, (py - b.top) / b.height]; }, before = probe();
    $('.ed-main').dispatchEvent(new WheelEvent('wheel', { deltaY: -40, ctrlKey: true, clientX: px, clientY: py, bubbles: true, cancelable: true })); await wait(80);
    const z = window.previewZoomStateV16(), after = probe(), drift = Math.hypot(after[0] - before[0], after[1] - before[1]);
    const shown = $('#v16-zoom').options[0].textContent;
    window.previewZoomV16('fit'); await wait(50); const back = window.previewZoomStateV16().zoom === 1 && !c.style.transform;
    return { pass: z.zoom > 1.3 && drift < .01 && /%$/.test(shown) && back, detail: { zoom: +z.zoom.toFixed(2), drift: +drift.toFixed(4), shown, back } };
  },
  async 'the zoom menu picks a real-pixel size; zoom never changes the project'() {
    await freshEditor(); const before = JSON.stringify(E().saveData?.() || E().get()), sel = $('#v16-zoom');
    sel.value = '200'; sel.dispatchEvent(new Event('change')); await wait(80);
    const pct = window.previewZoomStateV16().percent, after = JSON.stringify(E().saveData?.() || E().get());
    $('.ed-main').dispatchEvent(new WheelEvent('wheel', { deltaX: 30, deltaY: 20, bubbles: true, cancelable: true })); await wait(50);
    const panned = window.previewZoomStateV16(); window.previewZoomV16('fit');
    return { pass: pct === 200 && before === after && panned.x !== 0, detail: { pct, unchanged: before === after, panned: [Math.round(panned.x), Math.round(panned.y)] } };
  },
  async 'six tabs; a clip’s panel highlights none'() {
    await freshEditor(); const tabs = $$('.ed-tabs button').filter(b => b.offsetParent).map(b => b.dataset.panel);
    tab('captions').click(); await wait(150); E().open('clip'); await wait(250);
    const active = $$('.ed-tabs .active').map(b => b.dataset.panel), title = $('#ed-panel h3')?.textContent;
    return { pass: JSON.stringify(tabs) === JSON.stringify(['media', 'elements', 'captions', 'audio', 'effects', 'transitions']) && !active.length && title === 'Clip', detail: { tabs, active, title } };
  },
  async 'Speed and Colour open from the clip panel and go back to it'() {
    await freshEditor(); tab('effects').click(); await wait(200); const inEffects = !!panelButton(/^\s*Speed$/);
    E().open('clip'); await wait(250); const rows = $$('#ed-panel .v15-speed-row span').map(x => x.textContent);
    $('#v16-open-colour').click(); await wait(250); const colourTitle = $('#ed-panel h3')?.textContent, backLabel = $('#ed-panel .v15-back')?.title;
    $('#ed-panel .v15-back').click(); await wait(250); const backTo = $('#ed-panel h3')?.textContent;
    $('#v15-open-speed').click(); await wait(250); const speedBack = $('#ed-panel .v15-back')?.title;
    return { pass: !inEffects && rows.includes('Speed') && rows.includes('Colour') && colourTitle === 'Colour' && backLabel === 'Back to Clip' && backTo === 'Clip' && speedBack === 'Back to Clip', detail: { inEffects, rows, colourTitle, backLabel, backTo, speedBack } };
  },
  async 'Brand style opens from Text & graphics'() {
    await freshEditor(); tab('elements').click(); await wait(200); const b = $('#v16-brand'); b?.click(); await wait(250);
    const title = $('#ed-panel h3')?.textContent, font = !!$('#ed-style-font'), active = $$('.ed-tabs .active').map(x => x.dataset.panel);
    return { pass: !!b && title === 'Brand style' && font && active.join() === 'elements', detail: { title, font, active } };
  },
  async 'undo and redo sit before the project name with their shortcuts'() {
    await freshEditor(); const box = $('.v16-history'), name = $('.projecttitle');
    const before = box && name && (box.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { pass: !!before && /⌘Z/.test($('#ed-undo').title) && /⇧⌘Z/.test($('#ed-redo').title), detail: { undo: $('#ed-undo').title, redo: $('#ed-redo').title } };
  },
  // Phase 21: the ⋯ menu became "Add ▾" (Add to video / Add as a layer / Delete).
  async 'media cards show Add with an arrow: add to video, as a layer, or delete'() {
    await freshEditor(); tab('elements').click(); await wait(150); tab('media').click(); await wait(300);
    const card = $('#ed-panel .v5-media'), visible = [...card.querySelectorAll('button')].filter(b => b.offsetParent && !b.closest('.v16-menu') && !b.dataset.mediaPreview).map(b => b.textContent.trim() || b.getAttribute('aria-label'));
    const arrow = card.querySelector('.v21-add-arrow'), drawn = !!arrow.querySelector('svg'); arrow.click(); await wait(80);
    const items = [...card.querySelectorAll('.v21-add-menu button')].filter(b => b.offsetParent).map(b => b.querySelector('strong')?.textContent);
    const before = (E().get().overlays || []).length; [...card.querySelectorAll('.v21-add-menu button')].find(b => /layer/.test(b.textContent)).click(); await wait(300);
    const layers = (E().get().overlays || []).length, closed = card.isConnected ? card.querySelector('.v21-add-menu').hidden : true;
    return { pass: visible[0] === 'Add' && /More ways to add/.test(visible[1]) && drawn && JSON.stringify(items) === '["Add to video","Add as a layer","Delete from project"]' && layers === before + 1 && closed, detail: { visible, drawn, items, layers: [before, layers], closed } };
  },
  async 'timeline view buttons are icons with names'() {
    await freshEditor(); const v = $('#v8-show-tracks'), f = $('#v5-fit-timeline');
    return { pass: !v.textContent.trim() && v.getAttribute('aria-label') === 'Show all tracks' && !f.textContent.trim() && f.title === 'Fit timeline', detail: { view: v.getAttribute('aria-label'), fit: f.title } };
  },
  async 'changing speed does not block: no dialog, the tile shows progress'() {
    await freshEditor(); E().open('clip'); await wait(250); $('#v15-open-speed').click(); await wait(250);
    const tile = $$('#ed-panel .v15-speed-tile').find(b => b.textContent.trim() === '2×'); tile.click(); await wait(60);
    const dialog = !$('#v-overlay').hidden, busy = tile.classList.contains('v16-busy'), others = $$('#ed-panel .v15-speed-tile:disabled').length, status = $('#ed-status').textContent;
    await wait(400); const done = E().get().clips[0].speed?.preset?.value === 2;
    return { pass: !dialog && busy && others > 3 && /keep editing/.test(status) && done, detail: { dialog, busy, others, status, done } };
  },
});

// Phase 17: keyframes (the engine itself is tested by tools/keyframes_test.cjs).
const diamond = p => $('#ed-panel .v17-diamond[data-prop=' + p + ']');
const setRange = async (id, v) => { const x = $('#' + id); x.value = v; x.dispatchEvent(new Event('change', { bubbles: true })); await wait(200); };
async function animatedScale() { // Scale 100 at 2 s → 150 at 6 s on the first clip
  await freshEditor(); E().open('clip'); await wait(250); E().jump(2); await wait(120); diamond('scale').click(); await wait(200);
  E().jump(6); await wait(150); await setRange('v15-scale', 150);
}
Object.assign(checks, {
  async 'a diamond animates a property; changing it later adds a keyframe'() {
    await freshEditor(); E().open('clip'); await wait(250); E().jump(2); await wait(120); const off = diamond('scale').dataset.state;
    diamond('scale').click(); await wait(200); const on = diamond('scale').dataset.state;
    E().jump(6); await wait(150); const between = diamond('scale').dataset.state; await setRange('v15-scale', 150);
    E().jump(4); await wait(150);
    const keys = (E().get().clips[0].keyframes?.scale || []).map(k => [k.t, k.v]), mid = +$('#v15-scale').value, drawn = $('#native-video').style.transform;
    return { pass: off === 'off' && on === 'on' && between === 'between' && JSON.stringify(keys) === '[[2,100],[6,150]]' && mid === 125 && /scale\(1\.25\)/.test(drawn), detail: { off, on, between, keys, mid, drawn } };
  },
  async '‹ › go to the previous and next keyframe'() {
    await animatedScale(); E().jump(4); await wait(150);
    const label = diamond('scale').closest('label'); label.querySelector('.v17-prev').click(); await wait(150); const back = E().get().time;
    label.querySelector('.v17-next').click(); await wait(150); const fwd = E().get().time;
    const hidden = getComputedStyle(diamond('x').closest('label').querySelector('.v17-prev')).visibility;
    return { pass: Math.abs(back - 2) < .01 && Math.abs(fwd - 6) < .01 && hidden === 'hidden', detail: { back, fwd, unanimatedArrows: hidden } };
  },
  async 'easing and Stop animating from the diamond’s menu'() {
    await animatedScale(); E().jump(2); await wait(150);
    diamond('scale').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await wait(100);
    $$('.v17-ease [data-ease]').find(b => b.dataset.ease === 'linear').click(); await wait(200);
    E().jump(3); await wait(150); const linear = window.keyframesV17.transformAt(E().get().clips[0], 3).scale; // a quarter of the way: 112.5 linear (smooth would be ~107.8)
    diamond('scale').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await wait(100);
    $('.v17-ease [data-stop]').click(); await wait(200);
    const c = E().get().clips[0];
    return { pass: Math.abs(linear - 112.5) < .2 && !c.keyframes?.scale && Math.abs(c.transform.scale - 112.5) < .2, detail: { linear, keyframes: c.keyframes, kept: c.transform?.scale } };
  },
  async 'clicking a filled diamond removes that keyframe; Undo brings it back'() {
    await animatedScale(); E().jump(6); await wait(150); diamond('scale').click(); await wait(200);
    const after = (E().get().clips[0].keyframes?.scale || []).map(k => k.t);
    $('#ed-undo').click(); await wait(250); const undone = (E().get().clips[0].keyframes?.scale || []).map(k => k.t);
    return { pass: JSON.stringify(after) === '[2]' && JSON.stringify(undone) === '[2,6]', detail: { after, undone } };
  },
  async 'presets add keyframes; Remove animation keeps the look at the playhead'() {
    await freshEditor(); E().open('clip'); await wait(250); E().jump(0); await wait(100);
    $('#ed-panel [data-anim="pop-in"]').click(); await wait(250);
    const c = E().get().clips[0], start = [c.keyframes?.scale?.[0]?.v, c.keyframes?.opacity?.[0]?.v];
    E().jump(1.5); await wait(150); $('#v17-remove-anim').click(); await wait(250);
    const d = E().get().clips[0];
    return { pass: start[0] === 80 && start[1] === 0 && !d.keyframes && d.transform.scale === 100 && d.transform.opacity === 100, detail: { start, after: d.transform, keyframes: d.keyframes } };
  },
  async 'timeline diamonds: click goes there, drag moves the keyframe'() {
    await animatedScale(); await wait(200); const marks = $$('.v17-tlkey'); if (marks.length !== 2) return { pass: false, detail: marks.length };
    marks[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, pointerId: 1 })); marks[0].dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })); await wait(150);
    const went = E().get().time;
    const m = $$('.v17-tlkey')[1], r = m.parentElement.getBoundingClientRect(), x = m.getBoundingClientRect().left;
    m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, pointerId: 1 })); m.onpointermove?.({ clientX: x + r.width / 24 * 2 }); m.onpointerup?.(); await wait(250);
    const times = (E().get().clips[0].keyframes.scale || []).map(k => +k.t.toFixed(1));
    return { pass: Math.abs(went - 2) < .01 && times[0] === 2 && Math.abs(times[1] - 8) < .3, detail: { went, times } };
  },
  async 'splitting keeps the animation on the same moment of footage'() {
    await animatedScale(); E().jump(4); await wait(150); const before = +$('#v15-scale').value;
    $$('#vv-editor button').find(b => /^Split$/.test(b.textContent.trim())).click(); await wait(300);
    const s = E().get(), second = s.clips.find(c => Math.abs(c.start - 4) < .05), at = window.keyframesV17.transformAt(second, 4).scale;
    return { pass: before === 125 && !!second && Math.abs(at - 125) < .01, detail: { before, secondStart: second?.start, at } };
  },
  async 'a speed change moves keyframes to the new timing; Normal restores them'() {
    await animatedScale(); await speed('2×'); const sped = (E().get().clips[0].keyframes?.scale || []).map(k => +k.t.toFixed(2));
    await speed('Normal'); const back = (E().get().clips[0].keyframes?.scale || []).map(k => k.t);
    return { pass: JSON.stringify(sped) === '[1,3]' && JSON.stringify(back) === '[2,6]', detail: { sped, back } };
  },
});

// Phase 18: the export window's graphics-only mode (the export itself is measured by `VV_BENCH_ONLY=export`).
Object.assign(checks, {
  async 'graphics-only mode hides the footage and keeps titles and captions'() {
    await freshEditor(); await addTitle(); await wait(200);
    const el = E().get().elements[0]; E().jump((el.start + el.end) / 2); await wait(200);
    window.exportGraphicsModeV18(true); await wait(150);
    const video = getComputedStyle($('#native-video')).visibility, canvasBg = getComputedStyle($('#ed-canvas')).backgroundColor, layer = $$('#ed-canvas .ed-layer').some(n => !n.hidden && n.offsetWidth > 0);
    window.exportGraphicsModeV18(false); await wait(100);
    const back = getComputedStyle($('#native-video')).visibility;
    return { pass: video === 'hidden' && /rgba\(0, 0, 0, 0\)|transparent/.test(canvasBg) && layer && back !== 'hidden' && !document.documentElement.classList.contains('export-graphics'), detail: { video, canvasBg, layer, back } };
  },
});

// Phase 19: shuttle, In / Out, ripple and gaps, select all, markers.
const pressV19 = (k, o = {}) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
Object.assign(checks, {
  async 'J / K / L: L plays, again goes faster; J goes backwards; K stops'() {
    await freshEditor(); E().jump(10); await wait(80);
    pressV19('l'); await wait(60); const one = window.shuttleRateV19(); pressV19('l'); await wait(60); const two = window.shuttleRateV19(); pressV19('l'); await wait(60); const four = window.shuttleRateV19();
    pressV19('k'); await wait(60); const stopped = window.shuttleRateV19();
    pressV19('j'); await wait(60); const back = window.shuttleRateV19(); pressV19('j'); await wait(60); const back2 = window.shuttleRateV19(); pressV19('k'); await wait(60);
    return { pass: one === 1 && two === 2 && four === 4 && stopped === 0 && back === -1 && back2 === -2 && window.shuttleRateV19() === 0, detail: { one, two, four, stopped, back, back2 } };
  },
  async 'I and O mark a range; ⇧⌫ cuts it and later items move up'() {
    await freshEditor(); E().jump(12); await wait(80); E().addElement('title'); await wait(250); const t0 = E().get().elements[0].start;
    E().jump(4); await wait(60); pressV19('i'); E().jump(7); await wait(60); pressV19('o'); await wait(150);
    const range = window.rangeV19(), bar = $('#v19-rangebar')?.textContent || '';
    pressV19('Backspace', { shiftKey: true }); await wait(300);
    const s = E().get(), total = s.clips.reduce((n, c) => n + c.end - c.start, 0), t1 = s.elements[0]?.start;
    return { pass: range?.a === 4 && range?.b === 7 && /Cut range/.test(bar) && Math.abs(total - 26) < .01 && Math.abs(t1 - (t0 - 3)) < .01 && !window.rangeV19(), detail: { range, total, title: [t0, t1] } };
  },
  async 'removing a stretch keeps the titles after it (Magic Edit, transcript cuts)'() {
    await freshEditor(); E().jump(12); await wait(80); E().addElement('title'); await wait(250); const t0 = E().get().elements[0].start;
    E().removeSource(4, 7); await wait(300); const t1 = E().get().elements[0]?.start;
    return { pass: t1 != null && Math.abs(t1 - (t0 - 3)) < .01, detail: { before: t0, after: t1 } };
  },
  async 'Delete closes the gap; ⌥Delete leaves one'() {
    await freshEditor(); const s = E().get(), count = s.clips.length, first = s.clips[0];
    E().open('clip'); await wait(200); pressV19('Delete', { altKey: true }); await wait(300);
    const gap = E().get().clips[0]; $('#ed-undo').click(); await wait(250);
    E().open('clip'); await wait(200); pressV19('Delete'); await wait(300);
    const closed = E().get().clips.length;
    return { pass: gap.gap === true && Math.abs((gap.end - gap.start) - (first.end - first.start)) < .01 && closed === count - 1, detail: { gap: !!gap.gap, clipsAfterDelete: closed, before: count } };
  },
  async '⌘A selects everything on the timeline'() {
    await freshEditor(); E().addElement('title'); await wait(250); $('.ed-timeline').focus(); pressV19('a', { metaKey: true }); await wait(150);
    const n = ($('#v7-selection-count')?.textContent.match(/\d+/) || [0])[0];
    return { pass: +n === E().get().clips.length + E().get().elements.length, detail: { selected: n } };
  },
  async 'M adds a marker; markers move with cuts and give a chapter list'() {
    await freshEditor(); E().jump(10); await wait(60); pressV19('m'); await wait(200); E().jump(18); await wait(60); pressV19('m'); await wait(200);
    const shown = $$('.v19-marker').length, button = !!$('#v19-markers');
    E().removeSource(2, 5); await wait(300); const ts = (E().get().markers || []).map(m => +m.t.toFixed(2));
    const chapters = window.chaptersTextV19();
    return { pass: shown === 2 && button && JSON.stringify(ts) === '[7,15]' && /^00:00 Introduction\n00:07 Marker 1\n00:15 Marker 2$/.test(chapters), detail: { shown, ts, chapters } };
  },
  async 'markers can be renamed and removed, with Undo'() {
    await freshEditor(); E().jump(6); await wait(60); pressV19('m'); await wait(200);
    const el = $('.v19-marker'); el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await wait(100);
    const inp = $('.v19-rename input'); inp.value = 'Demo starts'; $('.v19-rename').dispatchEvent(new Event('submit', { cancelable: true })); await wait(250);
    const named = E().get().markers?.[0]?.label;
    $('.v19-marker').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await wait(250); const gone = (E().get().markers || []).length;
    $('#ed-undo').click(); await wait(250); const back = (E().get().markers || []).length;
    return { pass: named === 'Demo starts' && gone === 0 && back === 1, detail: { named, gone, back } };
  },
});

// Phase 20: Home, Projects, Settings.
Object.assign(checks, {
  async 'Home shows four recent projects and the tools you use most'() {
    await freshEditor(); await freshEditor();
    for (let i = 0; i < 3; i++) { await openToolV('pdf', 'pcompress'); }
    $('.v-nav [data-route=home]').click(); await wait(400);
    // (other checks also open tools, so the one opened here must be among the four, not necessarily first)
    const recent = $$('#v-content .v20-recent > .v10-project').length, heading = $$('#v-content .v-sectionhead h2').map(h => h.textContent).find(t => /tools|everyday/i.test(t)), shown = $$('#v-content .v-row [data-tool]').map(b => b.dataset.tool), count = shown.length;
    return { pass: recent === Math.min(4, $$('#v-content .v10-project').length) && recent >= 2 && heading === 'Your tools' && shown.includes('pcompress') && count === 4, detail: { recent, heading, shown, count } };
  },
  async 'project cards open on click; their actions are in a ⋯ menu'() {
    $('.v-nav [data-route=projects]').click(); await wait(400);
    const card = $('#v-content .v10-project'), menu = card.querySelector('.v20-menu'), toggle = card.querySelector('.v20-more-toggle');
    const hiddenFirst = menu.hidden; toggle.click(); await wait(80); const items = [...menu.querySelectorAll('button')].filter(b => b.offsetParent).map(b => b.textContent.trim());
    document.body.click(); await wait(80); const closedOutside = menu.hidden;
    toggle.click(); await wait(50); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await wait(50); const closedEsc = menu.hidden;
    return { pass: hiddenFirst && items.includes('Rename') && items.includes('Delete') && closedOutside && closedEsc && toggle.getAttribute('aria-label').startsWith('More for'), detail: { hiddenFirst, items, closedOutside, closedEsc } };
  },
  async 'Projects can be searched and sorted'() {
    $('.v-nav [data-route=projects]').click(); await wait(400);
    const names = () => $$('#v20-projects .v10-project h3').map(h => h.textContent.trim());
    const all = names().length, target = names()[1];
    const search = $('#v20-search'); search.value = target; search.dispatchEvent(new Event('input')); await wait(150); const found = names();
    search.value = 'zzz no such project'; search.dispatchEvent(new Event('input')); await wait(150); const none = $('#v20-projects .v-empty')?.textContent || '';
    search.value = ''; search.dispatchEvent(new Event('input')); await wait(100);
    const sort = $('#v20-sort'); sort.value = 'name'; sort.dispatchEvent(new Event('change')); await wait(150); const byName = names();
    const sorted = byName.slice().sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    sort.value = 'edited'; sort.dispatchEvent(new Event('change')); await wait(100);
    return { pass: all > 1 && found.length >= 1 && found.every(n => n.includes(target)) && /No project/.test(none) && JSON.stringify(byName) === JSON.stringify(sorted), detail: { all, target, found: found.length, none, firstByName: byName.slice(0, 3) } };
  },
  async 'Settings are grouped in tabs, and the tab is remembered'() {
    $('.v-nav [data-route=settings]').click(); await wait(500);
    const tabs = $$('#v20-settings-tabs [data-settings-tab]').map(b => b.textContent), shown = () => $$('.v10-settings > section').filter(x => !x.hidden).map(x => x.querySelector('h2')?.textContent);
    const general = shown(); $('[data-settings-tab=storage]').click(); await wait(200); const storage = shown(), storageBox = !!$('#v15-storage')?.offsetParent;
    $('.v-nav [data-route=home]').click(); await wait(200); $('.v-nav [data-route=settings]').click(); await wait(500); const again = shown();
    $('[data-settings-tab=general]').click(); await wait(100);
    return { pass: JSON.stringify(tabs) === '["General","Appearance","Storage","AI","About"]' && general.includes('Exports') && !general.includes('Storage') && JSON.stringify(storage) === '["Storage"]' && storageBox && JSON.stringify(again) === '["Storage"]', detail: { tabs, general, storage, again } };
  },
});

// Phase 21: fixes from hands-on testing (round 2).
const withCursor = () => { const s = E().get(), a = s.assets.find(x => x.id === s.clips[0].asset); a.cursor = Array.from({ length: 50 }, (_, i) => ({ t: i * .5, x: 20 + i, y: 30 })); E().set(s); };
Object.assign(checks, {
  async 'a sped-up clip keeps its cursor track, so cursor zoom is offered'() {
    await freshEditor(); withCursor(); await wait(200);
    await speed('2×'); await wait(200);
    const s = E().get(), copy = s.assets.find(a => a.id === s.clips[0].asset), times = (copy.cursor || []).map(c => c.t);
    E().jump(1); await wait(100); E().open('zoom'); await wait(300); const offered = !!$('#v4-cursor');
    return { pass: copy.speedOf && times.length > 10 && Math.abs(times[2] - .5) < .01 && offered, detail: { points: times.length, third: times[2], offered } };
  },
  async 'copies made before the fix get their cursor back when the project opens'() {
    await freshEditor(); withCursor(); await wait(200); await speed('2×'); await wait(200);
    const s = E().get(); s.assets.find(a => a.id === s.clips[0].asset).cursor = []; E().set(s); await wait(300);
    E().open('media'); await wait(300); const back = (E().get().assets.find(a => a.id === E().get().clips[0].asset).cursor || []).length;
    return { pass: back > 10, detail: { points: back } };
  },
  async 'the zoom panel says which clip has a cursor, and a zoom can follow it'() {
    await freshEditor(); E().jump(26); await wait(100); E().open('zoom'); await wait(300); const none = $('#ed-panel .v15-hint')?.textContent || '';
    withCursor(); await wait(200); E().jump(26); await wait(100); E().open('zoom'); await wait(300); const elsewhere = $('#ed-panel .v15-hint')?.textContent || '';
    E().jump(1); await wait(100); E().open('zoom'); await wait(300); $('#v4-add-zoom').click(); await wait(300);
    const follow = $('#v21-follow'); follow.checked = true; follow.dispatchEvent(new Event('change')); await wait(250);
    const mode = (E().get().zooms || []).at(-1)?.mode;
    return { pass: /No clip in this video has a recorded cursor/.test(none) && /Move the playhead onto Product demo/.test(elsewhere) && mode === 'cursor', detail: { none: none.slice(0, 60), elsewhere: elsewhere.slice(0, 80), mode } };
  },
  async 'Brand style is one compact row'() {
    await freshEditor(); tab('elements').click(); await wait(250); const b = $('#v16-brand');
    return { pass: !!b && b.getBoundingClientRect().height <= 40 && b.textContent.trim() === 'Brand style' && /logo/.test(b.title), detail: { height: Math.round(b?.getBoundingClientRect().height), text: b?.textContent.trim() } };
  },
  async 'Home has one button to choose files, and no prototype text anywhere'() {
    $('.v-nav [data-route=home]').click(); await wait(300);
    const pickers = $$('#v-content button').filter(b => /Choose files|Import footage/.test(b.textContent)).length;
    const src = await Promise.all(['/shell.js', '/runtime.js', '/editor.js'].map(u => fetch(u).then(r => r.text())));
    const leftovers = src.join('').match(/prototype\b|sample walkthrough|Use sample footage|placeholder added/g) || [];
    return { pass: pickers === 1 && !leftovers.length, detail: { pickers, leftovers } };
  },
  async 'messages appear at the bottom of the window'() {
    await freshEditor(); const t = $('#v15-toast'); if (!t) return { pass: true, detail: 'no toast element in this build' };
    const r = t.getBoundingClientRect();
    return { pass: r.top > innerHeight / 2, detail: { top: Math.round(r.top), height: innerHeight } };
  },
  async 'starting another project cancels a half-drawn blur box'() {
    await freshEditor(); const c = $('#ed-canvas'), o = document.createElement('div'); o.className = 'tracking-select'; o.innerHTML = '<div class="tracking-help">Drag a box <button type="button">Cancel</button></div>'; o.querySelector('button').onclick = () => o.remove(); c.append(o);
    await freshEditor(); return { pass: !$('.tracking-select'), detail: !!$('.tracking-select') };
  },
  async 'dropping a file the project no longer has explains why'() {
    await freshEditor(); $('#vt-tracks [aria-label="Add Video track"]').click(); await wait(300);
    const row = $$('#vt-tracks .vt-row').find(r => /^video-\d/.test(r.dataset.trackId || '')), lane = row.querySelector('.vt-lane'), dt = new DataTransfer(); dt.setData('application/x-video-visor-media', 'missing-id');
    const rr = lane.getBoundingClientRect(); lane.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: rr.left + 40, clientY: rr.top + 5 })); await wait(200);
    return { pass: /no longer in this project/.test($('#ed-status').textContent), detail: $('#ed-status').textContent };
  },
});

// Phase 22: the design layer (src/design-v22.css).
const look = b => { const c = getComputedStyle(b); return [Math.round(b.getBoundingClientRect().height), c.borderRadius, c.fontSize, c.fontWeight].join(' '); };
Object.assign(checks, {
  async 'buttons follow one system: radius, type and a few heights'() {
    await freshEditor(); const seen = new Set(), radii = new Set(), sizes = new Set();
    for (const sel of ['.ed-header button', '.ed-timeline-top button', '#ed-panel .ed-wide', '.v10-transport button:not(#ed-play)']) for (const b of $$('#vv-editor ' + sel)) { if (!b.offsetParent) continue; seen.add(look(b)); radii.add(getComputedStyle(b).borderRadius); sizes.add(getComputedStyle(b).fontSize); }
    $('.v-nav [data-route=settings]').click(); await wait(300); for (const b of $$('#v-content .v-button')) if (b.offsetParent) { radii.add(getComputedStyle(b).borderRadius); sizes.add(getComputedStyle(b).fontSize); }
    return { pass: radii.size === 1 && radii.has('8px') && sizes.size === 1 && sizes.has('13px'), detail: { radii: [...radii], sizes: [...sizes], kinds: seen.size } };
  },
  async 'one primary button per screen: Export in the editor'() {
    await freshEditor(); const accent = getComputedStyle($('#ed-export')).backgroundColor;
    const primaries = $$('#vv-editor button').filter(b => b.offsetParent && getComputedStyle(b).backgroundColor === accent && b.id !== 'ed-play' && !b.closest('#ed-panel'));
    return { pass: primaries.length === 1, detail: primaries.map(b => b.textContent.trim() || b.id) };
  },
  async 'sliders show how far they are filled'() {
    await freshEditor(); E().open('clip'); await wait(300); const r = $('#v15-opacity');
    const p = r.style.getPropertyValue('--p'); r.value = 50; r.dispatchEvent(new Event('input', { bubbles: true })); const half = r.style.getPropertyValue('--p');
    return { pass: p === '100%' && half === '50%', detail: { full: p, half } };
  },
  async 'clip sections remember whether they are open'() {
    await freshEditor(); E().open('clip'); await wait(300);
    const crop = $('#ed-panel details[data-sec=crop]'); crop.open = true; crop.dispatchEvent(new Event('toggle')); await wait(50);
    const tr = $('#ed-panel details[data-sec=transform]'); tr.open = false; tr.dispatchEvent(new Event('toggle')); await wait(50);
    E().open('media'); await wait(150); E().open('clip'); await wait(300); // the panel is drawn again from scratch
    const after = { crop: $('#ed-panel details[data-sec=crop]').open, transform: $('#ed-panel details[data-sec=transform]').open };
    $('#ed-panel details[data-sec=transform]').open = true; $('#ed-panel details[data-sec=transform]').dispatchEvent(new Event('toggle'));
    return { pass: after.crop === true && after.transform === false, detail: after };
  },
  async 'a message about an edit that can be undone has an Undo button'() {
    await freshEditor(); E().jump(5); await wait(80); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true })); await wait(250);
    const marker = $('.v19-marker'); marker.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await wait(350);
    const t = $('#v15-toast'), button = t?.querySelector('.v22-undo'); button?.click(); await wait(300);
    return { pass: !!button && (E().get().markers || []).length === 1, detail: { text: t?.textContent, button: !!button, markers: (E().get().markers || []).length } };
  },
  async 'navigation links stay quiet'() {
    $('.v-nav [data-route=home]').click(); await wait(300); const b = $('.v-nav [data-route=projects]'), c = getComputedStyle(b);
    return { pass: c.backgroundColor === 'rgba(0, 0, 0, 0)' && c.borderTopColor === 'rgba(0, 0, 0, 0)' && c.boxShadow === 'none', detail: [c.backgroundColor, c.borderTopColor, c.boxShadow] };
  },
});

// Phase 23: visual pass II (media grid, timeline, playback bar, Home, dark mode).
Object.assign(checks, {
  async 'media cards sit two to a row, with the kind of file and the length on the thumbnail'() {
    await freshEditor(); E().open('media'); await wait(400);
    const grid = $('#ed-panel .v5-media-grid'), cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const card = $$('#ed-panel .v5-media').find(c => c.dataset.kind === 'video'), length = card?.querySelector('.v23-length')?.textContent, kind = !!card?.querySelector('.v23-kind svg');
    const shape = card?.querySelector(':scope > small')?.textContent, label = card?.querySelector('.v5-poster')?.getAttribute('aria-label') || '';
    return { pass: cols === 2 && /^\d+:\d\d$/.test(length || '') && kind && !/\d:\d/.test(shape) && label.includes(length), detail: { cols, length, kind, shape, label } };
  },
  async 'track headers show what each track holds, and the ruler has small ticks'() {
    await freshEditor(); await wait(200);
    const icons = $$('#vt-tracks .vt-row').filter(r => r.dataset.trackId).map(r => [r.dataset.trackId, r.querySelector('.v23-track-icon svg')?.dataset.lucide || r.querySelector('.v23-track-icon svg')?.getAttribute('class')]);
    const minor = $('#vt-tracks .vt-ruler').style.getPropertyValue('--v23-minor');
    return { pass: icons.length >= 2 && icons.every(([, i]) => !!i) && /%$/.test(minor) && parseFloat(minor) > 0, detail: { icons, minor } };
  },
  async 'the preview zoom menu lists Fit once'() {
    await freshEditor(); const sel = $('#v16-zoom'), shown = [...sel.options].filter(o => !o.hidden).map(o => o.textContent);
    return { pass: shown.filter(t => /^Fit/.test(t)).length === 1 && sel.selectedOptions[0].textContent === 'Fit', detail: { shown, current: sel.selectedOptions[0].textContent } };
  },
  async 'playback bar: a round play button, and the view controls as one group inside the bar'() {
    await freshEditor(); const play = $('#ed-play').getBoundingClientRect(), views = $('.v23-views'), bar = $('.ed-transport').getBoundingClientRect();
    const inside = $$('.ed-transport button, .ed-transport select').filter(b => b.offsetParent).every(b => { const r = b.getBoundingClientRect(); return r.left >= bar.left - 1 && r.right <= bar.right + 1; });
    const grouped = ['ed-frame', 'v11-guides', 'v10-large', 'v10-keys'].every(id => $('#' + id)?.parentElement === views);
    return { pass: Math.round(play.width) === 40 && Math.round(play.height) === 40 && grouped && $('#v10-mute').parentElement !== views && inside, detail: { play: [play.width, play.height], grouped, inside } };
  },
  async 'Home: a compact hero and one row of start cards'() {
    $('.v-nav [data-route=home]').click(); await wait(400);
    const hero = $('.office-hero').getBoundingClientRect().height, grid = $('#v-content .flow-start-grid'), cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length, cards = grid.children.length;
    const h1 = $('.office-hero h1').textContent;
    return { pass: hero <= 230 && (innerWidth <= 900 || cols === cards) && !/\S<br>|shareclear/.test(h1), detail: { hero: Math.round(hero), cols, cards, h1 } };
  },
  async 'no black edges in dark mode, and the window never scrolls sideways'() {
    await setTheme('dark'); await freshEditor(); await wait(200);
    const row = getComputedStyle($('#vt-tracks .vt-row[data-track-id="video-main"]')).boxShadow, wide = document.documentElement.scrollWidth - innerWidth;
    await setTheme('light');
    return { pass: !/rgb\(0, 0, 0\) 0px 1px/.test(row) && wide <= 0, detail: { row, wide } };
  },
});

// Phase 24: copy / paste settings, keyframes for video layers, the volume line on audio blocks.
const altKey = code => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: code === 'KeyC' ? 'ç' : '√', code, metaKey: true, altKey: true, bubbles: true }));
const partsShown = () => $$('#v24-paste [data-part]').map(n => n.dataset.part + (n.checked ? '+' : '') + (n.disabled ? '!' : ''));
const tick = (part, on) => { const n = $('#v24-paste [data-part=' + part + ']'); if (n.checked !== on) n.click(); };
async function withLayers() {
  await freshEditor();
  const v = E().get().assets.find(x => x.kind === 'video').id;
  E().patch({ overlays: [{ id: 'L1', asset: v, name: 'Layer one', start: 1, end: 9, sourceIn: 0, x: 50, y: 50, scale: 30 }, { id: 'L2', asset: v, name: 'Layer two', start: 10, end: 14, sourceIn: 3, x: 20, y: 20, scale: 50, shape: 'circle' }] });
  await wait(250); E().selectOverlay('L1'); await wait(250);
}
const layerDiamond = p => $('#ed-panel .v17-diamond[data-prop=' + p + ']');
Object.assign(checks, {
  async '⌥⌘C / ⌥⌘V copy a clip’s settings and paste the chosen ones onto another clip'() {
    await freshEditor(); await selectClip(0); await setRange('v15-scale', 120); await setRange('v15-crop-l', 10);
    altKey('KeyC'); await wait(150); await selectClip(1); altKey('KeyV'); await wait(250);
    const shown = partsShown(); tick('crop', false); $('#v24-apply').click(); await wait(300);
    const c = E().get().clips[1], msg = $('#ed-status').textContent;
    return { pass: shown.includes('transform+') && shown.includes('crop+') && shown.includes('speed!') && shown.includes('audio!') && c.transform?.scale === 120 && !c.crop && /Pasted position onto 1 clip/.test(msg), detail: { shown, transform: c.transform, crop: c.crop, msg } };
  },
  async 'pasted keyframes start where the other clip starts; ones past its end are left out'() {
    await animatedScale(); await selectClip(0); E().copySettings(); await selectClip(1); E().pasteSettings(); await wait(250);
    for (const n of $$('#v24-paste [data-part]')) if (!n.disabled && n.checked !== (n.dataset.part === 'animation')) n.click();
    $('#v24-apply').click(); await wait(300);
    const keys = (E().get().clips[1].keyframes?.scale || []).map(k => [k.t, k.v]), msg = $('#ed-status').textContent;
    return { pass: JSON.stringify(keys) === '[[2,100]]' && /1 keyframe fell past the end of a shorter clip and was left out/.test(msg), detail: { keys, msg } };
  },
  async 'right-click and the panel offer Copy settings and Paste settings'() {
    await withLayers(); E().copySettings(); await selectClip(0); const panelRow = !!$('#ed-panel .v24-copy-row #v24-copy'), pasteOff = $('#v24-paste-btn')?.disabled; // layer settings don't paste onto a clip
    E().copySettings(); await selectClip(1); const pasteOn = $('#v24-paste-btn')?.disabled === false;
    const b = block('video', E().get().clips[1].id), r = b.getBoundingClientRect(); b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10 })); await wait(200);
    const menu = $$('#v7-context button').map(x => x.textContent); $('#v7-context')?.remove();
    E().shortcuts(); await wait(150); const keys = $('#v-dialog-body').textContent.includes('⌥⌘C'); await closeDialog();
    return { pass: panelRow && pasteOff && pasteOn && menu.includes('Copy settings') && menu.includes('Paste settings…') && keys, detail: { panelRow, pasteOff, pasteOn, menu, keys } };
  },
  async 'a video layer animates its position, size and opacity with the same diamonds'() {
    await withLayers(); const labels = ['x', 'y', 'scale', 'opacity'].map(p => !!layerDiamond(p));
    E().jump(2); await wait(120); const off = layerDiamond('x').dataset.state; layerDiamond('x').click(); await wait(200);
    E().jump(6); await wait(150); await setRange('v24-x', 80); E().jump(4); await wait(200);
    const o = E().get().overlays.find(x => x.id === 'L1'), keys = (o.keyframes?.x || []).map(k => [k.t, k.v]), left = $('.v6-overlay[data-track="L1"]').style.left, lane = $$('.v24-lane .v17-tlkey').length;
    E().jump(0.5); await wait(150); const outside = layerDiamond('scale').disabled;
    return { pass: labels.every(Boolean) && off === 'off' && JSON.stringify(keys) === '[[1,50],[5,80]]' && left === '65%' && lane === 2 && outside, detail: { labels, off, keys, left, lane, outside } };
  },
  async 'dragging an animated layer sets a keyframe; choosing a corner ends the position animation'() {
    await withLayers(); E().jump(2); await wait(120); layerDiamond('x').click(); await wait(200);
    E().jump(6); await wait(150); E().moveLayer('L1', { x: 70, y: 40 }); await wait(200);
    const o = E().get().overlays.find(x => x.id === 'L1'), keys = o.keyframes.x.map(k => [k.t, k.v]), y = o.y;
    $$('#ed-panel [data-v12-corner]').find(b => b.dataset.v12Corner === 'tl').click(); await wait(250);
    const p = E().get().overlays.find(x => x.id === 'L1');
    return { pass: JSON.stringify(keys) === '[[1,50],[5,70]]' && y === 40 && p.corner === 'tl' && !p.keyframes?.x && /no longer animated/.test($('#ed-status').textContent), detail: { keys, y, corner: p.corner, after: p.keyframes } };
  },
  async 'layer settings paste onto layers, and not onto clips'() {
    await withLayers(); E().copySettings(); E().selectOverlay('L2'); await wait(250); E().pasteSettings(); await wait(250);
    const shown = partsShown(); $('#v24-apply').click(); await wait(300);
    const l2 = E().get().overlays.find(x => x.id === 'L2');
    await selectClip(0); E().pasteSettings(); await wait(200); const refused = !$('#v24-paste') && /Layer settings paste onto layers/.test($('#ed-status').textContent);
    return { pass: shown.includes('place+') && shown.includes('look+') && l2.scale === 30 && l2.x === 50 && !l2.shape && refused, detail: { shown, l2: { scale: l2.scale, x: l2.x, shape: l2.shape }, refused } };
  },
  async 'the volume line on an audio block: drag to set the volume, double-click for 100%, undo'() {
    await freshEditor(); await wait(200);
    const line = $('.vt-item-source .v24-vol'), b = line.closest('.vt-block'), r = line.getBoundingClientRect(), x = r.left + 30, y = r.top + r.height / 2, h = b.clientHeight - 8;
    const at = (r.top + r.height / 2 - b.getBoundingClientRect().top) / b.clientHeight;
    line.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 5 }));
    line.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y + h / 150 * 40, pointerId: 5 }));
    line.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 5 })); await wait(250);
    const dragged = E().get().clips[0].volume, label = $('.vt-item-source .v24-vol')?.getAttribute('aria-label');
    E().undo(); await wait(200); const undone = E().get().clips[0].volume ?? 100;
    $('.vt-item-source .v24-vol').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await wait(200);
    $('.vt-item-source .v24-vol').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); await wait(200);
    const keyed = E().get().clips[0].volume;
    return { pass: Math.abs(at - .36) < .1 && dragged === 60 && label === 'Volume 60%' && undone === 100 && keyed === 105, detail: { at, dragged, label, undone, keyed } };
  },
});

// Phase 25: blur regions and solid covers are plain boxes; the zoom menu is narrow; the Media tab is called Main.
const boxEl = id => $('.ed-layer[data-id="' + id + '"]');
async function dragBox(target, dx, dy, id) {
  const r = target.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, base = { bubbles: true, pointerId: 11, button: 0 };
  target.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: x, clientY: y }));
  for (let i = 1; i <= 5; i++) boxEl(id).dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: x + dx * i / 5, clientY: y + dy * i / 5 }));
  boxEl(id).dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: x + dx, clientY: y + dy })); await wait(250);
}
async function newBox(kind) { await freshEditor(); tab('effects').click(); await wait(200); panelButton(kind === 'blur' ? /Blur region/ : /Solid cover/).click(); await wait(350); return E().get().elements.at(-1).id; }
Object.assign(checks, {
  async 'a blur region is a box with no text, eight handles and a tag only while selected'() {
    const id = await newBox('blur'), e = E().get().elements[0], el = boxEl(id), c = $('#ed-canvas').getBoundingClientRect(), r = el.getBoundingClientRect();
    const size = [+(r.width / c.width * 100).toFixed(0), +(r.height / c.height * 100).toFixed(0)], handles = el.querySelectorAll('.v25-handle').length, tag = el.querySelector('.v25-tag')?.textContent;
    const ownText = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('');
    E().open('media'); await wait(300); const shown = n => !!n && getComputedStyle(n).display !== 'none', after = { tag: shown(boxEl(id).querySelector('.v25-tag')), handles: [...boxEl(id).querySelectorAll('.v25-handle')].filter(shown).length };
    return { pass: e.w === 30 && e.h === 22 && e.text === undefined && JSON.stringify(size) === '[30,22]' && handles === 8 && tag === 'Blur' && !ownText && !after.tag && !after.handles, detail: { e: { w: e.w, h: e.h, text: e.text }, size, handles, tag, ownText, after } };
  },
  async 'a box resizes from its edges and corners, and a click does not move it'() {
    const id = await newBox('cover'), c = $('#ed-canvas').getBoundingClientRect();
    await dragBox(boxEl(id), 0, 0, id); const click = E().get().elements[0];
    await dragBox(boxEl(id).querySelector('.v25-handle[data-dir=s]'), 0, c.height * .1, id); const s = E().get().elements[0];
    await dragBox(boxEl(id).querySelector('.v25-handle[data-dir=nw]'), -c.width * .1, -c.height * .1, id); const nw = E().get().elements[0];
    return { pass: click.x === 50 && click.y === 50 && s.h === 32 && s.w === 30 && s.y === 55 && nw.w === 40 && nw.h === 42 && nw.x === 45 && nw.y === 50, detail: { click: [click.x, click.y], s: [s.w, s.h, s.y], nw: [nw.w, nw.h, nw.x, nw.y] } };
  },
  async 'a box moves from where it is grabbed, right up to the frame edge, and the panel follows'() {
    const id = await newBox('blur'), c = $('#ed-canvas').getBoundingClientRect();
    await dragBox(boxEl(id), -c.width, -c.height, id); const corner = E().get().elements[0];
    await dragBox(boxEl(id), c.width * .03, 0, id); const nudge = E().get().elements[0];
    return { pass: corner.x === 15 && corner.y === 11 && nudge.x === 18 && +$('#v25-x').value === 18 && +$('#v25-y').value === 11, detail: { corner: [corner.x, corner.y], nudge: [nudge.x, nudge.y], panel: [$('#v25-x').value, $('#v25-y').value] } };
  },
  async 'the box panel: position, size, strength and timing; old boxes keep their size'() {
    await newBox('blur'); const labels = $$('#ed-panel label').map(l => l.textContent.trim().replace(/[\d.\s]+$/, '')), strength = +$('#v25-strength').value;
    await setNum('Height', 50); const h = E().get().elements[0].h, noText = !$('#ed-text') && !$('#ed-font') && !$('#ed-animation');
    await freshEditor(); E().patch({ elements: [{ id: 'legacy', kind: 'cover', text: 'Hidden detail', font: 'Graphik', size: 20, colour: '#fff', x: 50, y: 50, width: 40, start: 0, end: 5, animation: 'fade' }] }); await wait(300);
    const old = E().get().elements[0], r = boxEl('legacy').getBoundingClientRect(), c = $('#ed-canvas').getBoundingClientRect();
    return { pass: ['Position X %', 'Position Y %', 'Width %', 'Height %', 'Strength', 'Start (s)', 'End (s)'].every(l => labels.includes(l)) && strength === 1.5 && h === 50 && noText && old.w === 40 && Math.abs(old.h - 13.1) < .2 && Math.abs(r.height / c.height * 100 - old.h) < .5 && !old.text && old.animation === 'none', detail: { labels, strength, h, noText, old: { w: old.w, h: old.h, text: old.text, animation: old.animation } } };
  },
  async 'the zoom menu is narrow and the first tab is called Main'() {
    await freshEditor(); const w = $('#v16-zoom').getBoundingClientRect().width, t = $('.ed-tabs [data-panel=media]'), icon = t.querySelector('svg')?.getAttribute('class') || '';
    return { pass: w <= 80 && t.textContent.trim() === 'Main' && /layout-dashboard/.test(icon), detail: { w, text: t.textContent.trim(), icon } };
  },
});

export const count = () => Object.keys(checks).length;
export async function run(only) {
  const results = [];
  const errors = []; const onError = e => errors.push(e.message || String(e.reason)); window.addEventListener('error', onError); window.addEventListener('unhandledrejection', onError);
  // only: a name substring, or [from, to] indexes to run the suite in batches.
  for (const [i, [name, fn]] of Object.entries(checks).entries()) {
    if (Array.isArray(only) ? (i < only[0] || i >= only[1]) : (only && !name.includes(only))) continue;
    try { const r = await fn(); results.push({ name, pass: !!r.pass, detail: r.detail }); }
    catch (e) { results.push({ name, pass: false, detail: 'threw: ' + e.message }); }
  }
  window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onError);
  return { passed: results.filter(r => r.pass).length, total: results.length, failed: results.filter(r => !r.pass), pageErrors: errors };
}
