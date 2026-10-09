from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

root = Path('output/tutorial-v4-6')
out = root / 'replacement-composite-frames'
out.mkdir(exist_ok=True)
base = Image.open(root / 'join-before.png').convert('RGB')
step2 = Image.open(root / 'step2-matched.png').convert('RGB')
tall = Image.open(root / 'tall-machine-probe.png').convert('RGB').resize((1920, 1500), Image.Resampling.LANCZOS)

# The original cursor stays on RC-751 while the page scrolls. Replace only that
# 47x46-pixel patch with the matching untouched quantity control below it.
clean = base.copy()
cursor_patch = (653, 598, 706, 652)
clone = tall.crop((659, 601, 712, 655))
mask = Image.new('L', clone.size, 0)
ImageDraw.Draw(mask).rectangle((6, 5, 47, 47), fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(3))
clean.paste(clone, cursor_patch[:2], mask)

# Extend the blank Portal background without a horizontal color seam. Only the
# lower part of the *left machine panel* comes from the taller browser capture.
background_top = base.getpixel((1450, 1044))
background_end = (240, 245, 242)
background = Image.new('RGB', (1920, 1500), '#f0f5f2')
background.paste(clean, (0, 0))
draw_bg = ImageDraw.Draw(background)
for y in range(1045, 1500):
    t = (y - 1045) / (1500 - 1045)
    color = tuple(round(background_top[c] * (1 - t) + background_end[c] * t) for c in range(3))
    draw_bg.line((0, y, 1919, y), fill=color)
background.paste(tall.crop((527, 1045, 1030, 1367)), (527, 1045))
extension = Image.new('RGBA', (1920, 1500), (0, 0, 0, 0))
extension.paste(background.crop((0, 1045, 1920, 1500)).convert('RGBA'), (0, 1045))
extension.save(root / 'lower-machine-extension.png')

def pointer(x, y):
    factor = 4
    layer = Image.new('RGBA', (44 * factor, 50 * factor), (0, 0, 0, 0))
    points = [(2, 1), (2, 25), (8, 19), (13, 30), (18, 28), (13, 18), (22, 18)]
    points = [(int(px * .9375 * factor), int(py * .9375 * factor)) for px, py in points]
    shadow = Image.new('RGBA', layer.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(shadow)
    d.polygon([(px + 5, py + 7) for px, py in points], fill=(0, 0, 0, 90))
    layer.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(4)))
    d = ImageDraw.Draw(layer)
    d.polygon(points, fill='white', outline='#184d30', width=2 * factor)
    layer = layer.resize((44, 50), Image.Resampling.LANCZOS)
    return layer, (round(x * .9375), round(y * .9375))

for i in range(48):
    frame = Image.new('RGB', (1920, 1500), '#f0f5f2')
    if i < 38:
        frame.paste(background)
        t = max(0, min(1, (i - 5) / 31))
        ease = t * t * (3 - 2 * t)
        x = 710 + (836.921875 - 710) * ease
        y = 650 + (1415.6484375 - 650) * ease
        p, xy = pointer(x, y)
        frame.paste(p, xy, p)
    else:
        frame.paste(step2, (0, 0))
    frame.save(out / f'frame-{i+1:03d}.png')
print('48 matching-framed replacement frames written')
