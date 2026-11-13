"""
Generates the app's PNG icons with no third-party libraries.

    py tools/make_icons.py

The design is a progress ring (the app's protein ring) on a dark square. The ring
sits inside the central 80% circle, so the same image is safe as a "maskable" icon
that Android crops into circles/squircles. Edges are anti-aliased using each pixel's
distance to the shape.
"""
import math
import pathlib
import struct
import zlib

BG = (14, 16, 20)
TRACK = (38, 43, 54)
RING = (52, 211, 153)

OUT = pathlib.Path(__file__).resolve().parent.parent / "icons"
SIZES = {"icon-192.png": 192, "icon-512.png": 512, "apple-touch-icon.png": 180}


def coverage(distance):
    """Signed distance to an edge (px) -> how much of the pixel is inside (0..1)."""
    return max(0.0, min(1.0, 0.5 - distance))


def arc_distance(x, y, cx, cy, radius, start, sweep):
    """Distance from (x, y) to a circular arc's centre line (round caps are handled by the ends)."""
    dx, dy = x - cx, y - cy
    angle = (math.atan2(dy, dx) - start) % (2 * math.pi)
    if angle <= sweep:
        return abs(math.hypot(dx, dy) - radius)
    ends = [(cx + radius * math.cos(a), cy + radius * math.sin(a)) for a in (start, start + sweep)]
    return min(math.hypot(x - ex, y - ey) for ex, ey in ends)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def draw(size):
    cx = cy = size / 2
    radius = size * 0.26
    half_width = size * 0.075
    start, sweep = -math.pi / 2, 2 * math.pi * 0.72  # from 12 o'clock, 72% of the way round

    rows = []
    for j in range(size):
        row = bytearray([0])  # PNG filter type 0 (none) for this scanline
        for i in range(size):
            x, y = i + 0.5, j + 0.5
            track = coverage(abs(math.hypot(x - cx, y - cy) - radius) - half_width)
            arc = coverage(arc_distance(x, y, cx, cy, radius, start, sweep) - half_width)
            pixel = mix(mix(BG, TRACK, track), RING, arc)
            row += bytes(round(v) for v in pixel)
        rows.append(bytes(row))
    return encode_png(size, b"".join(rows))


def encode_png(size, raw):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, size in SIZES.items():
        (OUT / name).write_bytes(draw(size))
        print(f"wrote icons/{name} ({size}x{size})")
