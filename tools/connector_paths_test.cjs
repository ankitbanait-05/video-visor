// Checks the connector's folder rule (connector/host.cjs allowed()): a drive root can be allowed on Windows,
// paths compare without case there, and a folder never matches a sibling with the same prefix.
//   node tools/connector_paths_test.cjs
const path = require('node:path'), os = require('node:os'), fs = require('node:fs');
const { createHost } = require('../src/connector/host.cjs');
const h = createHost({ window: () => null, root: os.tmpdir(), register: () => {}, job: f => f(), exportProject: () => {} });
let failed = 0;
const expect = async (name, file, folders, allow) => {
  let ok; try { await h.allowed(file, folders); ok = true; } catch { ok = false; }
  if (ok !== allow) failed++; console.log((ok === allow ? 'ok   ' : 'FAIL ') + name);
};
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-conn-')), file = path.join(dir, 'clip.mp4'); fs.writeFileSync(file, 'x');
  const root = path.parse(file).root;
  await expect('file inside an allowed folder', file, [dir], true);
  await expect('the allowed folder itself', dir, [dir], true);
  await expect('file on an allowed drive root / filesystem root', file, [root], true);
  await expect('sibling folder with the same prefix is refused', file, [dir.slice(0, -2)], false);
  await expect('file outside every folder is refused', file, [path.join(dir, 'sub')], false);
  await expect('relative path is refused', 'clip.mp4', [dir], false);
  if (process.platform === 'win32') await expect('Windows paths compare without case', file.toUpperCase(), [dir.toLowerCase()], true);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(failed ? failed + ' failed' : 'all passed'); process.exitCode = failed ? 1 : 0;
})();
