"""Round 5 marks. Ten concepts kept from 46 sketches.

Cut: plain cables and faders (they turned into icons), a sine-in-a-circle,
repeat marks, anything that only worked with a caption, and letterforms
that fell apart at 16px.

Does not replace the live favicon. Run: python3 art/logo-concepts/round5/render.py
"""
import os
import subprocess
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image, ImageDraw, ImageFont
from shapely.affinity import scale, translate
from shapely.geometry import LineString, Point, box
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.abspath(__file__))
CREAM = '#F2EDE3'
INK = '#1F1D1A'
ACCENT = '#D4421C'
ONE = '#141414'
PAPER = '#FFFFFF'
FONT_PATH = '/tmp/Archivo-Board.ttf'


def ensure_font():
    if os.path.exists(FONT_PATH):
        return
    src = os.path.join(ROOT, '..', '..', '..', 'fonts', 'archivo', 'archivo-latin-wdth-normal.woff2')
    font = TTFont(os.path.abspath(src))
    inst = instantiateVariableFont(font, {'wght': 520, 'wdth': 100}, inplace=False)
    inst.flavor = None
    inst.save(FONT_PATH)


def stroke(pts, width, cap='square', join='mitre', limit=2.4):
    return LineString(pts).buffer(width / 2.0, cap_style=cap, join_style=join, mitre_limit=limit, resolution=24)


def disk(cx, cy, r):
    return Point(cx, cy).buffer(r, resolution=80)


def ring(cx, cy, r, width):
    return disk(cx, cy, r + width / 2.0).difference(disk(cx, cy, r - width / 2.0))


def clip_left(geom, x):
    return geom.intersection(box(x - 0.2, -200, 900, 900))


def arm(p0, p1, width, left):
    """Diagonal buried in a stem. The cap cannot stick out past `left`."""
    return clip_left(stroke([p0, p1], width), left)


def center(geom, nudge=(0, 0)):
    minx, miny, maxx, maxy = geom.bounds
    dx = (512 - (minx + maxx)) / 2.0 + nudge[0]
    dy = (512 - (miny + maxy)) / 2.0 + nudge[1]
    return translate(geom, dx, dy)


def path_of(geom):
    if geom.is_empty:
        return ''
    geoms = [geom] if geom.geom_type == 'Polygon' else [g for g in geom.geoms if g.geom_type == 'Polygon']

    def ring(r):
        pts = list(r.coords)
        head = f'M{pts[0][0]:.1f} {pts[0][1]:.1f}'
        rest = ' '.join(f'L{x:.1f} {y:.1f}' for x, y in pts[1:])
        return head + ' ' + rest + ' Z'

    parts = []
    for g in geoms:
        parts.append(ring(g.exterior))
        for hole in g.interiors:
            parts.append(ring(hole))
    return ' '.join(parts)


def svg(geom, bg, fg):
    rule = 'evenodd' if any(g.interiors for g in ([geom] if geom.geom_type == 'Polygon' else geom.geoms)) else 'nonzero'
    body = f'<path d="{path_of(geom)}" fill="{fg}" fill-rule="{rule}"/>'
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'
        f'<rect width="512" height="512" fill="{bg}"/>{body}</svg>'
    )


# --- marks -----------------------------------------------------------------

def cutoff():
    # Flat top is the passband. The diagonal is the rolloff. Together, a K.
    w = 70
    stem = stroke([(168, 408), (168, 108), (412, 108)], w, limit=1.6)
    slope = arm((168, 252), (412, 396), w * 1.08, 168 - w / 2)
    return center(unary_union([stem, slope]), nudge=(0, 2))


def adsr():
    # Attack rises to a sustain shelf. The lower arm is the release. Still a K.
    w = 66
    left = 156 - w / 2
    stem = stroke([(156, 108), (156, 412)], w)
    attack = stroke([(156, 262), (292, 108), (448, 108)], w, limit=1.8)
    attack = clip_left(attack, left)
    release = arm((156, 262), (418, 400), w * 1.06, left)
    return center(unary_union([stem, attack, release]))


