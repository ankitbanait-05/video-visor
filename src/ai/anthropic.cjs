'use strict';
// Anthropic (Claude) connection for "Draft with AI", through the official SDK.
// One streamed Messages API request per turn; the conversation is kept here and resent each turn.
const sdk = require('@anthropic-ai/sdk'), Anthropic = sdk.default || sdk;
const providers = require('./providers.cjs');
const DEFAULT_MODEL = 'claude-opus-5-5';
// Models whose refusals can be re-run on another model inside the same request (server-side fallback).
const FALLBACK_MODELS = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
// Current-generation ids only (4.6 and later): they all take adaptive thinking and an effort level.
const usable = id => { const m = /^claude-(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d+))?$/.exec(id); return !!m && m[1] !== 'mythos' && (+m[2] > 4 || (+m[2] === 4 && +(m[3] || 0) >= 6)); };

// Turns an SDK error into words for the person. The API's own message is included only for request
// problems (for example an unknown model or no credit), where it says what to fix; it never holds the key.
function explain(e) {
  const plain = text => Object.assign(e instanceof Error ? e : Error(String(e)), { plain: text });
  if (e instanceof Anthropic.APIUserAbortError) return plain('Stopped.');
  if (e instanceof Anthropic.AuthenticationError) return plain('Anthropic did not accept this API key. Check it in Settings → Draft with AI.');
  if (e instanceof Anthropic.PermissionDeniedError) return plain('This Anthropic key is not allowed to use that model. Choose another model in Settings → Draft with AI.');
  if (e instanceof Anthropic.NotFoundError) return plain('Anthropic does not know that model. Press “Check key and load models” in Settings → Draft with AI and choose one from the list.');
  if (e instanceof Anthropic.RateLimitError) return plain('Anthropic is limiting requests for this key right now. Wait a minute and try again.');
  if (e instanceof Anthropic.BadRequestError) return plain('Anthropic refused the request: ' + String(e.error?.error?.message || e.message || '').slice(0, 240));
  if (e instanceof Anthropic.APIConnectionTimeoutError || e instanceof Anthropic.APIConnectionError) return plain('Anthropic could not be reached. Check your internet connection and try again.');
  if (e instanceof Anthropic.APIError) return plain(e.status >= 500 ? 'Anthropic is having problems right now. Try again in a few minutes.' : 'Anthropic answered with an error (' + e.status + '). Try again.');
  return e instanceof Error ? e : Error(String(e));
}

function create({ apiKey, model = DEFAULT_MODEL, baseURL, maxRetries = 2 }) {
  const client = providers.isolated('ANTHROPIC_', () => new Anthropic({ apiKey, authToken: null, baseURL: baseURL || 'https://api.anthropic.com', maxRetries }));
  return {
    async models() {
      try {
        const found = []; for await (const m of client.models.list()) if (usable(m.id)) found.push({ id: m.id, name: m.display_name || m.id });
        return found.sort((a, b) => (b.id === DEFAULT_MODEL) - (a.id === DEFAULT_MODEL));
      } catch (e) { throw explain(e); }
    },
    start({ system, tools, prompt, signal }) {
      const messages = [{ role: 'user', content: prompt }], withFallback = FALLBACK_MODELS.has(model);
      const params = () => ({
        model, max_tokens: 64000, system,
        output_config: { effort: 'high' },
        cache_control: { type: 'ephemeral' }, // the growing history is resent every turn; cache what has not changed
        // Inputs arrive as they are written; each one is checked against the tool's schema before it is used (draft.cjs).
        tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema, eager_input_streaming: true })),
        messages,
        ...(withFallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' } : {})
      });
      return {
        async next(results) {
          if (results) messages.push({ role: 'user', content: results.map(r => ({ type: 'tool_result', tool_use_id: r.id, is_error: !!r.isError, content: r.image ? [{ type: 'text', text: r.text }, { type: 'image', source: { type: 'base64', media_type: r.image.mimeType, data: r.image.data } }] : r.text })) });
          const usage = { input: 0, output: 0 }; let unparsed = 0;
          for (;;) {
            let message;
            try { message = await (withFallback ? client.beta.messages : client.messages).stream(params(), { signal }).finalMessage(); }
            catch (e) {
              // A tool input that could not be parsed at all rejects here; ask for the turn again, twice at most.
              if (!(e instanceof Anthropic.APIError) && !(e?.name === 'AbortError') && unparsed++ < 2 && !signal?.aborted) continue;
              throw explain(e);
            }
            usage.input += (message.usage?.input_tokens || 0) + (message.usage?.cache_read_input_tokens || 0) + (message.usage?.cache_creation_input_tokens || 0); usage.output += message.usage?.output_tokens || 0;
            // The whole reply goes back into the history unchanged (thinking and fallback blocks included).
            messages.push({ role: 'assistant', content: message.content });
            if (message.stop_reason === 'pause_turn') continue;
            const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
            const calls = message.content.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, name: b.name, args: b.input }));
            const stop = message.stop_reason === 'refusal' ? 'refused' : message.stop_reason === 'max_tokens' ? 'length' : calls.length ? 'tools' : 'done';
            return { text, calls: stop === 'tools' ? calls : [], stop, usage };
          }
        }
      };
    }
  };
}
providers.register('anthropic', options => create(options));
module.exports = { create, explain, usable, DEFAULT_MODEL };
