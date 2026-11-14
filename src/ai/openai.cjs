'use strict';
// OpenAI connection for "Draft with AI", through the official SDK and the Responses API.
// Nothing is stored on OpenAI's side (store: false); the conversation is kept here and resent each turn,
// with every output item of the previous replies passed back unchanged, as OpenAI's guide requires.
const sdk = require('openai'), OpenAI = sdk.default || sdk;
const { toResponseInputItems } = require('openai/lib/responses/ResponseInputItems');
const providers = require('./providers.cjs');
// Text models that can call functions; everything else on the account (speech, images, embeddings…) is left out.
const usable = id => /^(gpt-|o\d)/.test(id) && !/audio|realtime|tts|transcribe|whisper|image|embedding|moderation|search|instruct|codex|computer/.test(id);

function explain(e) {
  const plain = text => Object.assign(e instanceof Error ? e : Error(String(e)), { plain: text });
  if (e instanceof OpenAI.APIUserAbortError) return plain('Stopped.');
  if (e instanceof OpenAI.AuthenticationError) return plain('OpenAI did not accept this API key. Check it in Settings → Draft with AI.');
  if (e instanceof OpenAI.PermissionDeniedError) return plain('This OpenAI key is not allowed to use that model. Choose another model in Settings → Draft with AI.');
  if (e instanceof OpenAI.NotFoundError) return plain('OpenAI does not know that model. Press “Check key and load models” in Settings → Draft with AI and choose one from the list.');
  if (e instanceof OpenAI.RateLimitError) return plain(/quota|billing/i.test(String(e.message)) ? 'Your OpenAI account has no credit left for this key. Add credit on platform.openai.com, then try again.' : 'OpenAI is limiting requests for this key right now. Wait a minute and try again.');
  if (e instanceof OpenAI.BadRequestError) return plain('OpenAI refused the request: ' + String(e.error?.message || e.message || '').slice(0, 240));
  if (e instanceof OpenAI.APIConnectionTimeoutError || e instanceof OpenAI.APIConnectionError) return plain('OpenAI could not be reached. Check your internet connection and try again.');
  if (e instanceof OpenAI.APIError) return plain(e.status >= 500 ? 'OpenAI is having problems right now. Try again in a few minutes.' : 'OpenAI answered with an error (' + e.status + '). Try again.');
  return e instanceof Error ? e : Error(String(e));
}

function create({ apiKey, model, baseURL, maxRetries = 2 }) {
  const client = providers.isolated('OPENAI_', () => new OpenAI({ apiKey, organization: null, project: null, baseURL: baseURL || 'https://api.openai.com/v1', maxRetries }));
  return {
    async models() {
      try { return (await client.models.list()).data.filter(m => usable(m.id)).sort((a, b) => (b.created || 0) - (a.created || 0)).map(m => ({ id: m.id, name: m.id })); }
      catch (e) { throw explain(e); }
    },
    start({ system, tools, prompt, signal }) {
      const input = [{ role: 'user', content: prompt }];
      // strict: false because several options are optional; every request is checked against the schema before use (draft.cjs).
      const definitions = tools.map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.inputSchema, strict: false }));
      return {
        async next(results) {
          for (const r of results || []) {
            input.push({ type: 'function_call_output', call_id: r.id, output: r.text });
            // A frame the model asked for travels as a picture in a message of its own.
            if (r.image) input.push({ role: 'user', content: [{ type: 'input_text', text: 'The frame returned by ' + r.name + ':' }, { type: 'input_image', image_url: `data:${r.image.mimeType};base64,${r.image.data}`, detail: 'auto' }] });
          }
          let response;
          try { response = await client.responses.create({ model, instructions: system, tools: definitions, input, store: false }, { signal }); }
          catch (e) { throw explain(e); }
          input.push(...toResponseInputItems(response.output)); // reasoning items and all: the next turn needs them
          const calls = response.output.filter(item => item.type === 'function_call').map(item => { let args = null; try { args = JSON.parse(item.arguments); } catch { } return { id: item.call_id, name: item.name, args }; });
          const refused = response.output.some(item => item.type === 'message' && (item.content || []).some(part => part.type === 'refusal'));
          const cut = response.status === 'incomplete';
          return { text: String(response.output_text || '').trim(), calls: refused || cut ? [] : calls, stop: refused ? 'refused' : cut ? 'length' : calls.length ? 'tools' : 'done', usage: { input: response.usage?.input_tokens || 0, output: response.usage?.output_tokens || 0 } };
        }
      };
    }
  };
}
providers.register('openai', options => create(options));
module.exports = { create, explain, usable };
