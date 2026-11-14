#!/usr/bin/env python3
"""Removes what the developer benchmarks (src/bench.cjs) left in the Dev app's workspace.

    python3 -I tools/clean_bench.py            list what would be removed (nothing is deleted)
    python3 -I tools/clean_bench.py --delete   remove it (quit the Dev app first: it rewrites media.json)

Removed: the bench/ folder; media-list entries for files in it, for re-imports of a file made by the benchmark
(same file as one of your entries, no cursor track, used by no project), and for speed copies made from those;
their edit copies, previews and cached visuals; and render-cache/ (it rebuilds itself).
Never removed: anything any project uses (all versions included), or any file a kept entry points to.
"""
import json, os, shutil, sys

W = os.path.expanduser('~/Library/Application Support/Video Visor Dev/workspace-v2')
BENCH = os.path.join(W, 'bench')


def project_asset_ids():
    data = json.load(open(os.path.join(W, 'projects.json')))
    ids = set()
    def walk(o):
        if isinstance(o, dict):
            for k in ('asset',):
                if isinstance(o.get(k), str): ids.add(o[k])
            for k in ('assets',):
                if isinstance(o.get(k), list):
                    for a in o[k]:
                        if isinstance(a, dict) and isinstance(a.get('id'), str): ids.add(a['id'])
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(data)
    return ids


def main():
    delete = '--delete' in sys.argv
    registry = json.load(open(os.path.join(W, 'media.json')))
    used = project_asset_ids()
    inside = lambda p: bool(p) and os.path.abspath(p).startswith(BENCH + os.sep)
    # 1. entries for benchmark files
    gone = {i for i, a in registry.items() if inside(a.get('path'))}
    # 2. re-imports of a user's file by VV_BENCH_SOURCE: same path as another entry, no cursor track, unused
    by_path = {}
    for i, a in registry.items(): by_path.setdefault(a.get('path'), []).append(i)
    # only the file the benchmark re-imported (VV_BENCH_SOURCE: your screen recording); your own repeated imports stay
    for path, ids in by_path.items():
        if len(ids) < 2 or not os.path.basename(path or '').startswith('Recording-'): continue
        keep = [i for i in ids if i in used or (registry[i].get('cursor') or [])]
        if not keep: keep = ids[:1]
        gone |= {i for i in ids if i not in keep and i not in used}
    # 3. speed copies made from removed entries
    changed = True
    while changed:
        changed = False
        for i, a in registry.items():
            if i not in gone and a.get('speedOf') in gone and i not in used: gone.add(i); changed = True
    gone -= used
    kept_files = {p for i, a in registry.items() if i not in gone for p in (a.get('path'), a.get('previewPath')) if p}
    files = set()
    for i in gone:
        a = registry[i]
        for p in (a.get('path'), a.get('previewPath')):
            if p and os.path.dirname(os.path.abspath(p)) == W and p not in kept_files and os.path.exists(p): files.add(p)
        v = os.path.join(W, 'visual-' + i + '.json')
        if os.path.exists(v): files.add(v)
    size = lambda p: os.path.getsize(p) if os.path.isfile(p) else sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(p) for f in fs)
    dirs = [d for d in (BENCH, os.path.join(W, 'render-cache')) if os.path.isdir(d)]
    total = sum(size(p) for p in files) + sum(size(d) for d in dirs)
    print('media-list entries to remove: %d of %d (projects use %d ids; none of them is removed)' % (len(gone), len(registry), len(used & set(registry))))
    from collections import Counter
    kinds = Counter((registry[i].get('name'), 'bench file' if inside(registry[i].get('path')) else 'speed copy' if registry[i].get('speedOf') else 're-import of your recording') for i in gone)
    for (n, k), c in sorted(kinds.items()): print('   - %s (%s) x%d' % (n, k, c))
    print('files to delete: %d; folders: %s' % (len(files), ', '.join(os.path.basename(d) + '/' for d in dirs)))
    print('   (in the workspace folder: %d edit copies / previews / speed copies / cached visuals)' % len(files))
    print('space freed: %.1f GB' % (total / 1e9))
    if not delete: print('\nDry run: nothing deleted. Quit the Dev app, then run with --delete.'); return
    for i in gone: registry.pop(i, None)
    tmp = os.path.join(W, 'media.json.tmp'); json.dump(registry, open(tmp, 'w')); os.replace(tmp, os.path.join(W, 'media.json'))
    for p in files: os.remove(p)
    for d in dirs: shutil.rmtree(d)
    print('Done.')


if __name__ == '__main__':
    main()
