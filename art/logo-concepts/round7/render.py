"""Round 7. Four waveform marks, kept from 48 sketches.

Run: python3 art/logo-concepts/round7/render.py
Does not replace the live favicon.
"""
import math
import os
import subprocess
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import LineString, box

ROOT = os.path.dirname(os.path.abspath(__file__))
CREAM = '#F2EDE3'
INK = '#1F1D1A'
BLACK = '#000000'
WHITE = '#FFFFFF'
ACCENT = '#D4421C'
LINE = '#D8D0C1'


def font_file(path, wght, wdth):
    if os.path.exists(path):
        return path
    src = os.path.abspath(os.path.join(ROOT, '..', '..', '..', 'fonts', 'archivo', 'archivo-latin-wdth-normal.woff2'))
    font = TTFont(src)
    inst = instantiateVariableFont(font, {'wght': wght, 'wdth': wdth}, inplace=False)
    inst.flavor = None
    inst.save(path)
    return path


def svg_doc(body, bg):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'
        f'<rect width="512" height="512" fill="{bg}"/>{body}</svg>'
    )


def stroke(d, w, color, cap='round', join='round'):
    return (
        f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" '
        f'stroke-linecap="{cap}" stroke-linejoin="{join}"/>'
    )


def poly(pts):
    return 'M ' + ' L '.join(f'{x:.2f} {y:.2f}' for x, y in pts)


def sine_pts(x0, x1, y, amp, n=96, shape='sine'):
    pts = []
    for i in range(n + 1):
        t = i / n
        x = x0 + (x1 - x0) * t
        s = math.sin(2 * math.pi * t)
        if shape == 'sine':
            v = s
        elif shape == 'mid':
            v = 0.55 * s + 0.45 * math.tanh(s * 2.2)
        else:
            v = math.tanh(s * 8.0)
        pts.append((x, y - v * amp))
    return pts


def ring_path(ring):
    pts = list(ring.coords)
    return 'M ' + ' L '.join(f'{x:.2f} {y:.2f}' for x, y in pts) + ' Z'


def path_of(geom):
    geoms = [geom] if geom.geom_type == 'Polygon' else [g for g in geom.geoms if g.geom_type == 'Polygon']
    parts = []
    for g in geoms:
        parts.append(ring_path(g.exterior))
        for hole in g.interiors:
            parts.append(ring_path(hole))
    return ' '.join(parts)


# --- marks -----------------------------------------------------------------

def slot(fg, accent):
    # One cycle cut through a square. Width comes from a round buffer,
    # so the slopes stay as open as the peaks. The line runs past the
    # square so the cut breaks both sides at full width.
    sq = box(72, 72, 440, 440)
    line = LineString(sine_pts(24, 488, 256, 96, n=80))
    # Half-width 30. Curvature at the crest is about 50, so this does not fold.
    cut = line.buffer(30, cap_style='flat', join_style='round', resolution=8)
    return f'<path d="{path_of(sq.difference(cut))}" fill="{fg}" fill-rule="evenodd"/>'


def cell(fg, accent):
    # Wide frame, one cycle at full scale. The trace is the accent.
    # Frame stroke sits on the rect centerline. Wave stroke is 4px
    # lighter than the frame so the trace reads as the signal.
    frame = '<rect x="48" y="148" width="416" height="216" fill="none" stroke="{c}" stroke-width="36"/>'.format(c=fg)
    # Amplitude stays inside the frame. Stroke half plus amplitude
    # is 78, and the inner frame half is 90.
    pts = sine_pts(108, 404, 256, 58)
    return frame + stroke(poly(pts), 40, accent)


def stack(fg, accent):
    # Three single-cycle frames. Top is a sine, bottom has started to square.
    # Middle is the accent, as on the Chordspeak cover.
    body = ''
    specs = (
        (118, 'sine', fg),
        (256, 'mid', accent),
        (394, 'square', fg),
    )
    for y, shape, color in specs:
        pts = sine_pts(72, 440, y, 42, shape=shape)
        body += stroke(poly(pts), 34, color)
    return body


def clip(fg, accent):
    # A half cycle sitting on a rail. The arch is a sine, not a peak.
    pts = [(44, 318)]
    n = 64
    for i in range(n + 1):
        t = i / n
        x = 120 + t * 270
        y = 318 - math.sin(math.pi * t) * 168
        pts.append((x, y))
    pts.append((468, 318))
    return stroke(poly(pts), 52, fg)


