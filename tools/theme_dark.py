#!/usr/bin/env python3
"""Generates src/theme-dark-v15.css: dark-theme overrides for hard-coded colours in the app's stylesheets.

The stylesheets grew over several versions with about 1,000 literal colours. Instead of editing each, this
reads them and, for every rule, writes a dark version that applies only under data-theme="dark":
  - light backgrounds, borders and outlines become dark surfaces (same hue, less saturation);
  - dark text becomes light text;
  - mid-tone accents, white text on accent buttons and already-dark colours are left alone.
Rules that style the video picture itself (captions, titles, overlays, the canvas, export) are skipped, so the
exported video never depends on the theme. Hand-written fixes go in src/theme-v15.css, which loads after.

Run after changing any stylesheet:  python3 -I tools/theme_dark.py
"""
import colorsys, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
FILES = ['style.css', 'native.css', 'editor-v8.css', 'editor-v9.css', 'editor-v10.css', 'explainer-v12.css',
         'connector-v13.css', 'ai-v14.css', 'editor-v15.css']
# Selectors that draw the video picture or its thumbnails of real styles: never themed.
SKIP = re.compile(r'ed-canvas|ed-captions|\.caption\b|v15-cap(?![-\w])|v15-cap-thumb|v15-cap-art|ed-layer|v8-title|v11-|\.overlay\b|export-view|'
                  r'ed-camera|ed-screen|ed-board|ed-column|ed-task|ed-cursor|ed-transition|v10-cap-thumb|v6-transform|ed-guide|'
                  r'vt-head|v15-snapline|music-cover|\.canvas\b|cap-art|template-art|v12-scene|v12-frame')
BG_PROPS = {'background', 'background-color', 'background-image', 'border', 'border-color', 'border-top', 'border-bottom',
            'border-left', 'border-right', 'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color',
            'outline', 'outline-color', 'box-shadow'}
TEXT_PROPS = {'color', 'fill', 'stroke', 'caret-color', '-webkit-text-fill-color'}
COLOUR = re.compile(r'#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)')


def parse_colour(tok):
    if tok.startswith('#'):
        h = tok[1:]
        if len(h) in (3, 4): h = ''.join(c * 2 for c in h)
        if len(h) not in (6, 8): return None
        r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1
        return r, g, b, a
    nums = re.findall(r'[\d.]+%?', tok)
    if len(nums) < 3: return None
    vals = [float(n[:-1]) / 100 * 255 if n.endswith('%') else float(n) for n in nums[:3]]
    a = float(nums[3][:-1]) / 100 if len(nums) > 3 and nums[3].endswith('%') else (float(nums[3]) if len(nums) > 3 else 1)
    return vals[0] / 255, vals[1] / 255, vals[2] / 255, a


def fmt(r, g, b, a):
    to = lambda v: max(0, min(255, round(v * 255)))
    return '#%02x%02x%02x' % (to(r), to(g), to(b)) if a >= .999 else 'rgba(%d,%d,%d,%.3g)' % (to(r), to(g), to(b), a)


def dark_surface(tok):
    c = parse_colour(tok)
    if not c: return tok
    r, g, b, a = c
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    if l < .62: return tok                    # already dark or a mid-tone accent
    if s > .55 and l < .8: return tok        # a saturated light accent (badges, highlights)
    l2 = .09 + (1 - l) * .55
    r2, g2, b2 = colorsys.hls_to_rgb(h, l2, s * .45)
    return fmt(r2, g2, b2, a)


def light_text(tok):
    c = parse_colour(tok)
    if not c: return tok
    r, g, b, a = c
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    if l > .5: return tok
    if s > .45 and l > .3:                    # coloured text (links, accents): lift it, keep the hue
        r2, g2, b2 = colorsys.hls_to_rgb(h, min(.72, l + .28), s)
        return fmt(r2, g2, b2, a)
    r2, g2, b2 = colorsys.hls_to_rgb(h, .9 - l * .55, s * .5)
    return fmt(r2, g2, b2, a)


def split_top(text, sep):
    out, depth, cur = [], 0, ''
    for ch in text:
        if ch in '([': depth += 1
        elif ch in ')]': depth -= 1
        if ch == sep and depth == 0: out.append(cur); cur = ''
        else: cur += ch
    out.append(cur)
    return out


def blocks(css):
    """Yields (prelude, body) pairs at the top level of a stylesheet."""
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    i, n = 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0: return
        prelude, depth, k = css[i:j].strip(), 1, j + 1
        while k < n and depth:
            if css[k] == '{': depth += 1
            elif css[k] == '}': depth -= 1
            k += 1
        yield prelude, css[j + 1:k - 1]
        i = k


def prefix(selector):
    # :where() adds no specificity, so each dark rule ranks exactly like its original and, coming later, replaces it.
    s = selector.strip()
    if not s: return None
    if s.startswith('#visor-app'): return '#visor-app:where([data-theme=dark])' + s[len('#visor-app'):]
    if s.startswith(('html', ':root', 'body')): return None
    return ':where(:root[data-theme=dark]) ' + s