def wave():
    # Drawn on a 16px grid so the counters are real pixels, then scaled.
    # A square wave with two levels, which is also a B.
    rows = [
        '................',
        '.#######........',
        '.##...##........',
        '.##...##........',
        '.##...##........',
        '.#######........',
        '.##.............',
        '.##########.....',
        '.##.....##......',
        '.##.....##......',
        '.##.....##......',
        '.##.....##......',
        '.##########.....',
        '................',
        '................',
        '................',
    ]
    s = 32
    blocks = []
    for y, row in enumerate(rows):
        x = 0
        while x < len(row):
            if row[x] == '#':
                x1 = x
                while x < len(row) and row[x] == '#':
                    x += 1
                blocks.append(box(x1 * s, y * s, x * s, (y + 1) * s))
            else:
                x += 1
    return center(unary_union(blocks))


def saw():
    # A sawtooth period is already an N. Flat ends, diagonal buried in both stems.
    w = 68
    left_x, right_x = 156, 356
    top, bot = 112, 400
    left = stroke([(left_x, top), (left_x, bot)], w)
    right = stroke([(right_x, top), (right_x, bot)], w)
    diag = stroke([(left_x - 30, top - 20), (right_x + 30, bot + 20)], w * 1.06)
    outer = box(left_x - w / 2.0, top - w / 2.0, right_x + w / 2.0, bot + w / 2.0)
    return center(unary_union([left, right, diag.intersection(outer)]))


def knob():
    # A dial. The tick sits on the ring, at about one o'clock.
    # Not recentered: the tick must not shove the circle off center.
    import math
    body = ring(256, 256, 150, 66)
    ang = math.radians(62)
    r0, r1 = 118, 212
    x0, y0 = 256 + r0 * math.cos(ang), 256 - r0 * math.sin(ang)
    x1, y1 = 256 + r1 * math.cos(ang), 256 - r1 * math.sin(ang)
    tick = stroke([(x0, y0), (x1, y1)], 56)
    return unary_union([body, tick])


def keys():
    # Wide, narrow, wide. White key, black key, white key. Also Morse K.
    h = 344
    y = (512 - h) / 2.0
    widths = (124, 64, 124)
    gap = 44
    span = sum(widths) + gap * 2
    x = (512 - span) / 2.0
    bars = []
    for w in widths:
        bars.append(box(x, y, x + w, y + h))
        x += w + gap
    return unary_union(bars)


def _k(x, top, bot, stem_w, arm_w):
    joint = top + (bot - top) * 0.47
    left = x - stem_w / 2.0
    stem = stroke([(x, top), (x, bot)], stem_w)
    reach = (bot - top) * 0.46
    up = arm((x, joint), (x + reach, top + stem_w * 0.35), arm_w, left)
    lo = arm((x, joint + stem_w * 0.08), (x + reach * 1.08, bot - stem_w * 0.28), arm_w * 1.04, left)
    return unary_union([stem, up, lo])


def _fit(geom, cx, cy, size):
    minx, miny, maxx, maxy = geom.bounds
    factor = size / max(maxx - minx, maxy - miny)
    g = scale(geom, factor, factor, origin=(minx, miny))
    minx, miny, maxx, maxy = g.bounds
    return translate(g, cx - (minx + maxx) / 2.0, cy - (miny + maxy) / 2.0)


def seal():
    # A record-label stamp. The K is cut out of the disk, and stays inside it.
    k = _fit(_k(0, 0, 300, 78, 70), 270, 260, 308)
    return disk(256, 256, 220).difference(k)