def construction_slot():
    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">',
        f'<rect width="512" height="512" fill="{CREAM}"/>',
    ]
    for g in range(32, 512, 32):
        lines.append(f'<line x1="{g}" y1="32" x2="{g}" y2="480" stroke="{LINE}" stroke-width="1"/>')
        lines.append(f'<line x1="32" y1="{g}" x2="480" y2="{g}" stroke="{LINE}" stroke-width="1"/>')
    lines.append(slot(INK, ACCENT))
    pts = sine_pts(72, 440, 256, 96)
    lines.append(stroke(poly(pts), 2, ACCENT))
    lines.append(f'<rect x="72" y="72" width="368" height="368" fill="none" stroke="{ACCENT}" stroke-width="1.5"/>')
    lines.append('</svg>')
    return '\n'.join(lines)


def construction_cell():
    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">',
        f'<rect width="512" height="512" fill="{CREAM}"/>',
    ]
    for g in range(32, 512, 32):
        lines.append(f'<line x1="{g}" y1="32" x2="{g}" y2="480" stroke="{LINE}" stroke-width="1"/>')
        lines.append(f'<line x1="32" y1="{g}" x2="480" y2="{g}" stroke="{LINE}" stroke-width="1"/>')
    lines.append(cell(INK, ACCENT))
    lines.append(f'<line x1="96" y1="256" x2="416" y2="256" stroke="{ACCENT}" stroke-width="1.5"/>')
    lines.append(f'<line x1="256" y1="178" x2="256" y2="334" stroke="{ACCENT}" stroke-width="1.5"/>')
    lines.append('</svg>')
    return '\n'.join(lines)


def construction_stack():
    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">',
        f'<rect width="512" height="512" fill="{CREAM}"/>',
    ]
    for g in range(32, 512, 32):
        lines.append(f'<line x1="{g}" y1="32" x2="{g}" y2="480" stroke="{LINE}" stroke-width="1"/>')
        lines.append(f'<line x1="32" y1="{g}" x2="480" y2="{g}" stroke="{LINE}" stroke-width="1"/>')
    lines.append(stack(INK, ACCENT))
    for y in (118, 256, 394):
        lines.append(f'<line x1="72" y1="{y}" x2="440" y2="{y}" stroke="{ACCENT}" stroke-width="1.25"/>')
    lines.append('</svg>')
    return '\n'.join(lines)


def construction_clip():
    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">',
        f'<rect width="512" height="512" fill="{CREAM}"/>',
    ]
    for g in range(32, 512, 32):
        lines.append(f'<line x1="{g}" y1="32" x2="{g}" y2="480" stroke="{LINE}" stroke-width="1"/>')
        lines.append(f'<line x1="32" y1="{g}" x2="480" y2="{g}" stroke="{LINE}" stroke-width="1"/>')
    # The unclipped sine, then the rail, then the mark.
    raw = []
    for i in range(65):
        t = i / 64
        raw.append((120 + t * 270, 318 - math.sin(math.pi * t) * 168))
    lines.append(stroke(poly(raw), 2, ACCENT))
    lines.append(f'<line x1="44" y1="318" x2="468" y2="318" stroke="{ACCENT}" stroke-width="1.5" stroke-dasharray="6 5"/>')
    lines.append(clip(INK, ACCENT))
    lines.append('</svg>')
    return '\n'.join(lines)


MODES = {
    'color': (INK, CREAM, ACCENT),
    'black': (BLACK, WHITE, BLACK),
    'reversed': (CREAM, INK, CREAM),
}

MARKS = [
    ('01-slot', 'One cycle, cut through a square.', slot, construction_slot),
    ('02-cell', 'One cycle at full scale, inside the frame.', cell, construction_cell),
    ('03-stack', 'Three frames of a table. The middle one is moving toward a square.', stack, construction_stack),
    ('04-clip', 'One cycle, the bottom half held flat.', clip, construction_clip),
]


def raster(text, path, w, h=None):
    h = w if h is None else h
    subprocess.run(['rsvg-convert', '-w', str(w), '-h', str(h), '-o', path], input=text.encode(), check=True)


def blow(im, factor):
    return im.resize((im.size[0] * factor, im.size[1] * factor), Image.Resampling.NEAREST)


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


