'use strict';
// Model Context Protocol (MCP) message handling, shared by the app and the stdio bridge.
//
// Two forms of the protocol are in use and both are answered here:
// - "modern" (revision 2026-07-28): no handshake; every request names its protocol version in
//   params._meta and the server answers each request on its own. server/discover is required.
// - "legacy" (2025-11-25 and earlier): the client opens with an `initialize` handshake.
// Nothing is remembered between requests in either form.
// Spec: https://modelcontextprotocol.io/specification/2026-07-28
const MODERN = ['2026-07-28'], LEGACY = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const KEY = 'io.modelcontextprotocol/';
const CODES = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603, headerMismatch: -32020, unsupportedVersion: -32022 };

function createProtocol({ name, version, instructions, listTools, callTool }) {
  const serverInfo = { name, title: 'Video Visor', version };
  // Returns { status, response }: `status` is the HTTP status to use on the HTTP transport; `response` is
  // the JSON-RPC message to send back (absent for notifications).
  async function handle(message) {
    const reply = (id, error, status) => ({ status, response: { jsonrpc: '2.0', ...(id === undefined ? {} : { id }), error } });
    if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string')
      return reply(undefined, { code: CODES.invalidRequest, message: 'Not a JSON-RPC 2.0 request.' }, 400);
    if (message.id === undefined) return { status: 202 }; // a notification: nothing to answer
    const id = message.id, params = message.params;
    if ((typeof id !== 'string' && typeof id !== 'number') || (params !== undefined && (params === null || typeof params !== 'object' || Array.isArray(params))))
      return reply(undefined, { code: CODES.invalidRequest, message: 'Request id must be a string or number, and params an object.' }, 400);
    const meta = params?._meta, requested = meta && typeof meta === 'object' ? meta[KEY + 'protocolVersion'] : undefined;
    const modern = message.method !== 'initialize' && (requested !== undefined || message.method === 'server/discover');
    const fail = (code, text, data, status = modern ? 400 : 200) => reply(id, { code, message: text, ...(data === undefined ? {} : { data }) }, status);
    const ok = result => ({ status: 200, response: { jsonrpc: '2.0', id, result: modern ? { resultType: 'complete', ...result, _meta: { ...(result._meta || {}), [KEY + 'serverInfo']: serverInfo } } : result } });
    if (modern) {
      if (typeof requested !== 'string') return fail(CODES.invalidParams, 'Missing params._meta["' + KEY + 'protocolVersion"].');
      if (!MODERN.includes(requested)) return fail(CODES.unsupportedVersion, 'Unsupported protocol version', { supported: [...MODERN, ...LEGACY], requested });
      const capabilities = meta[KEY + 'clientCapabilities'];
      if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) return fail(CODES.invalidParams, 'Missing params._meta["' + KEY + 'clientCapabilities"].');
    }
    try {
      switch (message.method) {
        case 'server/discover': return ok({ supportedVersions: [...MODERN, ...LEGACY], capabilities: { tools: {} }, instructions });
        case 'initialize': return ok({ protocolVersion: LEGACY.includes(params?.protocolVersion) ? params.protocolVersion : LEGACY[0], capabilities: { tools: { listChanged: false } }, serverInfo, instructions });
        case 'ping': return ok({});
        case 'tools/list': return ok({ tools: await listTools() });
        case 'tools/call': {
          if (typeof params?.name !== 'string' || (params.arguments !== undefined && (params.arguments === null || typeof params.arguments !== 'object' || Array.isArray(params.arguments)))) return fail(CODES.invalidParams, 'tools/call needs a tool name and an arguments object.');
          let result;
          // A tool that fails is reported inside the result, where the assistant can read it and try again.
          try { result = await callTool(params.name, params.arguments || {}); } catch (e) { result = { content: [{ type: 'text', text: String(e?.message || e) }], isError: true }; }
          if (result?.unknown) return fail(CODES.invalidParams, 'Unknown tool: ' + params.name);
          return ok({ content: result.content, isError: !!result.isError, ...(result.structuredContent === undefined ? {} : { structuredContent: result.structuredContent }) });
        }
        default: return fail(CODES.methodNotFound, 'Method not found: ' + message.method, undefined, modern ? 404 : 200);
      }
    } catch (e) { return fail(CODES.internal, 'Video Visor could not answer: ' + String(e?.message || e), undefined, 500); }
  }
  return { handle, serverInfo };
}

// Streamable HTTP mirrors parts of a modern request into headers; a mismatch must be refused.
// Returns an error object, or null when the headers agree with the body (legacy requests have no such rule).
function headerProblem(message, headers) {
  const requested = message?.params?._meta?.[KEY + 'protocolVersion'];
  if (!message || message.id === undefined || (requested === undefined && message.method !== 'server/discover') || message.method === 'initialize') return null;
  const decode = v => { const m = /^=\?base64\?(.*)\?=$/.exec(v || ''); return m ? Buffer.from(m[1], 'base64').toString('utf8') : v; };
  const mismatch = text => ({ code: CODES.headerMismatch, message: 'Header mismatch: ' + text });
  if (headers['mcp-protocol-version'] === undefined) return mismatch('the MCP-Protocol-Version header is missing');
  if (requested !== undefined && headers['mcp-protocol-version'] !== requested) return mismatch(`MCP-Protocol-Version header '${headers['mcp-protocol-version']}' does not match body value '${requested}'`);
  if (headers['mcp-method'] === undefined) return mismatch('the Mcp-Method header is missing');
  if (headers['mcp-method'] !== message.method) return mismatch(`Mcp-Method header '${headers['mcp-method']}' does not match body value '${message.method}'`);
  if (message.method === 'tools/call') {
    if (headers['mcp-name'] === undefined) return mismatch('the Mcp-Name header is missing');
    if (decode(headers['mcp-name']) !== message.params?.name) return mismatch(`Mcp-Name header value '${decode(headers['mcp-name'])}' does not match body value '${message.params?.name}'`);
  }
  return null;
}
module.exports = { createProtocol, headerProblem, MODERN, LEGACY, KEY, CODES };
