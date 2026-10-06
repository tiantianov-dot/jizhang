"""gen_icons.py — 生成 PWA 图标（几何绘制，确定性结果）

用法: python scripts/gen_icons.py
产物: public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png
设计: 品牌绿底 + 白色 ¥ 符号（账本一眼可辨）
"""

from pathlib import Path

from PIL import Image, ImageDraw

BRAND = (15, 110, 86)  # #0F6E56
WHITE = (255, 255, 255)

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_yen(draw, size, color):
    """在 size x size 画布中央绘制 ¥（笔画宽度约为尺寸的 7%）"""
    s = size
    w = max(2, int(s * 0.075))

    def line(p1, p2):
        draw.line([p1, p2], fill=color, width=w)
        # 圆头
        r = w / 2
        for p in (p1, p2):
            draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=color)

    line((s * 0.32, s * 0.28), (s * 0.50, s * 0.50))  # 左上
    line((s * 0.68, s * 0.28), (s * 0.50, s * 0.50))  # 右上
    line((s * 0.50, s * 0.50), (s * 0.50, s * 0.76))  # 竖
    line((s * 0.35, s * 0.58), (s * 0.65, s * 0.58))  # 横一
    line((s * 0.35, s * 0.67), (s * 0.65, s * 0.67))  # 横二


def make(size, path, rounded=True, opaque=False):
    img = Image.new("RGB" if opaque else "RGBA", (size, size), BRAND if opaque else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if not opaque:
        if rounded:
            rounded_rect(d, [0, 0, size - 1, size - 1], int(size * 0.22), BRAND + (255,))
        else:
            d.rectangle([0, 0, size, size], fill=BRAND + (255,))
    draw_yen(d, size, WHITE if opaque else WHITE + (255,))
    img.save(path)
    print(f"  {path.name} {size}x{size}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    make(192, OUT / "icon-192.png")
    make(512, OUT / "icon-512.png")
    make(512, OUT / "icon-maskable-512.png", rounded=False)  # maskable 全出血，安全区内绘 ¥
    make(180, OUT / "apple-touch-icon.png", rounded=False, opaque=True)  # iOS 自行裁圆角


if __name__ == "__main__":
    main()
