"""Regenerates the synthetic HEIC fixtures used by sample_image_heic.spec.ts.

    python -m venv /tmp/v && /tmp/v/bin/pip install pillow pillow-heif
    /tmp/v/bin/python generate_heic_fixtures.py

Everything is drawn programmatically (a big label on a flat colour) — no photo, no
patient data. h1 is stored landscape with EXIF orientation 6 (an iPhone held in
portrait) and carries an embedded thumbnail; h2 is a plain landscape image.
"""
from io import BytesIO
from pathlib import Path

import pillow_heif
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent


def labelled(label, size, hue_rgb, marker=True):
    img = Image.new("RGB", size, hue_rgb)
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default(size=size[1] // 2)
    draw.text((size[0] // 2, size[1] // 2), label, fill=(13, 27, 42), font=font, anchor="mm")
    if marker:  # red block, top-left of the stored pixels
        draw.rectangle((0, 0, size[0] // 8, size[1] // 8), fill=(255, 0, 0))
    return img


def save(img, name, exif_orientation=None, thumbnail=None):
    heif = pillow_heif.from_pillow(img)
    if thumbnail:
        heif[0].info["thumbnails"] = [thumbnail]
    kwargs = {"quality": 85}
    if exif_orientation:
        exif = Image.Exif()
        exif[0x0112] = exif_orientation
        kwargs["exif"] = exif.tobytes()
    heif.save(HERE / name, **kwargs)


save(labelled("H1", (640, 480), (150, 200, 240)), "synthetic-heic-h1.heic", exif_orientation=6, thumbnail=96)
save(labelled("H2", (800, 600), (240, 200, 150), marker=False), "synthetic-heic-h2.heic")
data = (HERE / "synthetic-heic-h2.heic").read_bytes()
(HERE / "synthetic-heic-corrupt.heic").write_bytes(data[: len(data) // 2])
burst = pillow_heif.HeifFile()
for color in ((255, 0, 0), (0, 255, 0)):
    burst.add_from_pillow(Image.new("RGB", (64, 64), color))
buf = BytesIO()
burst.save(buf, quality=80)
(HERE / "synthetic-heic-burst.heic").write_bytes(buf.getvalue())
