"""Round 3 marks. One idea, drawn, not a font. Does not replace the live favicon.

Run: python3 art/logo-concepts/round3/render.py
Rasterizes SVG with rsvg-convert.
"""
import os
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
CREAM = '#F2EDE3'
INK = '#1F1D1A'
ONE = '#141414'
PAPER = '#FFFFFF'

def svg(body, bg, fg):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="{bg}"/>
  <g fill="{fg}" stroke="none">{body}</g>
</svg>'''

def fifth(fg):
    # A note resting on the upper of two lines. The gap is a fifth, and the head is not crossed by the line, so it stays a dot at 16px.
    return '''
      <rect x="76" y="360" width="360" height="48"/>
      <rect x="76" y="196" width="360" height="48"/>
      <ellipse cx="256" cy="150" rx="58" ry="46"/>
    '''

def kb(fg):
    # One stroke weight. The stem is shared: K leaves to the left, B bowls to the right.
    return f'''
      <g fill="none" stroke="{fg}" stroke-width="60" stroke-linecap="square" stroke-linejoin="miter">
        <path d="M200 78 V434"/>
        <path d="M200 256 L62 92"/>
        <path d="M200 256 L62 420"/>
        <path d="M200 88 H292 A84 84 0 0 1 292 256 H200"/>
        <path d="M200 256 H292 A84 84 0 0 1 292 424 H200"/>
      </g>
    '''

def partials(fg):
    # Heights 1, 1/2, 1/3: fundamental, octave, twelfth. Bottoms aligned.
    return '''
      <rect x="108" y="88" width="76" height="336"/>
      <rect x="218" y="256" width="76" height="168"/>
      <rect x="328" y="312" width="76" height="112"/>
    '''

def repeat(fg):
    # The repeat sign: two dots, then the double bar. A loop. Group centered on the square.
    return '''
      <circle cx="168" cy="196" r="32"/>
      <circle cx="168" cy="316" r="32"/>
      <rect x="248" y="108" width="48" height="296"/>
      <rect x="320" y="108" width="48" height="296"/>
    '''

def fermata(fg):
    # Arc, then a small dot just above the line. The dot is low so it reads as a hold, not a head.
    return f'''
      <path d="M104 292 C104 168 408 168 408 292" fill="none" stroke="{fg}" stroke-width="48" stroke-linecap="butt"/>
      <circle cx="256" cy="308" r="20"/>
      <rect x="104" y="360" width="304" height="48"/>
    '''

def tie(fg):
    # Two notes, one beam. Stems meet the heads and the beam.
    return '''
      <ellipse cx="146" cy="386" rx="56" ry="42"/>
      <ellipse cx="366" cy="386" rx="56" ry="42"/>
      <rect x="184" y="124" width="26" height="280"/>
      <rect x="390" y="124" width="26" height="280"/>
      <rect x="184" y="104" width="232" height="44"/>
    '''

MARKS = [
    ('01-fifth', 'A perfect fifth: one note sitting on the upper of two lines.', fifth),
    ('02-kb', 'K and B share one stem.', kb),
    ('03-partials', 'The first three partials, in the proportion 1, 1/2, 1/3.', partials),
    ('04-repeat', 'The repeat sign: two dots and a double bar, a loop.', repeat),
    ('05-fermata', 'A fermata: arc, dot, and line. The hold.', fermata),
    ('06-beam', 'Two notes on one beam: one pitch, one gesture.', tie),
]

def raster(svg_text, path, size):
    proc = subprocess.run(
        ['rsvg-convert', '-w', str(size), '-h', str(size), '-o', path],
        input=svg_text.encode(),
        check=True,
    )
    return path

def blow(im, factor):
    return im.resize((im.size[0] * factor, im.size[1] * factor), Image.Resampling.NEAREST)

def tab_mock(icon16):
    scale = 4
    w, h = 280 * scale, 88 * scale
    im = Image.new('RGB', (w, h), (232, 234, 237))
    d = ImageDraw.Draw(im)
    x, y, tw, th = 16 * scale, 28 * scale, 230 * scale, 48 * scale
    d.rounded_rectangle([x, y, x + tw, y + th], radius=12 * scale, fill=(255, 255, 255))
    icon = icon16.resize((16 * scale, 16 * scale), Image.Resampling.NEAREST)
    im.paste(icon, (x + 14 * scale, y + 16 * scale))
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 42)
    except OSError:
        font = ImageFont.load_default()
    d.text((x + 40 * scale, y + 14 * scale), 'Kyle Beck', font=font, fill=(31, 29, 26))
    return im

def board(title, large, icon32, icon16, one, tab):
    gap = 24
    w = 36 + 512 + gap + 220
    col_h = 512
    tab_s = tab.resize((w - 36, int(tab.size[1] * (w - 36) / tab.size[0])), Image.Resampling.LANCZOS)
    h = 56 + col_h + 28 + tab_s.size[1] + 28
    im = Image.new('RGB', (w, h), (242, 237, 227))
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 22)
    except OSError:
        font = ImageFont.load_default()
    d.text((18, 16), title, font=font, fill=(31, 29, 26))
    im.paste(large, (18, 56))
    x = 18 + 512 + gap
    y = 56
    d.text((x, y), '32', font=font, fill=(106, 101, 92))
    im.paste(blow(icon32, 4), (x, y + 28))
    d.text((x, y + 170), '16', font=font, fill=(106, 101, 92))
    im.paste(blow(icon16, 8), (x, y + 198))
    d.text((x, y + 340), 'one color', font=font, fill=(106, 101, 92))
    im.paste(one.resize((96, 96), Image.Resampling.LANCZOS), (x, y + 368))
    im.paste(tab_s, (18, 56 + col_h + 28))
    return im

def main():
    for slug, idea, draw in MARKS:
        folder = os.path.join(ROOT, slug)
        os.makedirs(folder, exist_ok=True)
        color_svg = svg(draw(INK), CREAM, INK)
        one_svg = svg(draw(ONE), PAPER, ONE)
        (open(os.path.join(folder, 'mark.svg'), 'w')).write(color_svg)
        (open(os.path.join(folder, 'one-color.svg'), 'w')).write(one_svg)
        large = os.path.join(folder, '512.png')
        raster(color_svg, large, 512)
        raster(color_svg, os.path.join(folder, '32.png'), 32)
        raster(color_svg, os.path.join(folder, '16.png'), 16)
        raster(one_svg, os.path.join(folder, 'one-color.png'), 512)
        icon32 = Image.open(os.path.join(folder, '32.png')).convert('RGB')
        icon16 = Image.open(os.path.join(folder, '16.png')).convert('RGB')
        one = Image.open(os.path.join(folder, 'one-color.png')).convert('RGB')
        tab = tab_mock(icon16)
        tab.save(os.path.join(folder, 'tab.png'))
        board(idea, Image.open(large).convert('RGB'), icon32, icon16, one, tab).save(os.path.join(folder, 'board.png'))
        with open(os.path.join(folder, 'idea.txt'), 'w') as f:
            f.write(idea + '\n')
        print(slug)

if __name__ == '__main__':
    main()