PREFIX = None  # set per output: a function from selector to dark selector


def convert(prelude, body):
    """Every rule that sets a colour is mirrored, in order, so the dark cascade matches the light one. Colours are
    converted unless the rule draws the video picture or the value uses a variable."""
    sels = [s for s in split_top(prelude, ',') if s.strip()]
    keep = any(SKIP.search(s) for s in sels)
    decls, changed = [], False
    for decl in split_top(body, ';'):
        if ':' not in decl: continue
        prop, val = decl.split(':', 1)
        prop = prop.strip().lower()
        if prop not in BG_PROPS and prop not in TEXT_PROPS: continue
        if not COLOUR.search(val) and 'var(' not in val and 'light-dark(' not in val: continue
        new = val
        if not keep and prop != 'box-shadow' and 'var(' not in val and 'light-dark(' not in val:
            new = COLOUR.sub(lambda m: (dark_surface if prop in BG_PROPS else light_text)(m.group(0)), val)
        changed |= new != val
        decls.append(prop + ':' + new.strip())
    if not decls: return None
    out = [p for p in ((PREFIX or prefix)(s) for s in sels) if p]
    return ((','.join(out) + '{' + ';'.join(decls) + '}') if out else None), changed


def generate(files, target, wrap=None):
    lines = ['/* Generated by tools/theme_dark.py. Do not edit; fix by hand in theme-v15.css (or the recorder CSS). */']
    count = 0
    for name in files:
        css = open(os.path.join(SRC, name), encoding='utf-8').read()
        lines.append('/* ' + name + ' */')
        for prelude, body in blocks(css):
            if prelude.startswith('@media'):
                inner = [r for r in (convert(p, b) for p, b in blocks(body)) if r and r[0]]
                if inner: lines.append(prelude + '{' + ''.join(r[0] for r in inner) + '}'); count += sum(r[1] for r in inner)
            elif prelude.startswith('@'):
                continue
            else:
                r = convert(prelude, body)
                if r and r[0]: lines.append(r[0]); count += r[1]
    body = '\n'.join(lines[1:])
    text = lines[0] + '\n' + (wrap % body if wrap else body) + '\n'
    open(os.path.join(SRC, target), 'w', encoding='utf-8').write(text)
    print('wrote src/' + target + ' ·', count, 'rules with converted colours')


SIZE = re.compile(r'(font-size\s*:\s*)(\d+(?:\.\d+)?)px')
SIZE_FONT = re.compile(r'(\bfont\s*:[^;]*?)(\d+(?:\.\d+)?)px')


def sizes(files, target, minimum=12):
    """UI-05: interface text is at least 12 px. Mirrors every rule whose font size is smaller, in order."""
    out, count = ['/* Generated by tools/theme_dark.py: interface text at least ' + str(minimum) + ' px. Do not edit. */'], 0
    def fix(prelude, body):
        sels = [x for x in split_top(prelude, ',') if x.strip()]
        if any(SKIP.search(x) for x in sels): return None
        decls = []
        for decl in split_top(body, ';'):
            if ':' not in decl: continue
            prop = decl.split(':', 1)[0].strip().lower()
            if prop == 'font-size':
                m = SIZE.search(decl)
                if m and float(m.group(2)) < minimum: decls.append('font-size:' + str(minimum) + 'px' + ('!important' if 'important' in decl else ''))
            elif prop == 'font':
                m = SIZE_FONT.search(decl)
                if m and float(m.group(2)) < minimum: decls.append('font-size:' + str(minimum) + 'px' + ('!important' if 'important' in decl else ''))
        return (','.join(sels) + '{' + ';'.join(decls) + '}') if decls else None
    for name in files:
        css = open(os.path.join(SRC, name), encoding='utf-8').read()
        for prelude, body in blocks(css):
            if prelude.startswith('@media'):
                inner = [r for r in (fix(p, b) for p, b in blocks(body)) if r]
                if inner: out.append(prelude + '{' + ''.join(inner) + '}'); count += len(inner)
            elif not prelude.startswith('@'):
                r = fix(prelude, body)
                if r: out.append(r); count += 1
    open(os.path.join(SRC, target), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    print('wrote src/' + target + ' ·', count, 'rules')


def run():
    global PREFIX
    PREFIX = None
    generate(FILES, 'theme-dark-v15.css')
    # The recorder windows follow the app theme through prefers-color-scheme (main.cjs sets nativeTheme.themeSource).
    PREFIX = lambda sel: sel.strip() or None
    generate(['recorder/panel.css'], 'recorder/panel-dark.css', '@media (prefers-color-scheme: dark){\n%s\n}')
    sizes(FILES + ['titles-v11.css'], 'ui-size-v15.css')


if __name__ == '__main__':
    run()
