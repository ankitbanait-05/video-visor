#!/usr/bin/env python3
"""Finds, and with --remove deletes, functions in the app's scripts that nothing refers to.

The editor and shell grew by layering new versions over old ones, so some functions are no longer called from
anywhere. A function counts as dead when its name appears nowhere in src/ (scripts, HTML) except its own
declaration. Removal repeats until nothing new becomes dead. Afterwards: `--check` every file and run the
preview checks (tools/preview/qa.js).

    python3 -I tools/dead_code.py            list
    python3 -I tools/dead_code.py --remove   remove
"""
import glob, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
TARGETS = ['shell.js', 'editor.js', 'runtime.js', 'runtime-v5.js', 'runtime-v6.js', 'runtime-v7.js', 'runtime-v8.js', 'runtime-v13.js', 'runtime-v14.js']


def corpus():
    files = [f for pat in ('*.js', '*.cjs', '*.html', 'engines/*', 'recorder/*.js', 'recorder/*.cjs', 'ai/*.cjs', 'connector/*') for f in glob.glob(os.path.join(SRC, pat)) if os.path.isfile(f)]
    return ''.join(open(f, encoding='utf-8').read() for f in files)


def end_of_function(s, i):
    """Index just past the body of the function whose `function` keyword starts at i. Skips strings, template
    literals, comments and regular expressions so braces inside them don't count."""
    j = s.index('{', s.index(')', i))
    depth, k, n, prev = 0, j, len(s), ''
    stack = []  # template-literal nesting
    while k < n:
        c = s[k]
        if c in '"\'':
            q = c; k += 1
            while k < n and s[k] != q:
                k += 2 if s[k] == '\\' else 1
        elif c == '`':
            k += 1
            while k < n and s[k] != '`':
                if s[k] == '\\': k += 2; continue
                if s.startswith('${', k):
                    # find the matching } of the substitution
                    d, k = 1, k + 2
                    while k < n and d:
                        if s[k] == '{': d += 1
                        elif s[k] == '}': d -= 1
                        elif s[k] in '"\'`':
                            q = s[k]; k += 1
                            while k < n and s[k] != q: k += 2 if s[k] == '\\' else 1
                        k += 1
                    continue
                k += 1
        elif s.startswith('//', k):
            k = s.find('\n', k); k = n if k < 0 else k
        elif s.startswith('/*', k):
            k = s.index('*/', k) + 1
        elif c == '/' and prev in '(,=:[!&|?{};+-*%<>~^\n' or (c == '/' and s[max(0, k - 6):k].endswith('return')):
            k += 1; cls = False
            while k < n and (s[k] != '/' or cls):
                if s[k] == '\\': k += 1
                elif s[k] == '[': cls = True
                elif s[k] == ']': cls = False
                k += 1
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return k + 1
        if not c.isspace(): prev = c
        k += 1
    raise ValueError('unbalanced function at %d' % i)


def dead(text_all):
    found = {}
    for name in TARGETS:
        s = open(os.path.join(SRC, name), encoding='utf-8').read()
        for m in re.finditer(r'(?<![\w$.])(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(', s):
            fn = m.group(1)
            if len(re.findall(r'(?<![\w$])' + re.escape(fn) + r'(?![\w$])', text_all)) == 1:
                found.setdefault(name, []).append((fn, m.start()))
    return found


def main():
    remove = '--remove' in sys.argv
    total = 0
    while True:
        found = dead(corpus())
        if not found:
            break
        for name, items in found.items():
            print(name, ':', ', '.join(f for f, _ in items))
        if not remove:
            return
        for name, items in found.items():
            path = os.path.join(SRC, name)
            s = open(path, encoding='utf-8').read()
            for fn, start in sorted(items, key=lambda x: -x[1]):
                end = end_of_function(s, start)
                s = s[:start] + s[end:]
                total += 1
            open(path, 'w', encoding='utf-8').write(s)
    print('removed', total, 'functions' if remove else '')


if __name__ == '__main__':
    main()
