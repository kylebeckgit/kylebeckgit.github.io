"""Round 4 marks. One gesture each. Does not replace the live favicon.

Run: python3 art/logo-concepts/round4/render.py
"""
import os
import subprocess
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
CREAM = '#F2EDE3'
INK = '#1F1D1A'
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


def svg(body, bg, fg):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="{bg}"/>
  <g fill="{fg}" stroke="none">{body}</g>
</svg>'''


def stroke(fg, d, width):
    return (
        f'<path d="{d}" fill="none" stroke="{fg}" stroke-width="{width}" '
        f'stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="8"/>'
    )


def pulse(fg):
    # Up, hold, down. A square wave and a note gate, one stroke.
    return stroke(fg, 'M32 330 H150 V176 H362 V330 H480', 58)


def beck(fg):
    # The waist of the B is a play arrow. One counter, nothing else.
    return '''
      <path fill-rule="evenodd" d="
        M124 60 H308
        C470 60 492 140 468 200
        C450 236 420 256 420 256
        C420 256 450 276 468 312
        C492 372 470 452 308 452
        H124 Z
        M200 188 L200 324 L400 256 Z"/>
    '''


def impulse(fg):
    # A transient on a line. The peak is also a caret.
    return stroke(fg, 'M36 332 H178 L256 156 L334 332 H476', 54)


def stair(fg):
    # Two equal steps. A sequence, nothing added.
    return stroke(fg, 'M52 368 H188 V256 H324 V144 H460', 56)


def region(fg):
    # Two brackets. The empty middle is the loop, and the array.
    return stroke(fg, 'M196 112 H120 V400 H196', 56) + stroke(fg, 'M316 112 H392 V400 H316', 56)


def glide(fg):
    # One step down. A glide, and a Z if you look again.
    return stroke(fg, 'M48 176 H200 L312 336 H464', 56)


MARKS = [
    ('01-pulse', 'One period of a square wave, which is also a note gate: up, hold, down.', pulse),
    ('02-beck', 'A B whose only counter is a play arrow.', beck),
    ('03-impulse', 'A transient on a line, which is also a caret.', impulse),
    ('04-stair', 'Two equal steps: the smallest sequence.', stair),
    ('05-region', 'Two brackets. The space between them is a loop, and an array.', region),
    ('06-glide', 'A Z that steps down: Zebra, and a glide.', glide),
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
    scale = 4
    w, h = 280 * scale, 88 * scale
    im = Image.new('RGB', (w, h), (232, 234, 237))
    d = ImageDraw.Draw(im)
    x, y, tw, th = 16 * scale, 28 * scale, 230 * scale, 48 * scale
    d.rounded_rectangle([x, y, x + tw, y + th], radius=12 * scale, fill=(255, 255, 255))
    icon = icon16.resize((16 * scale, 16 * scale), Image.Resampling.NEAREST)
    im.paste(icon, (x + 14 * scale, y + 16 * scale))
    d.text((x + 40 * scale, y + 11 * scale), 'Kyle Beck', font=font, fill=(31, 29, 26))
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


def main():
    ensure_font()
    font = ImageFont.truetype(FONT_PATH, 22)
    small = ImageFont.truetype(FONT_PATH, 18)
    for slug, idea, draw in MARKS:
        folder = os.path.join(ROOT, slug)
        os.makedirs(folder, exist_ok=True)
        color_svg = svg(draw(INK), CREAM, INK)
        one_svg = svg(draw(ONE), PAPER, ONE)
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


if __name__ == '__main__':
    main()