def kb():
    # Custom lowercase. Bowl on the x-height, square on purpose, not a font.
    cap_top, base = 88, 412
    stem_w = 70
    wall = 54
    kx = 56
    k_stem = stroke([(kx, cap_top), (kx, base)], stem_w)
    left = kx - stem_w / 2
    joint = 246
    # Arms stop well short of the b.
    up = arm((kx, joint), (150, 104), 58, left)
    lo = arm((kx, joint + 12), (158, 396), 60, left)
    bx = 268
    b_stem = stroke([(bx, cap_top), (bx, base)], stem_w)
    bowl_top, bowl_bot = 208, 428
    outer = box(bx - 2, bowl_top, bx + 196, bowl_bot)
    inner = box(bx + stem_w / 2 + 8, bowl_top + wall, bx + 196 - wall, bowl_bot - wall)
    bowl = outer.difference(inner)
    return center(unary_union([k_stem, up, lo, b_stem, bowl]))


def sync():
    # Hard sync. The right stem of the h falls past the cycle.
    w = 72
    left = stroke([(168, 104), (168, 352)], w)
    bar = stroke([(168, 196), (332, 196), (332, 448)], w, limit=1.5)
    bar = clip_left(bar, 168 - w / 2)
    return center(unary_union([left, bar]))


def line():
    # One stroke. Down the stem, then a bowl that stops short of the stem.
    import math
    w = 60
    cx, cy, r = 188, 300, 156
    pts = [(cx, 86), (cx, cy + r)]
    # Bottom of the circle, around to the upper right, gap left open.
    for i in range(1, 34):
        a = math.radians(90 - i * 4.35)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return center(stroke(pts, w, cap='round', join='round'))


MARKS = [
    ('01-cutoff', 'A K whose flat top is the passband, and whose arm is the rolloff.', cutoff),
    ('02-adsr', 'A K with a shelf at the peak: attack, sustain, release.', adsr),
    ('03-wave', 'A square wave closed up so its two counters are a B.', wave),
    ('04-saw', 'One sawtooth period. It is also the letter N.', saw),
    ('05-knob', 'A dial with the pointer at one o\'clock.', knob),
    ('06-keys', 'Wide, narrow, wide: a black key between two whites, and Morse K.', keys),
    ('07-seal', 'A label stamp: K cut out of a disk.', seal),
    ('08-kb', 'Custom kb. The bowl sits on the x-height.', kb),
    ('09-sync', 'Hard sync: the right stem of an h restarts past the cycle.', sync),
    ('10-line', 'A b in one stroke. The bowl stops short of closing.', line),
]


def raster(text, path, size):
    subprocess.run(
        ['rsvg-convert', '-w', str(size), '-h', str(size), '-o', path],
        input=text.encode(),
        check=True,
    )


def blow(im, factor):
    return im.resize((im.size[0] * factor, im.size[1] * factor), Image.Resampling.NEAREST)


def tab_mock(icon16, font):
    scale_n = 4
    w, h = 280 * scale_n, 88 * scale_n
    im = Image.new('RGB', (w, h), (232, 234, 237))
    d = ImageDraw.Draw(im)
    x, y, tw, th = 16 * scale_n, 28 * scale_n, 230 * scale_n, 48 * scale_n
    d.rounded_rectangle([x, y, x + tw, y + th], radius=12 * scale_n, fill=(255, 255, 255))
    icon = icon16.resize((16 * scale_n, 16 * scale_n), Image.Resampling.NEAREST)
    im.paste(icon, (x + 14 * scale_n, y + 16 * scale_n))
    d.text((x + 40 * scale_n, y + 11 * scale_n), 'Kyle Beck', font=font, fill=(31, 29, 26))
    return im


