"""Round 2 marks. Musical ideas, same palette. Does not replace the live favicon.

Run: python3 art/logo-concepts/round2/render.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
FONT_SRC = os.path.join(ROOT, '..', '..', '..', 'public', 'fonts', 'archivo', 'archivo-latin-wdth-normal.woff2')
CREAM = (242, 237, 227)
INK = (31, 29, 26)
ORANGE = (212, 66, 28)
CHROME = (232, 234, 237)
WHITE = (255, 255, 255)
MUTED = (106, 101, 92)
PAD = (58, 54, 48)

def cut(wght, wdth, dest):
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    font = TTFont(FONT_SRC)
    instantiateVariableFont(font, {'wght': wght, 'wdth': wdth}, inplace=True)
    font.save(dest)
    return dest

def flat_sign(d, x, y, w, h, stem=INK, bowl=INK):
    """A flat sign: stem plus a bowl, the same shape as a lowercase b."""
    sw = w * 0.28
    d.rounded_rectangle([x, y, x + sw, y + h], radius=sw * 0.4, fill=stem)
    d.ellipse([x + sw * 0.35, y + h * 0.40, x + w, y + h], fill=bowl)
    d.ellipse([x + sw * 0.95, y + h * 0.52, x + w * 0.78, y + h * 0.88], fill=CREAM)

def mark_flat(size):
    im = Image.new('RGB', (size, size), CREAM)
    d = ImageDraw.Draw(im)
    m = size * 0.18
    flat_sign(d, m, size * 0.08, size * 0.64, size * 0.84, stem=ORANGE, bowl=INK)
    return im

def mark_kflat(size, font_path):
    im = Image.new('RGB', (size, size), CREAM)
    d = ImageDraw.Draw(im)
    font = ImageFont.truetype(font_path, int(size * 0.62))
    b = d.textbbox((0, 0), 'K', font=font)
    kh = b[3] - b[1]
    y = (size - kh) / 2 - b[1]
    d.text((size * 0.04 - b[0], y), 'K', font=font, fill=INK)
    flat_sign(d, size * 0.58, size * 0.20, size * 0.34, size * 0.62, stem=ORANGE, bowl=INK)
    return im

def mark_bec(size, font_path):
    """B, E, C are note names. They sit on one line so the word still reads at 16px.
    Orange stems turn the letters into notes. K is not a note, so Beck is not spelled in full."""
    im = Image.new('RGB', (size, size), CREAM)
    d = ImageDraw.Draw(im)
    font = ImageFont.truetype(font_path, int(size * 0.46))
    text = 'BEC'
    b = d.textbbox((0, 0), text, font=font)
    w, h = b[2] - b[0], b[3] - b[1]
    x = (size - w) / 2 - b[0]
    y = (size - h) / 2 - b[1] + size * 0.04
    mid = y + (b[1] + b[3]) / 2
    d.rectangle([size * 0.06, mid - size * 0.012, size * 0.94, mid + size * 0.012], fill=(196, 190, 180))
    cursor = x
    for ch in text:
        cb = d.textbbox((cursor, y), ch, font=font)
        d.rectangle([cb[2] - size * 0.03, y - size * 0.12, cb[2] + size * 0.015, cb[3] - size * 0.08], fill=ORANGE)
        cursor = cb[2] - size * 0.02
    d.text((x, y), text, font=font, fill=INK)
    return im

def mark_seq(size):
    """Lit trigs of a 4x4 step grid, drawn as a K."""
    im = Image.new('RGB', (size, size), INK)
    d = ImageDraw.Draw(im)
    lit = {(0, 0), (0, 3), (1, 0), (1, 2), (2, 0), (2, 1), (3, 0), (3, 3)}
    m = size * 0.12
    gap = size * 0.045
    cell = (size - 2 * m - 3 * gap) / 4
    for r in range(4):
        for c in range(4):
            x = m + c * (cell + gap)
            y = m + r * (cell + gap)
            color = ORANGE if (r, c) in lit else PAD
            d.rounded_rectangle([x, y, x + cell, y + cell], radius=cell * 0.18, fill=color)
    return im

def mark_cycle(size):
    """One bipolar cycle. The axis and the two lobes are a capital B."""
    im = Image.new('RGB', (size, size), CREAM)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([size * 0.20, size * 0.10, size * 0.34, size * 0.90], radius=size * 0.04, fill=INK)
    d.ellipse([size * 0.26, size * 0.10, size * 0.84, size * 0.50], fill=ORANGE)
    d.ellipse([size * 0.40, size * 0.20, size * 0.72, size * 0.42], fill=CREAM)
    d.ellipse([size * 0.26, size * 0.50, size * 0.84, size * 0.90], fill=INK)
    d.ellipse([size * 0.40, size * 0.60, size * 0.72, size * 0.80], fill=CREAM)
    return im

def mark_notek(size):
    """Notehead, stem, and two flags. The flags are the arms of a K."""
    im = Image.new('RGB', (size, size), CREAM)
    d = ImageDraw.Draw(im)
    d.ellipse([size * 0.06, size * 0.62, size * 0.42, size * 0.92], fill=INK)
    d.rectangle([size * 0.32, size * 0.10, size * 0.44, size * 0.78], fill=INK)
    w = int(size * 0.085)
    d.line([(size * 0.38, size * 0.26), (size * 0.90, size * 0.08)], fill=ORANGE, width=w)
    d.line([(size * 0.38, size * 0.48), (size * 0.90, size * 0.74)], fill=INK, width=w)
    return im

def tab_mock(icon16, text_font):
    scale = 3
    w, h = 280 * scale, 86 * scale
    im = Image.new('RGB', (w, h), CHROME)
    d = ImageDraw.Draw(im)
    x, y, tw, th = 14 * scale, 28 * scale, 230 * scale, 46 * scale
    d.rounded_rectangle([x, y, x + tw, y + th], radius=10 * scale, fill=WHITE)
    icon = icon16.resize((16 * scale, 16 * scale), Image.Resampling.NEAREST)
    im.paste(icon, (x + 12 * scale, y + 15 * scale))
    d.text((x + 36 * scale, y + 12 * scale), 'Kyle Beck', font=text_font, fill=INK)
    return im

def link_preview(mark, title_font, body_font):
    w, h = 880, 360
    im = Image.new('RGB', (w, h), WHITE)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w - 1, h - 1], outline=(216, 208, 193))
    im.paste(mark.resize((h, h), Image.Resampling.LANCZOS), (0, 0))
    x = h + 28
    d.text((x, 70), 'Kyle Beck', font=title_font, fill=INK)
    d.multiline_text((x, 140), 'Musician and developer. Tonverk packs,\nguides, and a browser tool.', font=body_font, fill=MUTED, spacing=6)
    d.text((x, 250), 'kyle-beck.com', font=body_font, fill=ORANGE)
    return im

def board(title, mark512, icon32, icon16, tab, preview, label_font):
    gap = 28
    left = 512
    right_w = 240
    w = 18 + left + gap + right_w + 18
    col = Image.new('RGB', (right_w, 512), CREAM)
    cd = ImageDraw.Draw(col)
    cd.text((8, 8), '32px', font=label_font, fill=MUTED)
    col.paste(icon32.resize((128, 128), Image.Resampling.NEAREST), (8, 40))
    cd.text((8, 190), '16px', font=label_font, fill=MUTED)
    col.paste(icon16.resize((128, 128), Image.Resampling.NEAREST), (8, 222))
    tab_s = tab.resize((w - 36, int(tab.size[1] * (w - 36) / tab.size[0])), Image.Resampling.LANCZOS)
    prev_s = preview.resize((w - 36, int(preview.size[1] * (w - 36) / preview.size[0])), Image.Resampling.LANCZOS)
    h = 52 + 512 + 24 + tab_s.size[1] + 16 + prev_s.size[1] + 24
    im = Image.new('RGB', (w, h), CREAM)
    d = ImageDraw.Draw(im)
    d.text((18, 14), title, font=label_font, fill=INK)
    im.paste(mark512, (18, 52))
    im.paste(col, (18 + left + gap, 52))
    y = 52 + 512 + 24
    im.paste(tab_s, (18, y))
    y += tab_s.size[1] + 16
    im.paste(prev_s, (18, y))
    return im

IDEAS = [
    ('01-flat', 'The flat sign is the letter B, and in German notation B means B-flat.'),
    ('02-k-flat', 'KB, with the B written as a flat sign.'),
    ('03-bec', 'B, E and C are note names, the start of Beck, each with a stem. K is not a note, so the full name cannot be spelled.'),
    ('04-steps', 'Lit trigs on a step grid draw a K.'),
    ('05-cycle', 'One cycle of a wave: the axis and the two lobes are the letter B.'),
    ('06-note-k', 'A K made from a notehead, a stem and two flags.'),
]

def main():
    kb_font = cut(700, 100, '/tmp/archivo-r2-kb.ttf')
    text_font = cut(650, 100, '/tmp/archivo-r2-text.ttf')
    label = ImageFont.truetype(text_font, 22)
    title_font = ImageFont.truetype(text_font, 42)
    body_font = ImageFont.truetype(text_font, 22)
    tab_font = ImageFont.truetype(text_font, 42)
    makers = {
        '01-flat': lambda: mark_flat(512),
        '02-k-flat': lambda: mark_kflat(512, kb_font),
        '03-bec': lambda: mark_bec(512, kb_font),
        '04-steps': lambda: mark_seq(512),
        '05-cycle': lambda: mark_cycle(512),
        '06-note-k': lambda: mark_notek(512),
    }
    for slug, idea in IDEAS:
        folder = os.path.join(ROOT, slug)
        os.makedirs(folder, exist_ok=True)
        mark = makers[slug]()
        icon32 = mark.resize((32, 32), Image.Resampling.LANCZOS)
        icon16 = mark.resize((16, 16), Image.Resampling.LANCZOS)
        mark.save(os.path.join(folder, '512.png'))
        icon32.save(os.path.join(folder, '32.png'))
        icon16.save(os.path.join(folder, '16.png'))
        tab = tab_mock(icon16, tab_font)
        preview = link_preview(mark, title_font, body_font)
        tab.save(os.path.join(folder, 'tab.png'))
        preview.save(os.path.join(folder, 'link-preview.png'))
        board(idea, mark, icon32, icon16, tab, preview, label).save(os.path.join(folder, 'board.png'))
        with open(os.path.join(folder, 'idea.txt'), 'w') as f:
            f.write(idea + '\n')
        print(slug)

if __name__ == '__main__':
    main()
