"""Round 6. Four abstract marks. No letters.

Run: python3 art/logo-concepts/round6/render.py
Does not replace the live favicon.
"""
import math
import os
import subprocess
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import Point, box, Polygon

ROOT = os.path.dirname(os.path.abspath(__file__))
CREAM = '#F2EDE3'
INK = '#1F1D1A'
BLACK = '#000000'
WHITE = '#FFFFFF'
ACCENT = '#D4421C'
LINE = '#D8D0C1'
MUTED = '#6A655C'
GRID = 32


def font_file(path, wght, wdth):
    if os.path.exists(path):
        return path
    src = os.path.abspath(os.path.join(ROOT, '..', '..', '..', 'fonts', 'archivo', 'archivo-latin-wdth-normal.woff2'))
    font = TTFont(src)
    inst = instantiateVariableFont(font, {'wght': wght, 'wdth': wdth}, inplace=False)
    inst.flavor = None
    inst.save(path)
    return path


def disk(cx, cy, r):
    return Point(cx, cy).buffer(r, resolution=128)


def ring_path(ring):
    pts = list(ring.coords)
    return f'M{pts[0][0]:.2f} {pts[0][1]:.2f} ' + ' '.join(f'L{x:.2f} {y:.2f}' for x, y in pts[1:]) + ' Z'


def path_of(geom):
    geoms = [geom] if geom.geom_type == 'Polygon' else [g for g in geom.geoms if g.geom_type == 'Polygon']
    parts = []
    for g in geoms:
        parts.append(ring_path(g.exterior))
        for hole in g.interiors:
            parts.append(ring_path(hole))
    return ' '.join(parts)


def svg_mark(geom, fg, bg, size=512):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 512 512">'
        f'<rect width="512" height="512" fill="{bg}"/>'
        f'<path d="{path_of(geom)}" fill="{fg}" fill-rule="evenodd"/></svg>'
    )


# --- geometry --------------------------------------------------------------
# Grid is 32. Corrections are stated in each function.

def node():
    """Second mode of a bar. Ends full, middle still.
    The cosine meets the flat end at a right angle, so the cap needs no spur.
    """
    pts_a, pts_b = [], []
    n = 120
    left, right = 56, 456
    end_half = 132.0
    pinch = 0.36
    for i in range(n + 1):
        t = i / n
        x = left + t * (right - left)
        env = pinch + (1 - pinch) * 0.5 * (1 + math.cos(2 * math.pi * t))
        half = end_half * env
        pts_a.append((x, 256 - half))
        pts_b.append((x, 256 + half))
    return Polygon(pts_a + pts_b[::-1])


def bore():
    """Octave. True inner radius is half of 208, which is 104.
    A hole reads small, so it is drawn at 112. Offset is 32.
    Thin wall 64, thick wall 128.
    """
    # R 208, drawn hole 112 (true octave is 104), offset 32.
    # Thin wall 64, thick wall 128.
    return disk(256, 256, 208).difference(disk(256 + 32, 256, 112))


def peak():
    """One resonance. Wide, so it is not an eye.
    The flat ends are the curve itself, with no added spur.
    """
    pts_a, pts_b = [], []
    n = 100
    left, right = 48, 464
    for i in range(n + 1):
        t = i / n
        x = left + t * (right - left)
        u = (t - 0.5) * 3.4
        env = 1 / (1 + u * u)
        half = 22 + 100 * env
        pts_a.append((x, 256 - half))
        pts_b.append((x, 256 + half))
    return Polygon(pts_a + pts_b[::-1])


def plate():
    """Square plate, arcs through the side corners, waist on center.
    A concave square looks taller than it is, so the square is 16px
    wider than it is tall.
    """
    left, right = 48, 464
    top, bot = 56, 456
    mid = 256
    depth = 108
    # Circle through both left corners and the waist point.
    y_span = (mid - top)
    # Solve center on the horizontal midline.
    # (cx-left)^2 + y_span^2 = (cx - (left+depth))^2
    # Expand: cx^2 - 2 cx left + left^2 + y^2 = cx^2 - 2 cx (left+depth) + (left+depth)^2
    waist_x = left + depth
    #  -2 cx left + left^2 + y^2 = -2 cx waist_x + waist_x^2
    # cx * 2 * (waist_x - left) = waist_x^2 - left^2 - y_span^2
    cx = (waist_x ** 2 - left ** 2 - y_span ** 2) / (2 * (waist_x - left))
    r = abs(cx - waist_x)
    right_cx = right + (left - cx)
    sq = box(left, top, right, bot)
    return sq.difference(disk(cx, mid, r)).difference(disk(right_cx, mid, r)), (cx, mid, r, right_cx)


def plate_geom():
    g, _ = plate()
    return g


# --- construction diagrams -------------------------------------------------

def empty_svg(w, h, bg=CREAM):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">',
            f'<rect width="{w}" height="{h}" fill="{bg}"/>']


