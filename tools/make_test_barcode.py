"""
Draws an EAN-13 barcode as a PNG test fixture (no third-party libraries).

    py tools/make_test_barcode.py                      -> tests/fixtures/ean13-5000159484695.png
    py tools/make_test_barcode.py --y4m camera.y4m     -> also a fake-camera video (for Chrome's
                                                          --use-file-for-fake-video-capture)

EAN-13 layout: start guard 101, six left digits (L/G codes, chosen by the first
digit), centre guard 01010, six right digits (R codes), end guard 101.
"""
import pathlib
import struct
import sys
import zlib

CODE = "5000159484695"
L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"]
G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"]
R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"]
PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"]


def modules(code):
    digits = [int(c) for c in code]
    left = "".join((L if p == "L" else G)[d] for p, d in zip(PARITY[digits[0]], digits[1:7]))
    right = "".join(R[d] for d in digits[7:])
    return "101" + left + "01010" + right + "101"


def draw(code, module_px=4, height=180, quiet=12):
    bars = modules(code)
    width = (len(bars) + 2 * quiet) * module_px
    rows = []
    for _ in range(height):
        row = bytearray([0])  # PNG filter byte
        for x in range(width):
            m = x // module_px - quiet
            row.append(0 if 0 <= m < len(bars) and bars[m] == "1" else 255)
        rows.append(bytes(row))
    return width, height, rows


def png(width, height, rows):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)  # 8-bit greyscale
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")


def y4m(width, height, rows, frame_w=640, frame_h=480, frames=2):
    """Grey background with the barcode centred, in 4:2:0 YUV (grey => U = V = 128)."""
    y = bytearray([200]) * (frame_w * frame_h)
    ox, oy = (frame_w - width) // 2, (frame_h - height) // 2
    for j, row in enumerate(rows):
        start = (oy + j) * frame_w + ox
        y[start:start + width] = row[1:]
    chroma = bytes([128]) * (frame_w * frame_h // 2)
    header = f"YUV4MPEG2 W{frame_w} H{frame_h} F15:1 Ip A1:1 C420jpeg\n".encode()
    return header + b"".join(b"FRAME\n" + bytes(y) + chroma for _ in range(frames))


if __name__ == "__main__":
    width, height, rows = draw(CODE)
    out = pathlib.Path(__file__).resolve().parent.parent / "tests" / "fixtures" / f"ean13-{CODE}.png"
    out.parent.mkdir(exist_ok=True)
    out.write_bytes(png(width, height, rows))
    print("wrote", out)
    if "--y4m" in sys.argv:
        target = pathlib.Path(sys.argv[sys.argv.index("--y4m") + 1])
        target.write_bytes(y4m(width, height, rows))
        print("wrote", target)
