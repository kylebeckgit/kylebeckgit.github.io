"""Round 8. Four kb slabs in a chamfered, hardware-cut spirit.

The cut is our own: a 45-degree chevron and, on one of them, a tracker step.
Not a tracing of the Dirtywave monogram.

Run: python3 art/logo-concepts/round8/render.py
Wordmark is Josefin Sans (OFL), weight 300, tracked wide. Downloaded on demand.
Does not replace the live favicon.
"""
import math
import os
import subprocess
import urllib.request
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image, ImageDraw, ImageFont
from shapely.affinity import scale, translate
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.abspath(__file__))
CREAM = '#F2EDE3'
INK = '#1F1D1A'
BLACK = '#000000'
WHITE = '#FFFFFF'
PANEL = '#141311'
GREY = '#E6E6E6'
ACCENT = '#D4421C'
LINE = '#C8BBA8'
JOSEFIN_VAR = '/tmp/fonts/Josefin.ttf'
JOSEFIN = '/tmp/fonts/Josefin-300.ttf'
JOSEFIN_URL = 'https://github.com/google/fonts/raw/main/ofl/josefinsans/JosefinSans%5Bwght%5D.ttf'


def font_file(path, wght, wdth):
    if os.path.exists(path):
        return path
    src = os.path.abspath(os.path.join(ROOT, '..', '..', '..', 'fonts', 'archivo', 'archivo-latin-wdth-normal.woff2'))
    font = TTFont(src)
    inst = instantiateVariableFont(font, {'wght': wght, 'wdth': wdth}, inplace=False)
    inst.flavor = None
    inst.save(path)
    return path


def josefin():
    if os.path.exists(JOSEFIN):
        return JOSEFIN
    os.makedirs('/tmp/fonts', exist_ok=True)
    if not os.path.exists(JOSEFIN_VAR):
        urllib.request.urlretrieve(JOSEFIN_URL, JOSEFIN_VAR)
    font = TTFont(JOSEFIN_VAR)
    inst = instantiateVariableFont(font, {'wght': 300}, inplace=False)
    inst.flavor = None
    inst.save(JOSEFIN)
    return JOSEFIN


def chamfer_box(x, y, w, h, c, cb=None):
    cb = c if cb is None else cb
    c = max(0.0, min(float(c), w / 2 - 0.6, h / 2 - 0.6))
    cb = max(0.0, min(float(cb), w / 2 - 0.6, h / 2 - 0.6))
    return Polygon([
        (x + c, y), (x + w - c, y), (x + w, y + c), (x + w, y + h - cb),
        (x + w - cb, y + h), (x + cb, y + h), (x, y + h - cb), (x, y + c),
    ])


