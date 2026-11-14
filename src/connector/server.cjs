'use strict';
// The connector: a small server inside the running app that an AI assistant can talk to.
// It listens on this Mac only (127.0.0.1), is off until switched on in Settings, and every request
// needs the access key. Two doors, same rules:
//   POST /mcp     standard MCP "Streamable HTTP", for apps that can connect to a local address
//   POST /bridge  plain JSON-RPC from our own stdio bridge (bridge.cjs), which Claude Desktop launches
const http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const { createProtocol, headerProblem } = require('./protocol.cjs');
const catalog = require('./tools.cjs');
const DEFAULTS = { enabled: false, token: '', port: 0, permissions: { read: true, edit: true, render: true }, folders: [] };
const LIMIT = { body: 1 << 20, callsPerMinute: 240 };

function createConnector({ file, connectionFile, version, execute, log = () => {} }) {
  let settings = { ...DEFAULTS, permissions: { ...DEFAULTS.permissions } }, server = null, port = 0, problem = '', recent = [], calls = [];
  const newToken = () => crypto.randomBytes(32).toString('base64url');
  const allowed = () => settings.permissions;
  const protocol = createProtocol({
    name: 'video-visor', version, instructions: catalog.instructions,
    listTools: () => catalog.visible(allowed()),
    callTool: async (name, args) => {
      const checked = catalog.check(name, args), entry = { at: Date.now(), tool: name, ok: false };
      if (checked.unknown) return { unknown: true };
      recent.unshift(entry); recent = recent.slice(0, 30);
      const text = (t, isError = false) => ({ content: [{ type: 'text', text: t }], isError });
      if (!allowed()[checked.tool.permission]) return text(`"${name}" is switched off. In Video Visor, open Settings → Connect an AI assistant and allow "${catalog.permissions.find(p => p[0] === checked.tool.permission)[1]}".`, true);
      if (checked.problem) return text('That request was not understood: ' + checked.problem + '. Nothing was changed.', true);
      const now = Date.now(); calls = calls.filter(t => now - t < 60000); if (calls.length >= LIMIT.callsPerMinute) return text('Too many requests in one minute. Wait a moment and try again.', true); calls.push(now);
      try {
        const result = await execute(name, checked.args, { folders: settings.folders.slice() });
        entry.ok = true;
        const content = [{ type: 'text', text: typeof result.text === 'string' ? result.text : JSON.stringify(result.data ?? result, null, 1) }];
        if (result.image) content.push({ type: 'image', data: result.image.data, mimeType: result.image.mimeType });
        return { content, isError: false, ...(result.data !== undefined && result.data !== null && typeof result.data === 'object' ? { structuredContent: result.data } : {}) };
      } catch (e) {
        const message = String(e?.message || e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '').replace(/^Error: /, '');
        log('tool ' + name + ': ' + message); entry.error = message.slice(0, 200);
        return text(message + (/Nothing was changed/.test(message) ? '' : ' Nothing was changed.'), true);
      }
    }
  });

  const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  function send(res, status, body, headers = {}) {
    const text = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store', ...headers }); res.end(text);
  }
  async function onRequest(req, res) {
    try {
      // A web page must never reach this server: browsers always say where a request comes from (Origin),
      // and a page that re-points its own address at this Mac shows up with the wrong Host.
      if (req.headers.origin !== undefined) return send(res, 403, { jsonrpc: '2.0', error: { code: -32600, message: 'Requests from web pages are refused.' } });
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return send(res, 403, { jsonrpc: '2.0', error: { code: -32600, message: 'Unexpected Host header.' } });
      const url = req.url.split('?')[0];
      if (url !== '/mcp' && url !== '/bridge') return send(res, 404, { jsonrpc: '2.0', error: { code: -32601, message: 'Not found.' } });
      if (req.method !== 'POST') return send(res, 405, undefined, { Allow: 'POST' });
      const auth = /^Bearer (.+)$/.exec(req.headers.authorization || '');
      if (!auth || !same(auth[1], settings.token)) return send(res, 401, { jsonrpc: '2.0', error: { code: -32600, message: 'Missing or wrong access key.' } }, { 'WWW-Authenticate': 'Bearer' });
      if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return send(res, 415, { jsonrpc: '2.0', error: { code: -32600, message: 'Send application/json.' } });
      // An oversized body is read to its end (and thrown away) so the refusal can be delivered; far beyond
      // the limit the connection is simply dropped.
      const body = await new Promise((resolve, reject) => { const chunks = []; let size = 0; req.on('data', c => { size += c.length; if (size > LIMIT.body * 16) return req.destroy(); if (size > LIMIT.body) chunks.length = 0; else chunks.push(c); }); req.on('end', () => resolve(size > LIMIT.body ? null : Buffer.concat(chunks))); req.on('error', reject); req.on('close', () => resolve(null)); });
      if (!body) return send(res, 413, { jsonrpc: '2.0', error: { code: -32600, message: 'Request too large.' } }, { Connection: 'close' });
      let message; try { message = JSON.parse(body.toString('utf8')); } catch { return send(res, 400, { jsonrpc: '2.0', error: { code: -32700, message: 'The request is not valid JSON.' } }); }
      if (url === '/mcp') { const mismatch = headerProblem(message, req.headers); if (mismatch) return send(res, 400, { jsonrpc: '2.0', id: message.id, error: mismatch }); }
      const { status, response } = await protocol.handle(message);
      send(res, url === '/bridge' && response ? 200 : status, response);
    } catch (e) { log('request: ' + (e?.message || e)); if (!res.headersSent) send(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Video Visor could not answer.' } }); else res.end(); }
  }
  async function save() { await fs.writeFile(file, JSON.stringify(settings, null, 1), { mode: 0o600 }); }
  async function stop() {
    await fs.unlink(connectionFile).catch(() => {});
    if (!server) return; const s = server; server = null; port = 0;
    await new Promise(resolve => { s.close(() => resolve()); s.closeAllConnections?.(); });
  }
  async function start() {
    await stop(); problem = '';
    const listen = wanted => new Promise((resolve, reject) => { const s = http.createServer(onRequest); s.once('error', reject); s.listen(wanted, '127.0.0.1', () => { s.off('error', reject); resolve(s); }); });
    try { server = await listen(settings.port || 0).catch(e => { if (e.code === 'EADDRINUSE' && settings.port) return listen(0); throw e; }); }
    catch (e) { problem = 'The connector could not start: ' + e.message; log(problem); return; }
    server.requestTimeout = 0; server.headersTimeout = 20000; server.timeout = 0; // tool calls such as transcription can take minutes
    port = server.address().port; if (settings.port !== port) { settings.port = port; await save(); }
    // The bridge finds the running app through this file. It is readable by this user only.
    await fs.writeFile(connectionFile, JSON.stringify({ port, token: settings.token, version, pid: process.pid }), { mode: 0o600 });
    await fs.chmod(connectionFile, 0o600).catch(() => {});
  }
  return {
    async load() {
      try { const saved = JSON.parse(await fs.readFile(file, 'utf8')); settings = { ...DEFAULTS, ...saved, permissions: { ...DEFAULTS.permissions, ...(saved.permissions || {}) }, folders: Array.isArray(saved.folders) ? saved.folders.filter(f => typeof f === 'string' && path.isAbsolute(f)).slice(0, 20) : [] }; } catch { }
      if (!settings.token) { settings.token = newToken(); await save().catch(() => {}); }
      if (settings.enabled) await start(); else await fs.unlink(connectionFile).catch(() => {});
    },
    state: () => ({ enabled: settings.enabled, running: !!server, port, problem, permissions: { ...settings.permissions }, folders: settings.folders.slice(), token: settings.token, url: server ? `http://127.0.0.1:${port}/mcp` : '', recent: recent.slice(0, 12), tools: catalog.tools.length }),
    async update(change = {}) {
      if (typeof change.enabled === 'boolean') settings.enabled = change.enabled;
      if (change.permissions && typeof change.permissions === 'object') for (const [key] of catalog.permissions) if (typeof change.permissions[key] === 'boolean') settings.permissions[key] = change.permissions[key];
      if (Array.isArray(change.folders)) settings.folders = [...new Set(change.folders.filter(f => typeof f === 'string' && path.isAbsolute(f)))].slice(0, 20);
      if (change.newToken) settings.token = newToken();
      await save();
      if (settings.enabled && (!server || change.newToken || typeof change.enabled === 'boolean')) await start(); else if (!settings.enabled) await stop();
      return this.state();
    },
    stop, folders: () => settings.folders.slice(), protocol
  };
}
module.exports = { createConnector };
