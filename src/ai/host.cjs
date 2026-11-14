'use strict';
// Main-process side of "Draft with AI": settings, keys, and the three steps the dialog walks through.
//   1. pick     the person chooses clips in the system file dialog (or names an existing project)
//   2. prepare  a draft project is made and transcribed on this Mac; nothing has been sent yet.
//               The result is exactly what would be sent, for the person to read.
//   3. run      only now is anything sent to the AI service
const fs = require('node:fs/promises'), { randomUUID } = require('node:crypto');
const providers = require('./providers.cjs'), draft = require('./draft.cjs');

function createAiHost({ keys, settingsFile, editor, execute, register, dialog, window: getWindow, log = () => {} }) {
  let settings = { provider: 'anthropic', models: {} }, active = null;
  const picked = new Map(), prepared = new Map();
  const save = () => fs.writeFile(settingsFile, JSON.stringify(settings, null, 1), { mode: 0o600 });
  const modelOf = id => settings.models[id] || providers.get(id).defaultModel || '';
  // Text that is safe to show: the adapter's own plain message, or a general one. Never the raw error,
  // which may quote request headers.
  const explain = (e, service) => { log('ai: ' + String(e?.plain || e?.message || e).slice(0, 300)); return Error(e?.plain || `${service.company} could not be reached. Check your internet connection and try again.`); };
  function adapter(id = settings.provider) {
    const service = providers.get(id); if (!service.factory) throw Error(`${service.name} is not available in this build.`);
    const apiKey = keys.get(id); if (!apiKey) throw Error(`Add your ${service.company} API key in Settings → Draft with AI first.`);
    const model = modelOf(id); if (!model) throw Error(`Choose a ${service.company} model in Settings → Draft with AI first.`);
    return { service, model, client: service.factory({ apiKey, model }) };
  }
  const state = () => { const k = keys.status(); return { provider: settings.provider, keychain: k.keychain, busy: !!active, services: providers.list().map(s => ({ ...s, ...k.keys[s.id], model: modelOf(s.id) })) }; };
  const plainSpeechless = e => /no speech|nothing on the timeline has sound/i.test(String(e?.message || ''));
  return {
    async load() { try { const data = JSON.parse(await fs.readFile(settingsFile, 'utf8')); settings = { provider: providers.list().some(s => s.id === data.provider) ? data.provider : 'anthropic', models: data.models && typeof data.models === 'object' ? Object.fromEntries(Object.entries(data.models).filter(([k, v]) => providers.list().some(s => s.id === k) && typeof v === 'string' && v.length < 120)) : {} }; } catch { } await keys.load(); },
    state,
    async choose(id) { providers.get(id); settings.provider = id; await save(); return state(); },
    async setModel(id, model) { providers.get(id); if (typeof model !== 'string' || !/^[\w.:\-/]{1,120}$/.test(model)) throw Error('That is not a model name.'); settings.models[id] = model; await save(); return state(); },
    async saveKey(id, key, remember) { const r = await keys.save(id, key, remember !== false); return { ...state(), kept: r.kept }; },
    async clearKey(id) { await keys.clear(id); return state(); },
    // Lists the models the saved key can use. Doubles as the "is this key right?" check.
    async models(id) { const a = adapter(id); try { return await a.client.models(); } catch (e) { throw explain(e, a.service); } },
    async pick() {
      const win = getWindow(), r = await dialog.showOpenDialog(win, { title: 'Choose the clips for this draft', buttonLabel: 'Use these clips', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video, images and sound', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'png', 'jpg', 'jpeg', 'webp', 'heic', 'mp3', 'wav', 'm4a', 'aac'] }] });
      if (r.canceled || !r.filePaths.length) return null;
      const assets = [], problems = [];
      for (const file of r.filePaths.slice(0, 40)) { try { assets.push(await register(file)); } catch (e) { problems.push(file.slice(file.lastIndexOf('/') + 1) + ': ' + e.message); } }
      if (!assets.some(a => a.kind === 'video' || a.kind === 'image')) throw Error(problems.length ? 'None of those files could be used. ' + problems.join(' ') : 'Choose at least one video or image.');
      const id = randomUUID(); picked.clear(); picked.set(id, assets);
      return { pickId: id, files: assets.map(a => ({ name: a.name, kind: a.kind, seconds: Math.round((a.duration || 0) * 10) / 10 })), problems };
    },
    async prepare({ prompt, pickId, projectId, name, allowFrames } = {}) {
      if (active) throw Error('A draft is already being built. Wait for it to finish or stop it.');
      if (typeof prompt !== 'string' || prompt.trim().length < 3) throw Error('Say what the draft should be, in a sentence or two.');
      if (prompt.length > 4000) throw Error('Keep the instruction under 4,000 characters.');
      const a = adapter(); // fails early, before any work, if the key or model is missing
      let id;
      if (pickId) { const assets = picked.get(pickId); if (!assets) throw Error('Choose the clips again.'); id = (await editor('create_draft', { name: String(name || '').trim().slice(0, 60) || 'AI draft', assets })).project_id; picked.delete(pickId); }
      else if (projectId) id = (await editor('duplicate_project', { project_id: projectId, ...(name ? { name: String(name).slice(0, 60) } : {}) })).project_id;
      else throw Error('Choose clips or a project first.');
      try {
        let transcript;
        try { transcript = (await execute('get_transcript', { project_id: id, generate: true }, { folders: [] })).data; }
        catch (e) { if (!plainSpeechless(e)) throw e; transcript = { lines: [], note: 'No speech was found.' }; }
        const { media, project_id, ai_draft, ...summary } = (await execute('get_project', { project_id: id }, { folders: [] })).data; // the media list repeats the clip list; the service has no use for the project's id
        summary.clips = summary.clips.map(({ asset_id, ...clip }) => clip); // internal ids are of no use to the service
        const session = { prompt: prompt.trim(), summary, transcript, allowFrames: !!allowFrames, provider: settings.provider };
        prepared.clear(); prepared.set(id, session);
        return { projectId: id, ...draft.preview({ ...session, provider: a.service.company, model: a.model }) };
      } catch (e) { await editor('_discard', { project_id: id }).catch(() => {}); throw e; }
    },
    async discard(projectId) { if (!prepared.has(projectId)) return false; prepared.delete(projectId); await editor('_discard', { project_id: projectId }).catch(() => {}); return true; },
    async run(projectId) {
      const session = prepared.get(projectId); if (!session) throw Error('Prepare the draft again before sending.');
      if (active) throw Error('A draft is already being built.');
      const a = adapter(session.provider), controller = new AbortController(); active = { controller, projectId }; prepared.delete(projectId);
      const send = s => { const win = getWindow(); if (win && !win.isDestroyed()) win.webContents.send('ai-step', { projectId, ...s }); };
      // 0.15 (DS-05): a session that changed nothing (failed, refused or stopped early) leaves no empty draft behind.
      const looks = new Set(['get_project', 'get_transcript', 'list_presets', 'get_frame']), steps = [], edited = () => steps.some(x => x.ok && !looks.has(x.tool));
      let result;
      try {
        result = await draft.run({ adapter: a.client, execute: (name, args) => execute(name, args, { folders: [] }), projectId, ...session, onStep: x => { steps.push(x); send(x); }, signal: controller.signal });
      } catch (e) { if (!edited()) await editor('_discard', { project_id: projectId }).catch(() => {}); throw explain(e, a.service); } finally { active = null; }
      if (!result.edits) { await editor('_discard', { project_id: result.projectId || projectId }).catch(() => {}); result.removed = true; }
      return result;
    },
    cancel() { active?.controller.abort(); return !!active; }
  };
}
module.exports = { createAiHost };
