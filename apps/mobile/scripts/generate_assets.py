"""Generate the app icon, splash mark, and cha-ching notification sound.

Everything here is drawn or synthesized from scratch, so the outputs are
original work released under CC0. Run from apps/mobile:

    python3 scripts/generate_assets.py

Requires Pillow and NumPy.
"""

import math
import struct
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "assets" / "images"
SOUNDS = ROOT / "assets" / "sounds"

PURPLE = (143, 60, 248)
PINK = (248, 96, 196)
BLACK = (0, 0, 0)

GRID = 12


def leaf_cells():
    """Pixel cells of a pointed diagonal leaf with a center vein and a stem."""
    cells = []
    half = math.sqrt(0.5)
    length, width = 0.5, 0.25
    cx, cy = 0.6, 0.4
    for row in range(GRID):
        for col in range(GRID):
            x = (col + 0.5) / GRID
            y = (row + 0.5) / GRID
            dx, dy = x - cx, y - cy
            u = (dx - dy) * half  # along the leaf, bottom-left to top-right
            v = (dx + dy) * half  # across the leaf
            inside = abs(u) <= length and abs(v) <= width * (1 - (u / length) ** 2)
            vein = abs(v) < 0.04 and -0.3 < u < 0.36
            if inside and not vein:
                cells.append((col, row, (u + length) / (2 * length)))
    tip_col = int((cx - length * half) * GRID)
    tip_row = int((cy + length * half) * GRID)
    for i in range(1, 3):
        cells.append((tip_col - i, tip_row + i, 0.0))
    return cells


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw_mark(size, mark_fraction, background):
    image = Image.new("RGBA", (size, size), background)
    draw = ImageDraw.Draw(image)
    mark = size * mark_fraction
    origin = (size - mark) / 2
    cell = mark / GRID
    gap = cell * 0.14
    for col, row, t in leaf_cells():
        x0 = origin + col * cell + gap / 2
        y0 = origin + row * cell + gap / 2
        draw.rectangle([x0, y0, x0 + cell - gap, y0 + cell - gap], fill=mix(PURPLE, PINK, t) + (255,))
    return image


def write_images():
    IMAGES.mkdir(parents=True, exist_ok=True)
    draw_mark(1024, 0.6, BLACK + (255,)).save(IMAGES / "icon.png")
    draw_mark(1024, 0.5, (0, 0, 0, 0)).save(IMAGES / "adaptive-foreground.png")
    draw_mark(1024, 0.5, BLACK + (255,)).convert("L").point(lambda p: 255 if p > 0 else 0).save(
        IMAGES / "adaptive-monochrome.png"
    )
    draw_mark(512, 0.9, (0, 0, 0, 0)).save(IMAGES / "splash-mark.png")
    draw_mark(96, 0.9, (0, 0, 0, 0)).save(IMAGES / "notification-icon-color.png")
    # Android notification icons must be white on transparent.
    mono = draw_mark(96, 0.9, (0, 0, 0, 0))
    alpha = mono.split()[3]
    white = Image.new("RGBA", mono.size, (255, 255, 255, 0))
    white.putalpha(alpha)
    white.save(IMAGES / "notification-icon.png")
    draw_mark(48, 0.9, (0, 0, 0, 0)).save(IMAGES / "favicon.png")


def bell(t, freq, decay, partials):
    tone = np.zeros_like(t)
    for ratio, gain in partials:
        tone += gain * np.sin(2 * math.pi * freq * ratio * t)
    return tone * np.exp(-t * decay)


def write_sound():
    """A two-stage register: a mechanical 'cha' click then a bright 'ching' bell."""
    SOUNDS.mkdir(parents=True, exist_ok=True)
    rate = 44100
    duration = 1.25
    t = np.arange(int(rate * duration)) / rate
    out = np.zeros_like(t)
    rng = np.random.default_rng(7)

    # 'cha': two short filtered noise clicks like a register drawer latch.
    for start, gain in ((0.0, 0.55), (0.055, 0.4)):
        n = int(0.035 * rate)
        noise = rng.standard_normal(n)
        noise = np.convolve(noise, np.ones(6) / 6, mode="same")
        env = np.exp(-np.arange(n) / rate * 90)
        i = int(start * rate)
        out[i : i + n] += gain * noise * env

    # 'ching': two bright bell strikes, inharmonic partials for a metallic ring.
    partials = [(1.0, 1.0), (2.76, 0.45), (5.4, 0.22), (8.93, 0.1)]
    for start, freq, gain in ((0.11, 1568.0, 0.5), (0.19, 2093.0, 0.42)):
        i = int(start * rate)
        local = t[: len(t) - i]
        out[i:] += gain * bell(local, freq, 5.5, partials)

    # gentle fade at the end and normalize with headroom
    fade = int(0.08 * rate)
    out[-fade:] *= np.linspace(1, 0, fade)
    out = out / np.max(np.abs(out)) * 0.85
    pcm = (out * 32767).astype(np.int16)
    with wave.open(str(SOUNDS / "cha_ching.wav"), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(struct.pack(f"<{len(pcm)}h", *pcm))


if __name__ == "__main__":
    write_images()
    write_sound()
    print("assets written")
