"""Chordspeak cover concepts, drawn from the actual wavetables. Run: python3 art/make_covers.py"""
import wave, glob, os, numpy as np
from PIL import Image, ImageDraw, ImageFont
WT = '/workspace/chordspeak-tonverk-v3/Chordspeak_for_Tonverk/User/Wavetables/Chordspeak'
OUT = os.path.join(os.path.dirname(__file__), 'concepts')
FD = '/tmp/art'
PAPER, INK, ORANGE = (242, 237, 227), (31, 29, 26), (212, 66, 28)
S = 2000
def font(n, size): return ImageFont.truetype(f'{FD}/archivo_{n}.ttf', size)
def load(name):
    w = wave.open(f'{WT}/{name}.wav'); b = w.readframes(w.getnframes())
    a = np.frombuffer(b, np.uint8).reshape(-1, 3)
    v = (a[:, 0].astype(np.int32) | (a[:, 1].astype(np.int32) << 8) | (a[:, 2].astype(np.int32) << 16))
    v = np.where(v >= 1 << 23, v - (1 << 24), v) / float(1 << 23)
    return v.reshape(64, 2048)
def title(d, col, x=140, y=S-330, sub=True):
    d.text((x, y), 'Chordspeak', font=font('exp_bold', 150), fill=col)
    if sub: d.text((x + 6, y + 190), 'for Tonverk  ·  Kyle Beck', font=font('reg', 58), fill=col)

# 1 waterfall of the chord-phrase table, drawn flat with occlusion.
# The site cover is this drawing with no printed title (the page heading names the pack).
def c1(labeled=True):
    im = Image.new('RGB', (S, S), PAPER); d = ImageDraw.Draw(im)
    t = load('CS_CHD01_Chord_Phrases'); xs = np.linspace(140, S - 140, 2048 // 4)
    for i in range(64):
        y0 = 300 + i * 19; f = t[i, ::4]
        pts = [(x, y0 - v * 110) for x, v in zip(xs, f)]
        d.polygon(pts + [(xs[-1], y0 + 400), (xs[0], y0 + 400)], fill=PAPER)
        d.line(pts, fill=ORANGE if i == 40 else INK, width=6 if i == 40 else 3)
    if labeled:
        d.rectangle([0, S - 420, S, S], fill=PAPER); title(d, INK)
    return im
# 2 all 64 waves of one table as an 8x8 grid on ink
def c2():
    im = Image.new('RGB', (S, S), INK); d = ImageDraw.Draw(im)
    t = load('CS_CHD11_Cluster_Greeting'); m, g = 140, 18; cell = (S - 2 * m - 7 * g) / 8; top = 140
    for i in range(64):
        r, c = divmod(i, 8); x0 = m + c * (cell + g); y0 = top + r * (cell * .78 + g)
        f = t[i, ::16]; xs = np.linspace(x0, x0 + cell, len(f)); cy = y0 + cell * .39
        d.line([(x, cy - v * cell * .34) for x, v in zip(xs, f)], fill=ORANGE if i == 27 else PAPER, width=4)
    title(d, PAPER); return im
# 3 one single cycle, very large
def c3():
    im = Image.new('RGB', (S, S), PAPER); d = ImageDraw.Draw(im)
    f = load('CS_VOX01_Choir_Vowels')[32]; xs = np.linspace(0, S, 2048)
    d.line([(x, 820 - v * 560) for x, v in zip(xs, f)], fill=ORANGE, width=22, joint='curve')
    d.line([(0, 820), (S, 820)], fill=INK, width=3)
    title(d, INK); d.text((146, 140), 'Wavetables for the Wavefinder machine', font=font('reg', 52), fill=INK); return im
# 4 typographic: the pack as an index, one bar per table (peak motion across frames)
def c4():
    im = Image.new('RGB', (S, S), ORANGE); d = ImageDraw.Draw(im)
    d.text((130, 120), 'Chord', font=font('exp_bold', 420), fill=INK)
    d.text((130, 520), 'speak', font=font('exp_bold', 420), fill=INK)
    files = sorted(glob.glob(WT + '/*.wav')); w = (S - 260) / 64
    for i, fp in enumerate(files):
        t = load(os.path.basename(fp)[:-4]); rms = np.sqrt((t ** 2).mean(axis=1))
        h = 120 + 520 * (rms.std() / (rms.mean() + 1e-9))
        x = 130 + i * w; d.rectangle([x, 1620 - min(h, 640), x + w * .55, 1620], fill=INK)
    d.text((136, 1700), 'for Tonverk  ·  64 wavetables  ·  Kyle Beck', font=font('reg', 60), fill=INK); return im
SITE = os.path.join(os.path.dirname(__file__), '..', 'public', 'packs', 'chordspeak-tonverk')

def cover_from_concept():
    """Wavetables are not in this checkout. Crop the title off concept 1 and square the waves."""
    src = Image.open(os.path.join(OUT, 'chordspeak-cover-concept1-waterfall.png')).convert('RGB')
    w, h = src.size
    px = src.load()
    def ink(x, y):
        r, g, b = px[x, y]
        return abs(r - PAPER[0]) + abs(g - PAPER[1]) + abs(b - PAPER[2]) > 18
    # Waveform sits above the caption; the caption is a separate band of glyphs.
    ys = [y for y in range(h) if sum(ink(x, y) for x in range(0, w, 4)) > 8 and y < 1600]
    xs = [x for x in range(w) if any(ink(x, y) for y in range(ys[0], ys[-1], 3))]
    m = 96
    box = (max(0, xs[0] - m), max(0, ys[0] - m), min(w, xs[-1] + m), min(h, ys[-1] + m))
    crop = src.crop(box)
    side = max(crop.size)
    canvas = Image.new('RGB', (side, side), PAPER)
    canvas.paste(crop, ((side - crop.size[0]) // 2, (side - crop.size[1]) // 2))
    return canvas

def save_site_cover(im):
    os.makedirs(SITE, exist_ok=True)
    # One file: the home page shows this art large and as a thumbnail, so a srcset
    # would download it twice. 960px covers a 390px phone at 2x and stays under 200 KB.
    out = im.resize((960, 960), Image.Resampling.LANCZOS)
    path = os.path.join(SITE, 'cover.webp')
    out.save(path, 'WEBP', quality=48, method=6)
    print(path, os.path.getsize(path))
    for stale in ('cover.jpg', 'cover-720.jpg'):
        old = os.path.join(SITE, stale)
        if os.path.exists(old):
            os.remove(old)

if os.path.isdir(WT):
    for n, fn in enumerate([c1, c2, c3, c4], 1):
        p = f'{OUT}/chordspeak-cover-concept{n}-{["waterfall","grid","single-cycle","index"][n-1]}.png'
        fn().save(p); print(p)
    save_site_cover(c1(labeled=False))
else:
    save_site_cover(cover_from_concept())