def board(title, large, i64, i32, i16, black, rev, constr, header, tab, font, small):
    gap = 24
    col = 200
    left = 36
    w = left + 512 + gap + col + 24
    header_s = header.resize((w - 36, int(header.size[1] * (w - 36) / header.size[0])), Image.Resampling.LANCZOS)
    tab_s = tab.resize((w - 36, int(tab.size[1] * (w - 36) / tab.size[0])), Image.Resampling.LANCZOS)
    constr_s = constr.resize((360, 360), Image.Resampling.LANCZOS)
    y = 56
    h = y + 512 + 28 + 360 + 24 + header_s.size[1] + 16 + tab_s.size[1] + 28
    im = Image.new('RGB', (w, h), (242, 237, 227))
    d = ImageDraw.Draw(im)
    d.text((18, 16), title, font=font, fill=(31, 29, 26))
    im.paste(large, (left, y))
    x = left + 512 + gap
    yy = y
    for label, ims, factor in (('64', i64, 2), ('32', i32, 4), ('16', i16, 6)):
        d.text((x, yy), label, font=small, fill=(90, 84, 74))
        im.paste(blow(ims, factor), (x, yy + 22))
        yy += 22 + ims.size[1] * factor + 16
    by = y + 512 + 16
    d.text((left, by), 'Black', font=small, fill=(90, 84, 74))
    d.text((left + 180, by), 'Reversed', font=small, fill=(90, 84, 74))
    im.paste(black.resize((160, 160), Image.Resampling.LANCZOS), (left, by + 24))
    im.paste(rev.resize((160, 160), Image.Resampling.LANCZOS), (left + 180, by + 24))
    d.text((left + 360, by), 'Construction', font=small, fill=(90, 84, 74))
    im.paste(constr_s, (left + 360, by + 24))
    hy = by + 24 + 360 + 20
    im.paste(header_s, (18, hy))
    im.paste(tab_s, (18, hy + header_s.size[1] + 16))
    return im


def contact(rows, font):
    n = len(rows)
    cell_w = 280
    pad = 28
    w = pad + n * cell_w
    h = pad + 28 + 240 + 36 + 16 * 8 + pad
    im = Image.new('RGB', (w, h), (242, 237, 227))
    d = ImageDraw.Draw(im)
    for i, (name, large, icon16) in enumerate(rows):
        x = pad + i * cell_w
        d.text((x, pad), name, font=font, fill=(31, 29, 26))
        im.paste(large.resize((240, 240), Image.Resampling.LANCZOS), (x, pad + 28))
        d.text((x, pad + 28 + 240 + 8), '16', font=font, fill=(90, 84, 74))
        im.paste(blow(icon16, 8), (x, pad + 28 + 240 + 32))
    return im


def main():
    board_font_path = font_file('/tmp/Archivo-Board.ttf', 520, 100)
    brand_path = font_file('/tmp/Archivo-Brand.ttf', 750, 125)
    nav_path = font_file('/tmp/Archivo-Nav.ttf', 450, 100)
    font = ImageFont.truetype(board_font_path, 22)
    small = ImageFont.truetype(board_font_path, 16)
    brand = ImageFont.truetype(brand_path, 37)
    nav = ImageFont.truetype(nav_path, 30)
    rows = []
    for slug, idea, draw, diagram in MARKS:
        folder = os.path.join(ROOT, slug)
        os.makedirs(folder, exist_ok=True)
        color = svg_doc(draw(INK, ACCENT), CREAM)
        black = svg_doc(draw(BLACK, BLACK), WHITE)
        rev = svg_doc(draw(CREAM, CREAM), INK)
        open(os.path.join(folder, 'mark.svg'), 'w').write(color)
        open(os.path.join(folder, 'black.svg'), 'w').write(black)
        open(os.path.join(folder, 'reversed.svg'), 'w').write(rev)
        cons = diagram()
        open(os.path.join(folder, 'construction.svg'), 'w').write(cons)
        for name, text, size in (
            ('512.png', color, 512),
            ('64.png', color, 64),
            ('32.png', color, 32),
            ('16.png', color, 16),
            ('black.png', black, 512),
            ('reversed.png', rev, 512),
        ):
            raster(text, os.path.join(folder, name), size)
        raster(cons, os.path.join(folder, 'construction.png'), 512)
        header_icon = os.path.join(folder, 'header-icon.png')
        raster(color, header_icon, 60)
        header = header_mock(header_icon, brand, nav)
        header.save(os.path.join(folder, 'header.png'))
        icon16 = Image.open(os.path.join(folder, '16.png')).convert('RGB')
        tab = tab_mock(icon16, font)
        tab.save(os.path.join(folder, 'tab.png'))
        large = Image.open(os.path.join(folder, '512.png')).convert('RGB')
        board(
            idea, large,
            Image.open(os.path.join(folder, '64.png')).convert('RGB'),
            Image.open(os.path.join(folder, '32.png')).convert('RGB'),
            icon16,
            Image.open(os.path.join(folder, 'black.png')).convert('RGB'),
            Image.open(os.path.join(folder, 'reversed.png')).convert('RGB'),
            Image.open(os.path.join(folder, 'construction.png')).convert('RGB'),
            header, tab, font, small,
        ).save(os.path.join(folder, 'board.png'))
        with open(os.path.join(folder, 'idea.txt'), 'w') as handle:
            handle.write(idea + '\n')
        rows.append((slug.split('-', 1)[1].capitalize(), large, icon16))
        im = icon16.convert('L')
        px = im.load()
        print(slug)
        for yy in range(16):
            print(''.join('#' if px[x, yy] < 150 else '.' for x in range(16)))
    contact(rows, small).save(os.path.join(ROOT, 'contact.png'))
    print('contact')


if __name__ == '__main__':
    main()
