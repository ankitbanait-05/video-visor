'use strict';
// The AI services "Draft with AI" can use. Each service has an adapter that hides how that service's
// API is shaped, so the drafting loop (draft.cjs) is the same for all of them.
//
// An adapter factory is called as factory({ apiKey, model }) and returns:
//   models()  → Promise<[{ id, name }]>   the models this key can use (also how a key is checked)
//   start({ system, tools: [{ name, description, inputSchema }], prompt, signal }) → conversation
//   conversation.next(results) → Promise<{ text, calls: [{ id, name, args }], stop, usage: { input, output } }>
//     `results` is null on the first call, then one { id, name, text, isError, image? } per call of the
//     previous reply. `stop` is 'tools', 'done', 'refused' or 'length'.
// An adapter reports problems by throwing an Error whose `plain` text is safe to show the person
// (wrong key, no credit, rate limit, no connection) and never contains the key.
const services = {
  anthropic: { name: 'Anthropic (Claude)', company: 'Anthropic', keyPage: 'console.anthropic.com → API keys', defaultModel: 'claude-opus-5-5', factory: null },
  openai: { name: 'OpenAI', company: 'OpenAI', keyPage: 'platform.openai.com → API keys', defaultModel: '', factory: null }
};
// The SDKs read settings from environment variables when a client is made (a different address, extra
// headers, another key, request logging). The person's key must only ever go to the service they chose,
// with the request the app built, so clients are made with those variables hidden for that moment.
function isolated(prefix, make) {
  const saved = Object.keys(process.env).filter(k => k.startsWith(prefix)).map(k => [k, process.env[k]]);
  for (const [k] of saved) delete process.env[k];
  try { return make(); } finally { for (const [k, v] of saved) process.env[k] = v; }
}
function register(id, factory) { if (!services[id]) throw Error('Unknown AI service: ' + id); services[id].factory = factory; }
function get(id) { const s = services[id]; if (!s) throw Error('Unknown AI service.'); return s; }
function list() { return Object.entries(services).map(([id, s]) => ({ id, name: s.name, company: s.company, keyPage: s.keyPage, defaultModel: s.defaultModel, ready: !!s.factory })); }
module.exports = { register, get, list, isolated };