def board(title, large, icon32, icon16, one, tab, font, small):
    gap = 28
    w = 36 + 512 + gap + 220
    tab_s = tab.resize((w - 36, int(tab.size[1] * (w - 36) / tab.size[0])), Image.Resampling.LANCZOS)
    h = 64 + 512 + 28 + tab_s.size[1] + 28
    im = Image.new('RGB', (w, h), (242, 237, 227))
    d = ImageDraw.Draw(im)
    d.text((18, 18), title, font=font, fill=(31, 29, 26))
    im.paste(large, (18, 64))
    x = 18 + 512 + gap
    y = 64
    d.text((x, y), '32', font=small, fill=(90, 84, 74))
    im.paste(blow(icon32, 4), (x, y + 28))
    d.text((x, y + 176), '16', font=small, fill=(90, 84, 74))
    im.paste(blow(icon16, 8), (x, y + 204))
    d.text((x, y + 352), 'one color', font=small, fill=(90, 84, 74))
    im.paste(one.resize((96, 96), Image.Resampling.LANCZOS), (x, y + 380))
    im.paste(tab_s, (18, 64 + 512 + 28))
    return im


def contact(entries, font, small):
    # entries: list of (slug, idea, large Image, icon16 Image)
    n = len(entries)
    cell = 248
    pad = 28
    label_h = 36
    w = pad + n * cell
    h = pad + label_h + 220 + 24 + 20 + 16 * 6 + pad
    im = Image.new('RGB', (w, h), (242, 237, 227))
    d = ImageDraw.Draw(im)
    for i, (slug, idea, large, icon16) in enumerate(entries):
        x = pad + i * cell
        name = slug.split('-', 1)[1]
        d.text((x, pad), name, font=small, fill=(31, 29, 26))
        thumb = large.resize((220, 220), Image.Resampling.LANCZOS)
        im.paste(thumb, (x, pad + label_h))
        d.text((x, pad + label_h + 220 + 8), '16', font=small, fill=(90, 84, 74))
        im.paste(blow(icon16, 6), (x, pad + label_h + 220 + 32))
    return im


def ascii16(path):
    im = Image.open(path).convert('L')
    px = im.load()
    rows = []
    for y in range(16):
        rows.append(''.join('#' if px[x, y] < 168 else '.' for x in range(16)))
    return '\n'.join(rows)


def main():
    ensure_font()
    font = ImageFont.truetype(FONT_PATH, 22)
    small = ImageFont.truetype(FONT_PATH, 18)
    sheet_rows = []
    for slug, idea, draw in MARKS:
        folder = os.path.join(ROOT, slug)
        os.makedirs(folder, exist_ok=True)
        geom = draw()
        color_svg = svg(geom, CREAM, ACCENT if slug == '07-seal' else INK)
        one_svg = svg(geom, PAPER, ONE)
        open(os.path.join(folder, 'mark.svg'), 'w').write(color_svg)
        open(os.path.join(folder, 'one-color.svg'), 'w').write(one_svg)
        large_path = os.path.join(folder, '512.png')
        raster(color_svg, large_path, 512)
        raster(color_svg, os.path.join(folder, '32.png'), 32)
        raster(color_svg, os.path.join(folder, '16.png'), 16)
        raster(one_svg, os.path.join(folder, 'one-color.png'), 512)
        icon32 = Image.open(os.path.join(folder, '32.png')).convert('RGB')
        icon16 = Image.open(os.path.join(folder, '16.png')).convert('RGB')
        one = Image.open(os.path.join(folder, 'one-color.png')).convert('RGB')
        tab = tab_mock(icon16, font)
        tab.save(os.path.join(folder, 'tab.png'))
        board(idea, Image.open(large_path).convert('RGB'), icon32, icon16, one, tab, font, small).save(
            os.path.join(folder, 'board.png')
        )
        with open(os.path.join(folder, 'idea.txt'), 'w') as handle:
            handle.write(idea + '\n')
        print(slug)
        print(ascii16(os.path.join(folder, '16.png')))
        print()
        sheet_rows.append((slug, idea, Image.open(large_path).convert('RGB'), icon16))
    contact(sheet_rows, font, small).save(os.path.join(ROOT, 'contact.png'))
    print('contact')


if __name__ == '__main__':
    main()