def kb_geom(ch=16, gap=48, sw=78, arm=56, step=0, angle=45, counter=1.0, bw=176, cb=None, which='both', share=False):
    """Lowercase kb. Arms are uniform 45-degree slabs (or `angle`) meeting at one point."""
    cb = ch if cb is None else cb
    top, base = 44.0, 468.0
    xh = 184.0
    joint = (xh + base) / 2.0
    x = 0.0
    stem = chamfer_box(x, top, sw, base - top, ch, cb)
    rad = math.radians(angle)
    u = (math.cos(rad), -math.sin(rad))
    perp = (u[1], -u[0])  # outer normal of the upper arm
    V = (x + sw, joint)

    def arm_poly(uu, pp):
        target = xh if uu[1] < 0 else base
        length = (target - V[1] - pp[1] * arm) / uu[1]
        back = 16.0
        outer_start = (V[0] + pp[0] * arm - uu[0] * back, V[1] + pp[1] * arm - uu[1] * back)
        outer_tip = (V[0] + uu[0] * length + pp[0] * arm, V[1] + uu[1] * length + pp[1] * arm)
        inner_end = (V[0] + uu[0] * length, V[1] + uu[1] * length)
        poly = Polygon([V, inner_end, outer_tip, outer_start])
        if not poly.is_valid:
            poly = poly.buffer(0)
        return poly, inner_end, outer_tip

    parts = [stem]
    right = x + sw
    tips = []
    if which in ('both', 'up'):
        poly, inner, tip = arm_poly(u, perp)
        parts.append(poly)
        right = max(right, inner[0], tip[0])
        tips.append(tip)
    if which in ('both', 'down'):
        ud = (u[0], -u[1])
        pd = (perp[0], -perp[1])
        poly, inner, tip = arm_poly(ud, pd)
        parts.append(poly)
        right = max(right, inner[0], tip[0])
        tips.append(tip)
    k = unary_union(parts)
    if share:
        # One stem. The arms swing to the left, the bowl stays on the right.
        k = scale(k, xfact=-1, yfact=1, origin=(sw / 2.0, 0))
        bx = 0.0
        bsw = sw
    else:
        bx = right + gap
        bsw = sw * 0.92
    overlap = max(ch, cb) + 18
    bowl_top = xh + step
    bowl_h = base - bowl_top
    bstem = chamfer_box(bx, top, bsw, base - top, ch, cb)
    outer = chamfer_box(bx + bsw - overlap, bowl_top, bw, bowl_h, max(8.0, ch * 0.75), max(8.0, cb * 0.9))
    bowl_right = bx + bsw - overlap + bw
    wall = 34.0
    c_left = bx + bsw + 2
    c_right = bowl_right - wall
    c_top = bowl_top + wall * 0.95
    c_bot = base - max(wall, cb + 10)
    cw = max(28.0, (c_right - c_left) * counter)
    chh = max(28.0, (c_bot - c_top) * min(counter, 1.05))
    cx = c_left + (c_right - c_left) / 2.0
    cy = (c_top + c_bot) / 2.0 - 6
    inner_ch = max(6.0, min(ch * 0.45, cw / 5, chh / 5))
    hole = chamfer_box(cx - cw / 2, cy - chh / 2, cw, chh, inner_ch)
    b = unary_union([bstem, outer]).difference(hole)
    mark = unary_union([k, b]).buffer(0)
    minx, miny, maxx, maxy = mark.bounds
    span = max(maxx - minx, maxy - miny)
    if span > 496:
        mark = scale(mark, 488 / span, 488 / span, origin=(minx, miny))
        minx, miny, maxx, maxy = mark.bounds
    dx = (512 - (maxx - minx)) / 2 - minx
    dy = (512 - (maxy - miny)) / 2 - miny
    mark = translate(mark, dx, dy)
    guides = {'cap': top + dy, 'shoulder': xh + dy, 'joint': joint + dy, 'base': base + dy}
    return mark, guides


MARKS = [
    ('01-gap', 'A readable kb, cut on the diagonal, with the counter left open.',
     dict(ch=14, gap=56, sw=76, arm=58, step=0, angle=45, counter=1.0, bw=188, cb=14)),
    ('02-chamfer', 'Cut back hard, so the slabs arrive before the letters do.',
     dict(ch=46, gap=40, sw=116, arm=70, step=0, angle=45, counter=0.94, bw=172, cb=16)),
    ('03-step', 'The bowl drops one row, a tracker step under a shared cap.',
     dict(ch=18, gap=48, sw=84, arm=60, step=88, angle=45, counter=1.0, bw=176, cb=16)),
    ('04-tight', 'Heavy slabs, a hairline gap, and a single counter.',
     dict(ch=24, gap=26, sw=112, arm=76, step=0, angle=45, counter=0.8, bw=156, cb=14)),
]

