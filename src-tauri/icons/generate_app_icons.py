#!/usr/bin/env python3
"""从 SVG 生成多尺寸透明 PNG 和 Windows ICO，输出名称使用源文件名前缀。

使用 Inkscape 渲染 SVG，使用 Python 标准库将 PNG 打包为 ICO。
"""

from __future__ import annotations

import argparse
import shutil
import struct
import subprocess
import sys
from pathlib import Path


DEFAULT_SIZES = (16, 24, 32, 48, 64, 128, 256)


def find_inkscape(explicit_path: str | None) -> str:
    """查找 Inkscape 命令行程序，找不到时给出明确提示。"""
    candidates = []
    if explicit_path:
        candidates.append(explicit_path)

    discovered = shutil.which("inkscape")
    if discovered:
        candidates.append(discovered)

    candidates.extend(
        [
            r"D:\Program Files\Inkscape\bin\inkscape.com",
            r"C:\Program Files\Inkscape\bin\inkscape.com",
            r"C:\Program Files\Inkscape\bin\inkscape.exe",
        ]
    )

    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return str(path)

    raise SystemExit(
        "未找到 Inkscape，请安装或通过 --inkscape 指定程序路径。"
    )


def render_png(inkscape: str, svg_path: Path, png_path: Path, size: int) -> None:
    """按完整画布渲染正方形 PNG，保持透明背景和原有留白。"""
    command = [
        inkscape,
        str(svg_path),
        "--export-type=png",
        "--export-area-page",
        "--export-background-opacity=0",
        f"--export-filename={png_path}",
        f"--export-width={size}",
        f"--export-height={size}",
    ]
    subprocess.run(command, check=True)


def write_png_ico(png_paths: list[Path], ico_path: Path) -> None:
    """将多个尺寸的 PNG 打包为带透明通道的 ICO。"""
    entries = []
    image_data = []

    offset = 6 + 16 * len(png_paths)
    for png_path in png_paths:
        data = png_path.read_bytes()
        size = struct.unpack(">I", data[16:20])[0]
        width_byte = 0 if size >= 256 else size
        height_byte = 0 if size >= 256 else size
        entries.append(
            struct.pack(
                "<BBBBHHII",
                width_byte,
                height_byte,
                0,
                0,
                1,
                32,
                len(data),
                offset,
            )
        )
        image_data.append(data)
        offset += len(data)

    with ico_path.open("wb") as ico_file:
        ico_file.write(struct.pack("<HHH", 0, 1, len(entries)))
        for entry in entries:
            ico_file.write(entry)
        for data in image_data:
            ico_file.write(data)


def parse_sizes(raw_sizes: str) -> tuple[int, ...]:
    """解析逗号分隔的尺寸列表，ICO 每个图层最大为 256 像素。"""
    sizes = []
    for raw in raw_sizes.split(","):
        raw = raw.strip()
        if not raw:
            continue
        try:
            size = int(raw)
        except ValueError as exc:
            raise argparse.ArgumentTypeError("尺寸必须是整数") from exc
        if size <= 0 or size > 256:
            raise argparse.ArgumentTypeError("尺寸必须在 1 到 256 之间")
        sizes.append(size)
    if not sizes:
        raise argparse.ArgumentTypeError("至少需要一个尺寸")
    return tuple(dict.fromkeys(sizes))


def main() -> int:
    script_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(
        description="从 SVG 生成多尺寸 PNG 和 Windows ICO 图标，输出名称使用源文件名。"
    )
    parser.add_argument(
        "--svg",
        type=Path,
        default=script_dir / "icon.svg",
        help="源 SVG 路径，默认为脚本同目录下的 icon.svg，输出前缀取源文件名。",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=script_dir,
        help="输出目录，默认为脚本所在目录。",
    )
    parser.add_argument(
        "--sizes",
        type=parse_sizes,
        default=DEFAULT_SIZES,
        help="逗号分隔的 PNG/ICO 尺寸，默认为 16,24,32,48,64,128,256。",
    )
    parser.add_argument(
        "--inkscape",
        help="可选，指定 inkscape.com 或 inkscape.exe 的路径。",
    )
    args = parser.parse_args()

    svg_path = args.svg.resolve()
    out_dir = args.out_dir.resolve()
    if not svg_path.exists():
        raise SystemExit(f"SVG 源文件不存在：{svg_path}")

    out_dir.mkdir(parents=True, exist_ok=True)
    inkscape = find_inkscape(args.inkscape)

    png_paths = []
    for size in args.sizes:
        png_path = out_dir / f"{svg_path.stem}_{size}.png"
        render_png(inkscape, svg_path, png_path, size)
        png_paths.append(png_path)
        print(f"已生成 {png_path}")

    ico_path = out_dir / f"{svg_path.stem}.ico"
    write_png_ico(png_paths, ico_path)
    print(f"已生成 {ico_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
