#!/usr/bin/env python3
from __future__ import annotations

import argparse
import math
from collections import deque
from pathlib import Path
from typing import Iterable

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_FRONT = Path.home() / "Downloads" / "train-front.png"
DEFAULT_SIDE = Path.home() / "Downloads" / "train-side.png"
DEFAULT_BACKGROUND = Path.home() / "Downloads" / "train-background.png"


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def clamp(value: int, min_value: int, max_value: int) -> int:
    return max(min_value, min(value, max_value))


def quantize_channel(value: int) -> int:
    return int(round(value / 16.0) * 16)


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    dr = a[0] - b[0]
    dg = a[1] - b[1]
    db = a[2] - b[2]
    return math.sqrt(dr * dr + dg * dg + db * db)


def collect_border_palette(image: Image.Image) -> list[tuple[int, int, int]]:
    width, height = image.size
    pixels = image.load()
    samples: list[tuple[int, int, int]] = []
    stride_x = max(1, width // 40)
    stride_y = max(1, height // 40)

    points: list[tuple[int, int]] = []
    for x in range(0, width, stride_x):
        points.append((x, 0))
        points.append((x, height - 1))
    for y in range(0, height, stride_y):
        points.append((0, y))
        points.append((width - 1, y))

    for x, y in points:
        r, g, b, a = pixels[x, y]
        if a < 8:
            continue
        sample = (quantize_channel(r), quantize_channel(g), quantize_channel(b))
        if any(color_distance(existing, sample) <= 28 for existing in samples):
            continue
        samples.append(sample)

    return samples


def is_background_like(
    rgba: tuple[int, int, int, int],
    palette: list[tuple[int, int, int]],
    tolerance: float = 42.0
) -> bool:
    r, g, b, a = rgba
    if a < 8:
        return True
    sample = (r, g, b)
    return any(color_distance(sample, color) <= tolerance for color in palette)


def trim_fake_background(source: Path, destination: Path, passes: int = 3) -> None:
    image = Image.open(source).convert("RGBA")

    for _ in range(passes):
        palette = collect_border_palette(image)
        if not palette:
            break
        width, height = image.size
        pixels = image.load()
        visited = [[False for _ in range(width)] for _ in range(height)]
        queue: deque[tuple[int, int]] = deque()

        def enqueue(x: int, y: int) -> None:
            if x < 0 or y < 0 or x >= width or y >= height:
                return
            if visited[y][x]:
                return
            if not is_background_like(pixels[x, y], palette):
                return
            visited[y][x] = True
            queue.append((x, y))

        for x in range(width):
            enqueue(x, 0)
            enqueue(x, height - 1)
        for y in range(height):
            enqueue(0, y)
            enqueue(width - 1, y)

        while queue:
            x, y = queue.popleft()
            enqueue(x - 1, y)
            enqueue(x + 1, y)
            enqueue(x, y - 1)
            enqueue(x, y + 1)
            enqueue(x - 1, y - 1)
            enqueue(x + 1, y - 1)
            enqueue(x - 1, y + 1)
            enqueue(x + 1, y + 1)

        min_x = width
        min_y = height
        max_x = -1
        max_y = -1

        for y in range(height):
            for x in range(width):
                if visited[y][x]:
                    r, g, b, _ = pixels[x, y]
                    pixels[x, y] = (r, g, b, 0)
                    continue
                if pixels[x, y][3] < 8:
                    continue
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y

        if max_x < min_x or max_y < min_y:
            break

        padding = max(6, round(max(width, height) * 0.012))
        crop_x = clamp(min_x - padding, 0, width - 1)
        crop_y = clamp(min_y - padding, 0, height - 1)
        crop_w = clamp(max_x - min_x + 1 + padding * 2, 1, width - crop_x)
        crop_h = clamp(max_y - min_y + 1 + padding * 2, 1, height - crop_y)
        image = image.crop((crop_x, crop_y, crop_x + crop_w, crop_y + crop_h))

    width, height = image.size
    pixels = image.load()
    visited = [[False for _ in range(width)] for _ in range(height)]
    largest_component: list[tuple[int, int]] = []
    largest_bbox: tuple[int, int, int, int] | None = None

    for y in range(height):
        for x in range(width):
            if visited[y][x] or pixels[x, y][3] < 8:
                continue

            queue: deque[tuple[int, int]] = deque([(x, y)])
            visited[y][x] = True
            component: list[tuple[int, int]] = []
            min_x = max_x = x
            min_y = max_y = y

            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                min_x = min(min_x, current_x)
                max_x = max(max_x, current_x)
                min_y = min(min_y, current_y)
                max_y = max(max_y, current_y)

                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                    (current_x - 1, current_y - 1),
                    (current_x + 1, current_y - 1),
                    (current_x - 1, current_y + 1),
                    (current_x + 1, current_y + 1)
                ):
                    if next_x < 0 or next_y < 0 or next_x >= width or next_y >= height:
                        continue
                    if visited[next_y][next_x] or pixels[next_x, next_y][3] < 8:
                        continue
                    visited[next_y][next_x] = True
                    queue.append((next_x, next_y))

            if len(component) > len(largest_component):
                largest_component = component
                largest_bbox = (min_x, min_y, max_x, max_y)

    if largest_bbox:
        keep = set(largest_component)
        for y in range(height):
            for x in range(width):
                if (x, y) in keep:
                    continue
                r, g, b, _ = pixels[x, y]
                pixels[x, y] = (r, g, b, 0)

        min_x, min_y, max_x, max_y = largest_bbox
        padding = max(8, round(max(width, height) * 0.02))
        crop_x = clamp(min_x - padding, 0, width - 1)
        crop_y = clamp(min_y - padding, 0, height - 1)
        crop_w = clamp(max_x - min_x + 1 + padding * 2, 1, width - crop_x)
        crop_h = clamp(max_y - min_y + 1 + padding * 2, 1, height - crop_y)
        image = image.crop((crop_x, crop_y, crop_x + crop_w, crop_y + crop_h))

    ensure_parent(destination)
    image.save(destination, format="PNG", optimize=True)


def copy_background(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    ensure_parent(destination)
    image.save(destination, format="PNG", optimize=True)


def backup_source(source: Path, backup_dir: Path) -> None:
    ensure_parent(backup_dir / source.name)
    image = Image.open(source).convert("RGBA")
    image.save(backup_dir / source.name, format="PNG", optimize=True)


def process_asset(source: Path, outputs: list[Path], trim: bool) -> None:
    if not source.exists():
        raise FileNotFoundError(f"missing source asset: {source}")

    for output in outputs:
        if trim:
            trim_fake_background(source, output)
        else:
            copy_background(source, output)


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare rail assets for Ranch-Agent.")
    parser.add_argument("--front", type=Path, default=DEFAULT_FRONT)
    parser.add_argument("--side", type=Path, default=DEFAULT_SIDE)
    parser.add_argument("--background", type=Path, default=DEFAULT_BACKGROUND)
    args = parser.parse_args()

    repo_outputs = {
        "front": ROOT / "assets" / "user-pack" / "icons" / "train_front.png",
        "side": ROOT / "assets" / "user-pack" / "sprites" / "train_side.png",
        "background": ROOT / "assets" / "user-pack" / "tiles" / "rail_stage_bg.png"
    }
    extension_outputs = {
        "front": ROOT / "extension" / "assets" / "user-pack" / "icons" / "train_front.png",
        "side": ROOT / "extension" / "assets" / "user-pack" / "sprites" / "train_side.png",
        "background": ROOT / "extension" / "assets" / "user-pack" / "tiles" / "rail_stage_bg.png"
    }

    backup_dir = ROOT / "assets" / "user-pack" / "_source"
    for source in [args.front, args.side, args.background]:
        if source.exists():
            backup_source(source, backup_dir)

    process_asset(args.front, [repo_outputs["front"], extension_outputs["front"]], trim=True)
    process_asset(args.side, [repo_outputs["side"], extension_outputs["side"]], trim=True)
    process_asset(args.background, [repo_outputs["background"], extension_outputs["background"]], trim=False)

    print(f"prepared front -> {repo_outputs['front']}")
    print(f"prepared side -> {repo_outputs['side']}")
    print(f"prepared background -> {repo_outputs['background']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