SKETCHES = [
    ('chamfer 8', dict(ch=8, gap=48, sw=80, arm=56, cb=8)),
    ('chamfer 20', dict(ch=20, gap=48, sw=84, arm=58, cb=16)),
    ('chamfer 36', dict(ch=36, gap=40, sw=100, arm=64, cb=16)),
    ('chamfer 52', dict(ch=52, gap=36, sw=120, arm=72, cb=18)),
    ('angle 25', dict(ch=16, gap=36, sw=78, arm=52, angle=25, cb=14)),
    ('angle 35', dict(ch=16, gap=44, sw=80, arm=56, angle=35, cb=14)),
    ('angle 45', dict(ch=16, gap=48, sw=80, arm=58, angle=45, cb=14)),
    ('angle 60', dict(ch=16, gap=48, sw=84, arm=60, angle=60, cb=14)),
    ('gap 16', dict(ch=18, gap=16, sw=88, arm=60, cb=14)),
    ('gap 32', dict(ch=18, gap=32, sw=84, arm=58, cb=14)),
    ('gap 64', dict(ch=18, gap=64, sw=76, arm=54, cb=14)),
    ('gap 96', dict(ch=16, gap=96, sw=70, arm=50, cb=12)),
    ('light', dict(ch=10, gap=52, sw=56, arm=40, bw=160, cb=10)),
    ('medium', dict(ch=16, gap=48, sw=80, arm=56, cb=14)),
    ('heavy', dict(ch=22, gap=36, sw=108, arm=74, counter=0.85, bw=160, cb=14)),
    ('massive', dict(ch=28, gap=24, sw=128, arm=86, counter=0.72, bw=148, cb=16)),
    ('shared stem', dict(ch=18, gap=8, sw=88, arm=60, share=True, cb=14)),
    ('step 40', dict(ch=16, gap=48, sw=82, arm=58, step=40, cb=14)),
    ('step 80', dict(ch=18, gap=44, sw=84, arm=58, step=80, cb=14)),
    ('step 120', dict(ch=18, gap=40, sw=86, arm=60, step=120, counter=0.9, cb=14)),
    ('both arms', dict(ch=16, gap=48, sw=80, arm=58, which='both', cb=14)),
    ('arm up', dict(ch=16, gap=48, sw=80, arm=64, which='up', cb=14)),
    ('arm down', dict(ch=16, gap=48, sw=80, arm=64, which='down', cb=14)),
    ('thin arms', dict(ch=18, gap=48, sw=96, arm=36, cb=14)),
    ('counter small', dict(ch=18, gap=40, sw=96, arm=64, counter=0.62, bw=150, cb=14)),
    ('counter open', dict(ch=12, gap=52, sw=70, arm=50, counter=1.05, bw=200, cb=12)),
    ('wide bowl', dict(ch=16, gap=40, sw=76, arm=56, bw=220, cb=14)),
    ('narrow bowl', dict(ch=18, gap=48, sw=88, arm=60, bw=130, counter=0.9, cb=14)),
    ('pointed cap', dict(ch=50, gap=42, sw=108, arm=62, cb=12)),
    ('soft cap', dict(ch=8, gap=52, sw=78, arm=54, cb=8)),
    ('tight heavy', dict(ch=30, gap=18, sw=120, arm=80, counter=0.7, bw=146, cb=14)),
    ('step chamfer', dict(ch=40, gap=36, sw=108, arm=66, step=72, cb=16)),
    ('steep light', dict(ch=12, gap=56, sw=64, arm=44, angle=58, cb=12)),
    ('shallow heavy', dict(ch=26, gap=28, sw=100, arm=70, angle=30, counter=0.85, cb=14)),
    ('low step', dict(ch=20, gap=40, sw=90, arm=62, step=56, cb=16)),
    ('open slot', dict(ch=14, gap=80, sw=72, arm=52, bw=168, cb=12)),
]


def path_of(geom):
    geoms = [geom] if geom.geom_type == 'Polygon' else [g for g in geom.geoms if g.geom_type == 'Polygon']

    def ring(r):
        pts = list(r.coords)
        return 'M ' + ' L '.join(f'{a:.2f} {b:.2f}' for a, b in pts) + ' Z'

    parts = []
    for g in geoms:
        parts.append(ring(g.exterior))
        for hole in g.interiors:
            parts.append(ring(hole))
    return ' '.join(parts)


def svg_mark(geom, fg, bg=None):
    rect = f'<rect width="512" height="512" fill="{bg}"/>' if bg else ''
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'
        f'{rect}<path d="{path_of(geom)}" fill="{fg}" fill-rule="evenodd"/></svg>'
    )


def construction_svg(geom, guides):
    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">',
        f'<rect width="512" height="512" fill="{CREAM}"/>',
    ]
    for g in range(32, 512, 32):
        lines.append(f'<line x1="{g}" y1="8" x2="{g}" y2="504" stroke="{LINE}" stroke-width="1"/>')
        lines.append(f'<line x1="8" y1="{g}" x2="504" y2="{g}" stroke="{LINE}" stroke-width="1"/>')
    # Cap, shoulder, the shared joint, baseline.
    for y in (guides['cap'], guides['shoulder'], guides['joint'], guides['base']):
        lines.append(f'<line x1="20" y1="{y:.1f}" x2="492" y2="{y:.1f}" stroke="{ACCENT}" stroke-width="1.5"/>')
    lines.append(f'<path d="{path_of(geom)}" fill="{INK}"/>')
    lines.append('</svg>')
    return '\n'.join(lines)