def grid_lines(lines, x0, y0, x1, y1, step=GRID):
    x = x0
    while x <= x1 + 0.1:
        lines.append(f'<line x1="{x:.1f}" y1="{y0}" x2="{x:.1f}" y2="{y1}" stroke="{LINE}" stroke-width="1"/>')
        x += step
    y = y0
    while y <= y1 + 0.1:
        lines.append(f'<line x1="{x0}" y1="{y:.1f}" x2="{x1}" y2="{y:.1f}" stroke="{LINE}" stroke-width="1"/>')
        y += step


def construction_node():
    lines = empty_svg(512, 512)
    grid_lines(lines, 32, 32, 480, 480)
    lines.append(f'<path d="{path_of(node())}" fill="{INK}" fill-opacity="0.9"/>')
    lines.append(f'<line x1="56" y1="256" x2="456" y2="256" stroke="{ACCENT}" stroke-width="1.5"/>')
    lines.append(f'<line x1="56" y1="124" x2="56" y2="388" stroke="{ACCENT}" stroke-width="1.5"/>')
    lines.append(f'<line x1="256" y1="208" x2="256" y2="304" stroke="{ACCENT}" stroke-width="1.5"/>')
    lines.append('</svg>')
    return '\n'.join(lines)


def construction_bore():
    lines = empty_svg(512, 512)
    grid_lines(lines, 32, 32, 480, 480)
    lines.append(f'<path d="{path_of(bore())}" fill="{INK}"/>')
    lines.append(f'<circle cx="256" cy="256" r="208" fill="none" stroke="{ACCENT}" stroke-width="1.5"/>')
    lines.append(f'<circle cx="288" cy="256" r="104" fill="none" stroke="{ACCENT}" stroke-width="1" stroke-dasharray="4 4"/>')
    lines.append(f'<circle cx="288" cy="256" r="112" fill="none" stroke="{ACCENT}" stroke-width="1.5"/>')
    lines.append(f'<line x1="256" y1="256" x2="288" y2="256" stroke="{ACCENT}" stroke-width="1.5"/>')
    lines.append(f'<circle cx="256" cy="256" r="3" fill="{ACCENT}"/>')
    lines.append(f'<circle cx="288" cy="256" r="3" fill="{ACCENT}"/>')
    lines.append('</svg>')
    return '\n'.join(lines)


def construction_peak():
    lines = empty_svg(512, 512)
    grid_lines(lines, 32, 32, 480, 480)
    lines.append(f'<path d="{path_of(peak())}" fill="{INK}" fill-opacity="0.9"/>')
    lines.append(f'<line x1="48" y1="256" x2="464" y2="256" stroke="{ACCENT}" stroke-width="1.5"/>')
    lines.append(f'<line x1="256" y1="150" x2="256" y2="362" stroke="{ACCENT}" stroke-width="1.5"/>')
    lines.append(f'<line x1="48" y1="224" x2="48" y2="288" stroke="{ACCENT}" stroke-width="1.5"/>')
    lines.append('</svg>')
    return '\n'.join(lines)


def construction_plate():
    # Square view so the offstage centers are in frame and nothing letterboxes.
    g, (cx, mid, r, rcx) = plate()
    pad = 36
    x0 = min(cx, 48) - pad
    x1 = max(rcx, 464) + pad
    side = x1 - x0
    y0 = mid - side / 2
    lines = [f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="{x0:.2f} {y0:.2f} {side:.2f} {side:.2f}">',
             f'<rect x="{x0:.2f}" y="{y0:.2f}" width="{side:.2f}" height="{side:.2f}" fill="{CREAM}"/>']
    grid_lines(lines, x0 + pad, y0 + pad, x1 - pad, y0 + side - pad)
    lines.append(f'<path d="{path_of(g)}" fill="{INK}"/>')
    lines.append(f'<rect x="48" y="56" width="416" height="400" fill="none" stroke="{ACCENT}" stroke-width="1.5"/>')
    lines.append(f'<circle cx="{cx:.2f}" cy="{mid}" r="{r:.2f}" fill="none" stroke="{ACCENT}" stroke-width="1.25"/>')
    lines.append(f'<circle cx="{rcx:.2f}" cy="{mid}" r="{r:.2f}" fill="none" stroke="{ACCENT}" stroke-width="1.25"/>')
    lines.append(f'<line x1="{cx:.2f}" y1="{mid}" x2="156" y2="{mid}" stroke="{ACCENT}" stroke-width="1.5"/>')
    lines.append(f'<circle cx="{cx:.2f}" cy="{mid}" r="3.5" fill="{ACCENT}"/>')
    lines.append(f'<circle cx="{rcx:.2f}" cy="{mid}" r="3.5" fill="{ACCENT}"/>')
    lines.append('</svg>')
    return '\n'.join(lines)


# --- marks -----------------------------------------------------------------

MARKS = [
    ('01-bore', 'The octave sits inside the fundamental, off center, one wall twice the other.', bore, construction_bore),
    ('02-plate', 'A square plate drawn in at the sides, still across the middle.', plate_geom, construction_plate),
    ('03-node', 'The second mode of a bar: the ends move and the middle does not.', node, construction_node),
    ('04-peak', 'One resonance, broad at the center and falling away at both ends.', peak, construction_peak),
]


