'use strict';
// Video Visor connector bridge.
// An assistant app such as Claude Desktop starts this small program and talks to it over standard
// input/output (the MCP "stdio" transport: one JSON message per line). The bridge passes each message to
// the running Video Visor app on this Mac and returns the answer. It holds no projects and no secrets of
// its own: the address and access key of the running app are read from a file only this user can read.
//
// Run by the app's own runtime:  ELECTRON_RUN_AS_NODE=1 "<Video Visor>" bridge.cjs --connection <file>
// If the app is closed or the connector is switched off, the bridge still lists the tools and answers
// tool calls with a plain message saying what to do.
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), readline = require('node:readline');
const { createProtocol } = require('./protocol.cjs'), catalog = require('./tools.cjs');
const at = process.argv.indexOf('--connection');
const connectionFile = at > 0 && process.argv[at + 1] ? process.argv[at + 1] : path.join(process.env.HOME || '', 'Library/Application Support/Video Visor/connector.json');
const CLOSED = 'Video Visor is not reachable. Open the Video Visor app, switch on Settings → Connect an AI assistant, then try again.';

const offline = createProtocol({
  name: 'video-visor', version: 'bridge', instructions: catalog.instructions,
  listTools: () => catalog.visible(null),
  callTool: async name => catalog.check(name).unknown ? { unknown: true } : { content: [{ type: 'text', text: CLOSED }], isError: true }
});
function forward(message) {
  return new Promise((resolve, reject) => {
    let connection; try { connection = JSON.parse(fs.readFileSync(connectionFile, 'utf8')); } catch { return reject(Error('closed')); }
    const body = Buffer.from(JSON.stringify(message));
    const req = http.request({ host: '127.0.0.1', port: connection.port, path: '/bridge', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': body.length, Authorization: 'Bearer ' + connection.token } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('error', reject);
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); if (res.statusCode === 202 || !text) return resolve(null); if (res.statusCode === 401) return reject(Error('closed')); try { resolve(JSON.parse(text)); } catch { reject(Error('bad answer')); } });
    });
    req.on('error', () => reject(Error('closed'))); req.end(body);
  });
}
const write = message => { if (message) process.stdout.write(JSON.stringify(message) + '\n'); };
async function answer(line) {
  let message; try { message = JSON.parse(line); } catch { return write({ jsonrpc: '2.0', error: { code: -32700, message: 'Not valid JSON.' } }); }
  try { write(await forward(message)); }
  catch { write((await offline.handle(message)).response); }
}
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let pending = 0, ended = false;
const maybeExit = () => { if (ended && !pending) process.exit(0); };
input.on('line', line => { if (!line.trim()) return; pending++; answer(line).catch(e => process.stderr.write('bridge: ' + (e?.message || e) + '\n')).finally(() => { pending--; maybeExit(); }); });
// The client closes our input to end the session; finish what is in flight, then leave.
input.on('close', () => { ended = true; maybeExit(); });
process.stdout.on('error', () => process.exit(0));