def raster(text, path, w, h=None):
    h = w if h is None else h
    subprocess.run(['rsvg-convert', '-w', str(w), '-h', str(h), '-o', path], input=text.encode(), check=True)


def blow(im, factor):
    return im.resize((im.size[0] * factor, im.size[1] * factor), Image.Resampling.NEAREST)


def tracked(draw, xy, text, font, fill, tracking):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking
    return x


def text_width(draw, text, font, tracking):
    return sum(draw.textlength(ch, font=font) + tracking for ch in text) - tracking


def ink_span(img, thresh=140):
    g = img.convert('L')
    px = g.load()
    w, h = g.size
    xs = [x for y in range(h) for x in range(w) if px[x, y] < thresh]
    return (min(xs), max(xs)) if xs else (0, w)


def lockup(mark_img, word_path, bg, fg):
    """Mark over a light wide wordmark. The word is sized to the mark."""
    W = 560
    m = mark_img.resize((360, 360), Image.Resampling.LANCZOS)
    # Measure the mark's ink so the word can match it.
    pasted = Image.new('RGB', (W, 400), bg)
    pasted.paste(m, ((W - 360) // 2, 24))
    left, right = ink_span(pasted)
    target = (right - left) * 1.04
    size = 42
    tracking = 4.0
    word_font = ImageFont.truetype(word_path, size)
    probe = ImageDraw.Draw(Image.new('RGB', (8, 8)))
    while text_width(probe, 'Kyle Beck', word_font, tracking) < target and size < 68:
        size += 2
        word_font = ImageFont.truetype(word_path, size)
    # Ease tracking if the larger size overshoots.
    while text_width(probe, 'Kyle Beck', word_font, tracking) > target + 12 and tracking > 1.5:
        tracking -= 0.25
    width = text_width(probe, 'Kyle Beck', word_font, tracking)
    im = Image.new('RGB', (W, 560), bg)
    im.paste(m, ((W - 360) // 2, 24))
    d = ImageDraw.Draw(im)
    x = (W - width) / 2
    y = 400
    tracked(d, (x, y), 'Kyle Beck', word_font, fg, tracking)
    bbox = d.textbbox((x, y), 'Kyle Beck', font=word_font)
    return im.crop((0, 0, W, bbox[3] + 32))


def header_mock(mark_png, brand, nav):
    scale = 2
    W, H = 820 * scale, 64 * scale
    im = Image.new('RGB', (W, H), (242, 237, 227))
    d = ImageDraw.Draw(im)
    d.line([(0, H - 1), (W, H - 1)], fill=(216, 208, 193), width=scale)
    pad = 20 * scale
    mark = Image.open(mark_png).convert('RGBA')
    ms = 30 * scale
    mark = mark.resize((ms, ms), Image.Resampling.LANCZOS)
    y = (H - ms) // 2
    im.paste(mark, (pad, y), mark)
    d.text((pad + ms + 10 * scale, 14 * scale), 'Kyle Beck', font=brand, fill=(26, 25, 22))
    items = ['Packs', 'Library', 'Tools', 'Contact']
    gap = 20 * scale
    widths = [d.textlength(t, font=nav) for t in items]
    total = sum(widths) + gap * (len(items) - 1)
    x = W - pad - total
    for t, tw in zip(items, widths):
        d.text((x, 20 * scale), t, font=nav, fill=(106, 101, 92))
        x += tw + gap
    return im


def tab_mock(icon16, font):
    s = 4
    w, h = 280 * s, 88 * s
    im = Image.new('RGB', (w, h), (232, 234, 237))
    d = ImageDraw.Draw(im)
    x, y, tw, th = 16 * s, 28 * s, 230 * s, 48 * s
    d.rounded_rectangle([x, y, x + tw, y + th], radius=12 * s, fill=(255, 255, 255))
    icon = icon16.resize((16 * s, 16 * s), Image.Resampling.NEAREST)
    im.paste(icon, (x + 14 * s, y + 16 * s))
    d.text((x + 40 * s, y + 12 * s), 'Kyle Beck', font=font, fill=(31, 29, 26))
    return im


def board(title, large, i64, i32, i16, black, rev, panel, constr, lock, lock_panel, header, tab, font, small):
    margin = 28
    gap = 28
    col = 176
    title_w = int(ImageDraw.Draw(Image.new('RGB', (8, 8))).textlength(title, font=font))
    w = max(margin + 512 + gap + 210, title_w + 48)
    header_s = header.resize((w - 24, int(header.size[1] * (w - 24) / header.size[0])), Image.Resampling.LANCZOS)
    tab_s = tab.resize((w - 24, int(tab.size[1] * (w - 24) / tab.size[0])), Image.Resampling.LANCZOS)
    lock_w = 300
    lock_s = lock.resize((lock_w, int(lock_w * lock.size[1] / lock.size[0])), Image.Resampling.LANCZOS)
    panel_s = lock_panel.resize((lock_w, int(lock_w * lock_panel.size[1] / lock_panel.size[0])), Image.Resampling.LANCZOS)
    y0 = 56
    swatch = 150
    row_h = 22 + swatch
    lock_top = y0 + 512 + 24 + row_h + 28
    lock_h = max(lock_s.size[1], panel_s.size[1])
    head_top = lock_top + 22 + lock_h + 20
    h = head_top + header_s.size[1] + 12 + tab_s.size[1] + 24
    im = Image.new('RGB', (w, h), (242, 237, 227))
    d = ImageDraw.Draw(im)
    d.text((16, 16), title, font=font, fill=(31, 29, 26))
    im.paste(large, (margin, y0))
    x = margin + 512 + gap
    yy = y0
    for label, src, factor in (('64', i64, 2), ('32', i32, 4), ('16', i16, 6)):
        d.text((x, yy), label, font=small, fill=(90, 84, 74))
        im.paste(blow(src, factor), (x, yy + 20))
        yy += 20 + src.size[1] * factor + 16
    by = y0 + 512 + 24
    for i, (label, src) in enumerate((('Black', black), ('Reversed', rev), ('Panel', panel), ('Construction', constr))):
        px = margin + i * col
        d.text((px, by), label, font=small, fill=(90, 84, 74))
        im.paste(src.resize((swatch, swatch), Image.Resampling.LANCZOS), (px, by + 22))
    d.text((margin, lock_top), 'Lockup', font=small, fill=(90, 84, 74))
    d.text((margin + lock_w + 28, lock_top), 'Panel lockup', font=small, fill=(90, 84, 74))
    im.paste(lock_s, (margin, lock_top + 22))
    im.paste(panel_s, (margin + lock_w + 28, lock_top + 22))
    im.paste(header_s, (12, head_top))
    im.paste(tab_s, (12, head_top + header_s.size[1] + 12))
    return im


def contact(rows, font):
    n = len(rows)
    cell = 300
    pad = 24
    w = pad + n * cell
    h = pad + 28 + 250 + 28 + 140 + pad
    im = Image.new('RGB', (w, h), (242, 237, 227))
    d = ImageDraw.Draw(im)
    for i, (name, large, icon16) in enumerate(rows):
        x = pad + i * cell
        d.text((x, pad), name, font=font, fill=(31, 29, 26))
        im.paste(large.resize((240, 240), Image.Resampling.LANCZOS), (x, pad + 28))
        d.text((x, pad + 28 + 248), '16', font=font, fill=(90, 84, 74))
        im.paste(blow(icon16, 8), (x, pad + 28 + 270))
    return im


def sketches(font):
    cols = 6
    cell_w, cell_h = 200, 230
    rows = math.ceil(len(SKETCHES) / cols)
    im = Image.new('RGB', (cols * cell_w, rows * cell_h), (242, 237, 227))
    draw = ImageDraw.Draw(im)
    tmp = '/tmp/r8-sketch.png'
    for i, (name, kw) in enumerate(SKETCHES):
        geom, _guides = kb_geom(**kw)
        raster(svg_mark(geom, INK, CREAM), tmp, 168)
        tile = Image.open(tmp).convert('RGB')
        c, r = i % cols, i // cols
        x, y = c * cell_w, r * cell_h
        draw.text((x + 10, y + 8), name, font=font, fill=(90, 84, 74))
        im.paste(tile, (x + 16, y + 32))
    im.save(os.path.join(ROOT, 'sketches.png'))


def ascii16(path):
    im = Image.open(path).convert('L')
    px = im.load()
    lines = []
    for y in range(im.size[1]):
        lines.append(''.join('#' if px[x, y] < 150 else '.' for x in range(im.size[0])))
    return '\n'.join(lines)


def main():
    board_path = font_file('/tmp/Archivo-Board.ttf', 520, 100)
    brand_path = font_file('/tmp/Archivo-Brand.ttf', 750, 125)
    nav_path = font_file('/tmp/Archivo-Nav.ttf', 450, 100)
    word_path = josefin()
    font = ImageFont.truetype(board_path, 22)
    small = ImageFont.truetype(board_path, 16)
    brand = ImageFont.truetype(brand_path, 37)
    nav = ImageFont.truetype(nav_path, 30)
    rows = []
    for slug, idea, kw in MARKS:
        folder = os.path.join(ROOT, slug)
        os.makedirs(folder, exist_ok=True)
        geom, guides = kb_geom(**kw)
        color = svg_mark(geom, INK, CREAM)
        black = svg_mark(geom, BLACK, WHITE)
        rev = svg_mark(geom, CREAM, INK)
        panel = svg_mark(geom, GREY, PANEL)
        clear = svg_mark(geom, INK, None)
        open(os.path.join(folder, 'mark.svg'), 'w').write(color)
        open(os.path.join(folder, 'black.svg'), 'w').write(black)
        open(os.path.join(folder, 'reversed.svg'), 'w').write(rev)
        open(os.path.join(folder, 'panel.svg'), 'w').write(panel)
        cons = construction_svg(geom, guides)
        open(os.path.join(folder, 'construction.svg'), 'w').write(cons)
        files = {
            '512.png': (color, 512),
            '64.png': (color, 64),
            '32.png': (color, 32),
            '16.png': (color, 16),
            'black.png': (black, 512),
            'reversed.png': (rev, 512),
            'panel.png': (panel, 512),
        }
        for name, (text, size) in files.items():
            raster(text, os.path.join(folder, name), size)
        raster(cons, os.path.join(folder, 'construction.png'), 512)
        raster(clear, os.path.join(folder, 'header-icon.png'), 120)
        large = Image.open(os.path.join(folder, '512.png')).convert('RGB')
        panel_img = Image.open(os.path.join(folder, 'panel.png')).convert('RGB')
        lock = lockup(large, word_path, (242, 237, 227), (31, 29, 26))
        lock.save(os.path.join(folder, 'lockup.png'))
        lock_panel = lockup(panel_img, word_path, (20, 19, 17), (230, 230, 230))
        lock_panel.save(os.path.join(folder, 'lockup-panel.png'))
        header = header_mock(os.path.join(folder, 'header-icon.png'), brand, nav)
        header.save(os.path.join(folder, 'header.png'))
        icon16 = Image.open(os.path.join(folder, '16.png')).convert('RGB')
        tab = tab_mock(icon16, font)
        tab.save(os.path.join(folder, 'tab.png'))
        board(
            idea, large,
            Image.open(os.path.join(folder, '64.png')).convert('RGB'),
            Image.open(os.path.join(folder, '32.png')).convert('RGB'),
            icon16,
            Image.open(os.path.join(folder, 'black.png')).convert('RGB'),
            Image.open(os.path.join(folder, 'reversed.png')).convert('RGB'),
            panel_img,
            Image.open(os.path.join(folder, 'construction.png')).convert('RGB'),
            lock, lock_panel, header, tab, font, small,
        ).save(os.path.join(folder, 'board.png'))
        with open(os.path.join(folder, 'idea.txt'), 'w') as handle:
            handle.write(idea + '\n')
        rows.append((slug.split('-', 1)[1].capitalize(), large, icon16))
        print(slug)
        print(ascii16(os.path.join(folder, '16.png')))
    contact(rows, small).save(os.path.join(ROOT, 'contact.png'))
    sketches(small)
    print('contact', 'sketches', len(SKETCHES))


if __name__ == '__main__':
    main()
