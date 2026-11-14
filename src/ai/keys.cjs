'use strict';
// API keys for "Draft with AI". A key is the person's own secret for a paid service, so:
// - it is encrypted with Electron safeStorage, whose encryption key lives in the macOS keychain;
//   only the encrypted bytes are written to disk, in a file of their own (never in a project, the
//   workspace, the diagnostics log, or anything sent to the app window);
// - the app window is only ever told "a key is saved, ending …abcd";
// - if the keychain is not available the key is kept in memory for this session and not written at all.
const fs = require('node:fs/promises');
const PROVIDERS = ['anthropic', 'openai'];

function createKeyStore({ file, safeStorage }) {
  const memory = new Map(); let saved = {};
  const canEncrypt = () => { try { return !!safeStorage?.isEncryptionAvailable(); } catch { return false; } };
  const check = provider => { if (!PROVIDERS.includes(provider)) throw Error('Unknown AI service.'); };
  const write = () => fs.writeFile(file, JSON.stringify(saved, null, 1), { mode: 0o600 });
  return {
    providers: PROVIDERS,
    async load() { try { const data = JSON.parse(await fs.readFile(file, 'utf8')); saved = Object.fromEntries(PROVIDERS.filter(p => typeof data?.[p]?.data === 'string').map(p => [p, { data: data[p].data, hint: String(data[p].hint || '').slice(-4) }])); } catch { saved = {}; } },
    // What the window may know: whether a key exists, where it is kept, and its last four characters.
    status() { return { keychain: canEncrypt(), keys: Object.fromEntries(PROVIDERS.map(p => [p, memory.has(p) ? { saved: true, kept: 'session', hint: memory.get(p).slice(-4) } : saved[p] ? { saved: true, kept: 'keychain', hint: saved[p].hint } : { saved: false }])) }; },
    async save(provider, key, remember = true) {
      check(provider); key = String(key || '').trim();
      if (key.length < 20 || key.length > 400 || /\s/.test(key)) throw Error('That does not look like an API key. Paste the whole key, with no spaces.');
      memory.delete(provider); delete saved[provider];
      if (remember && canEncrypt()) { saved[provider] = { data: safeStorage.encryptString(key).toString('base64'), hint: key.slice(-4) }; await write(); return { kept: 'keychain' }; }
      await write().catch(() => {}); memory.set(provider, key); return { kept: 'session' };
    },
    async clear(provider) { check(provider); memory.delete(provider); delete saved[provider]; await write(); },
    // Main-process use only.
    get(provider) {
      check(provider); if (memory.has(provider)) return memory.get(provider); if (!saved[provider]) return null;
      try { return safeStorage.decryptString(Buffer.from(saved[provider].data, 'base64')); } catch { throw Error('The saved API key could not be read from the keychain. Enter it again in Settings → Draft with AI.'); }
    }
  };
}
module.exports = { createKeyStore, PROVIDERS };