def raster(text, path, w, h=None):
    h = w if h is None else h
    subprocess.run(['rsvg-convert', '-w', str(w), '-h', str(h), '-o', path], input=text.encode(), check=True)


def blow(im, factor):
    return im.resize((im.size[0] * factor, im.size[1] * factor), Image.Resampling.NEAREST)


def header_mock(mark_png, brand, nav):
    # 2x a site header. Mark sits with the wordmark. Nav is the real one.
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
    for t, w in zip(items, widths):
        d.text((x, 20 * scale), t, font=nav, fill=(106, 101, 92))
        x += w + gap
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
    d.text((x, yy), '64', font=small, fill=(90, 84, 74))
    im.paste(blow(i64, 2), (x, yy + 22))
    yy += 22 + 128 + 16
    d.text((x, yy), '32', font=small, fill=(90, 84, 74))
    im.paste(blow(i32, 4), (x, yy + 22))
    yy += 22 + 128 + 16
    d.text((x, yy), '16', font=small, fill=(90, 84, 74))
    im.paste(blow(i16, 6), (x, yy + 22))
    # black and reversed under the big mark, left side
    by = y + 512 + 16
    d.text((left, by), 'black', font=small, fill=(90, 84, 74))
    d.text((left + 180, by), 'reversed', font=small, fill=(90, 84, 74))
    im.paste(black.resize((160, 160), Image.Resampling.LANCZOS), (left, by + 24))
    im.paste(rev.resize((160, 160), Image.Resampling.LANCZOS), (left + 180, by + 24))
    d.text((left + 360, by), 'construction', font=small, fill=(90, 84, 74))
    im.paste(constr_s, (left + 360, by + 24))
    hy = by + 24 + 360 + 20
    im.paste(header_s, (18, hy))
    im.paste(tab_s, (18, hy + header_s.size[1] + 16))
    return im


def contact(rows, font):
    n = len(rows)
    cell = 280
    pad = 28
    w = pad + n * cell
    h = pad + 28 + 240 + 36 + 16 * 8 + pad
    im = Image.new('RGB', (w, h), (242, 237, 227))
    d = ImageDraw.Draw(im)
    for i, (name, large, icon16) in enumerate(rows):
        x = pad + i * cell
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
    tab_font = ImageFont.truetype(board_font_path, 22)
    rows = []
    for slug, idea, draw, diagram in MARKS:
        folder = os.path.join(ROOT, slug)
        os.makedirs(folder, exist_ok=True)
        geom = draw()
        ink_svg = svg_mark(geom, INK, CREAM)
        black_svg = svg_mark(geom, BLACK, WHITE)
        rev_svg = svg_mark(geom, CREAM, INK)
        open(os.path.join(folder, 'mark.svg'), 'w').write(ink_svg)
        open(os.path.join(folder, 'black.svg'), 'w').write(black_svg)
        open(os.path.join(folder, 'reversed.svg'), 'w').write(rev_svg)
        cons = diagram()
        open(os.path.join(folder, 'construction.svg'), 'w').write(cons)
        for name, text, size in (
            ('512.png', ink_svg, 512),
            ('64.png', ink_svg, 64),
            ('32.png', ink_svg, 32),
            ('16.png', ink_svg, 16),
            ('black.png', black_svg, 512),
            ('reversed.png', rev_svg, 512),
        ):
            raster(text, os.path.join(folder, name), size)
        raster(cons, os.path.join(folder, 'construction.png'), 512)
        # smooth mark for the header, at the size it will be seen
        header_icon = os.path.join(folder, 'header-icon.png')
        raster(ink_svg, header_icon, 60)
        header = header_mock(header_icon, brand, nav)
        header.save(os.path.join(folder, 'header.png'))
        icon16 = Image.open(os.path.join(folder, '16.png')).convert('RGB')
        tab = tab_mock(icon16, tab_font)
        tab.save(os.path.join(folder, 'tab.png'))
        large = Image.open(os.path.join(folder, '512.png')).convert('RGB')
        b = board(
            idea, large,
            Image.open(os.path.join(folder, '64.png')).convert('RGB'),
            Image.open(os.path.join(folder, '32.png')).convert('RGB'),
            icon16,
            Image.open(os.path.join(folder, 'black.png')).convert('RGB'),
            Image.open(os.path.join(folder, 'reversed.png')).convert('RGB'),
            Image.open(os.path.join(folder, 'construction.png')).convert('RGB'),
            header, tab, font, small,
        )
        b.save(os.path.join(folder, 'board.png'))
        with open(os.path.join(folder, 'idea.txt'), 'w') as handle:
            handle.write(idea + '\n')
        rows.append((slug.split('-', 1)[1], large, icon16))
        print(slug)
    contact(rows, small).save(os.path.join(ROOT, 'contact.png'))
    print('contact')


if __name__ == '__main__':
    main()
