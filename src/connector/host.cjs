'use strict';
// Main-process side of the connector: what needs the file system or a render before the request is
// handed to the editor window. Reading files stays here so the rules about which folders an assistant
// may read are enforced in one place.
const fs = require('node:fs/promises'), path = require('node:path'), { randomUUID } = require('node:crypto');
const MEDIA = /\.(mp4|mov|m4v|webm|mkv|avi|mpg|mpeg|wmv|flv|3gp|mts|m2ts|ts|ogv|mp3|wav|m4a|aac|ogg|flac|aif|aiff|opus|wma|png|jpe?g|webp|gif|tiff?|avif|heic)$/i;
const kindOf = name => /\.(png|jpe?g|webp|gif|tiff?|avif|heic)$/i.test(name) ? 'image' : /\.(mp3|wav|m4a|aac|ogg|flac|aif|aiff|opus|wma)$/i.test(name) ? 'audio' : 'video';
const SETTINGS = 'The person can allow a folder in Video Visor → Settings → Connect an AI assistant.';

function createHost({ window: getWindow, root, register, job, exportProject, log = () => {} }) {
  // Asks the editor window to run a command. The window answers {ok, result} or {ok:false, error}.
  async function editor(name, args) {
    const win = getWindow(); if (!win || win.isDestroyed()) throw Error('The Video Visor window is not open.');
    const answer = await win.webContents.executeJavaScript(`window.visorCommands?window.visorCommands.run(${JSON.stringify(name)},${JSON.stringify(args)}):({ok:false,error:'Video Visor is still starting. Try again in a moment.'})`, true);
    if (!answer?.ok) throw Error(answer?.error || 'Video Visor could not do that.');
    return answer.result;
  }
  const real = file => fs.realpath(file).catch(() => null);
  async function allowed(file, folders, what = 'file') {
    if (typeof file !== 'string' || !path.isAbsolute(file)) throw Error(`Give the full path of the ${what}, starting with "/".`);
    const target = await real(file); if (!target) throw Error(`There is no ${what} at ${file}.`);
    for (const folder of folders) { const base = await real(folder); if (base && (target === base || target.startsWith(base + path.sep))) return target; }
    throw Error(`"${file}" is outside the folders Video Visor may read. ${folders.length ? 'Allowed: ' + folders.join(', ') + '.' : 'No folder is allowed yet.'} ${SETTINGS}`);
  }
  async function assets(files, folders) {
    const targets = []; for (const file of files) targets.push(await allowed(file, folders)); // every path is checked before anything is read
    const out = [], problems = [];
    for (const [i, target] of targets.entries()) { try { out.push(await register(target)); } catch (e) { problems.push(path.basename(files[i]) + ': ' + e.message); } }
    if (problems.length) throw Error('Some files could not be read. ' + problems.join(' '));
    return out;
  }
  async function listMedia(args, folders) {
    if (!args.folder) return { data: { allowed_folders: folders, note: folders.length ? 'Call list_media with one of these folders to see its files.' : 'No folder is allowed yet. ' + SETTINGS } };
    const folder = await allowed(args.folder, folders, 'folder');
    if (!(await fs.stat(folder)).isDirectory()) throw Error(`${args.folder} is a file, not a folder.`);
    const entries = await fs.readdir(folder, { withFileTypes: true }), files = [], subfolders = [];
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) { subfolders.push(e.name); continue; }
      if (!e.isFile() || !MEDIA.test(e.name)) continue;
      const stat = await fs.stat(path.join(folder, e.name)).catch(() => null); if (!stat) continue;
      files.push({ path: path.join(folder, e.name), name: e.name, kind: kindOf(e.name), size_mb: Math.round(stat.size / 1048576 * 10) / 10, modified: stat.mtime.toISOString() });
    }
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { data: { folder, files: files.slice(0, 300), ...(files.length > 300 ? { note: 'Only the first 300 files are listed.' } : {}), subfolders: subfolders.sort().slice(0, 100) } };
  }
  async function frame(args) {
    const { state, name, speed } = await editor('_state', { project_id: args.project_id, time: args.time });
    const file = path.join(root, 'frame-' + randomUUID() + '.png');
    try {
      await job(() => exportProject(state, { format: 'Frame', resolution: '720p', time: args.time * (speed || 1), captions: 'Burn into video' }, async () => file));
      const sharp = require('sharp'); sharp.cache(false); /* 0.15 (Win-fix 3): no libvips file cache (it held files open) */ const image = await sharp(file).resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
      return { text: `Frame at ${args.time} s of "${name}".`, image: { data: image.toString('base64'), mimeType: 'image/jpeg' } };
    } finally { await fs.unlink(file).catch(() => {}); }
  }
  // One entry point for every tool. `context.folders` are the folders the person allowed.
  async function execute(name, args, context) {
    try {
      if (name === 'list_media') return await listMedia(args, context.folders);
      if (name === 'get_frame') return await frame(args);
      if (name === 'create_draft' || name === 'import_media') { const { files, ...rest } = args; return { data: await editor(name, { ...rest, assets: await assets(files, context.folders) }) }; }
      if (name === 'add_camera') { const { file, ...rest } = args; return { data: await editor(name, { ...rest, asset: (await assets([file], context.folders))[0] }) }; }
      return { data: await editor(name, args) };
    } catch (e) {
      if (/A task is already running/.test(e?.message || '')) throw Error('Video Visor is busy with another task (for example a render or a transcription). Try again in a moment.');
      throw e;
    }
  }
  return { execute, editor, allowed, listMedia };
}

// Entry for Claude Desktop's config file: it starts the bridge with the app's own runtime.
function claudeEntry({ execPath, bridge, connectionFile }) { return { command: execPath, args: [bridge, '--connection', connectionFile], env: { ELECTRON_RUN_AS_NODE: '1' } }; }
// Adds (or refreshes) the Video Visor entry in Claude Desktop's config, keeping everything else in the
// file and saving a copy of the previous file first. Refuses to touch a file it cannot read as JSON.
async function installClaude(configFile, entry) {
  let config = {}, previous = null;
  try { previous = await fs.readFile(configFile, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (previous !== null && previous.trim()) {
    try { config = JSON.parse(previous); } catch { throw Error('Claude Desktop\'s settings file could not be read, so it was left untouched. Use "Show manual setup" instead.'); }
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('Claude Desktop\'s settings file has an unexpected shape, so it was left untouched. Use "Show manual setup" instead.');
  }
  if (config.mcpServers !== undefined && (typeof config.mcpServers !== 'object' || config.mcpServers === null || Array.isArray(config.mcpServers))) throw Error('Claude Desktop\'s settings file has an unexpected shape, so it was left untouched. Use "Show manual setup" instead.');
  const next = { ...config, mcpServers: { ...(config.mcpServers || {}), 'video-visor': entry } };
  let backup = null;
  if (previous !== null) { backup = configFile + '.before-video-visor-' + Date.now(); await fs.writeFile(backup, previous, { flag: 'wx' }); }
  await fs.mkdir(path.dirname(configFile), { recursive: true });
  const temp = configFile + '.' + randomUUID() + '.tmp';
  try { await fs.writeFile(temp, JSON.stringify(next, null, 2) + '\n'); await fs.rename(temp, configFile); } finally { await fs.unlink(temp).catch(() => {}); }
  return { file: configFile, backup };
}
module.exports = { createHost, claudeEntry, installClaude };
