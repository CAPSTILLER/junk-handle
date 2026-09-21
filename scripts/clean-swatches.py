#!/usr/bin/env python3
"""Trim light sheet margins from frame/hair texture quads, then center-crop to square.

Overwrites JPEGs under public/assets/textures/{frames,hair}/.
Skin PNGs are solid fills and are left alone.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public" / "assets" / "textures"
DIRS = [ROOT / "frames", ROOT / "hair"]
OUT_SIZE = 256


def is_light_sheet_pixel(rgb: np.ndarray) -> np.ndarray:
    lum = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    return (lum >= 175) & (sat <= 48)


def edge_is_mostly_sheet(strip: np.ndarray, frac: float = 0.55) -> bool:
    if strip.size == 0:
        return False
    return float(is_light_sheet_pixel(strip).mean()) >= frac


def trim_sheet_margins(a: np.ndarray) -> np.ndarray:
    a = a.copy()
    for _ in range(max(a.shape[0], a.shape[1])):
        changed = False
        if a.shape[0] > 8 and edge_is_mostly_sheet(a[0:1]):
            a = a[1:]
            changed = True
        if a.shape[0] > 8 and edge_is_mostly_sheet(a[-1:]):
            a = a[:-1]
            changed = True
        if a.shape[1] > 8 and edge_is_mostly_sheet(a[:, 0:1]):
            a = a[:, 1:]
            changed = True
        if a.shape[1] > 8 and edge_is_mostly_sheet(a[:, -1:]):
            a = a[:, :-1]
            changed = True
        if not changed:
            break
    content = ~is_light_sheet_pixel(a)
    ys, xs = np.where(content)
    if len(xs) < 40:
        return a
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    inset = 2
    x0 = min(x0 + inset, x1)
    y0 = min(y0 + inset, y1)
    x1 = max(x1 - inset, x0)
    y1 = max(y1 - inset, y0)
    return a[y0 : y1 + 1, x0 : x1 + 1]


def center_square(a: np.ndarray) -> np.ndarray:
    h, w, _ = a.shape
    side = min(h, w)
    if side < 4:
        return a
    y0 = (h - side) // 2
    x0 = (w - side) // 2
    return a[y0 : y0 + side, x0 : x0 + side]


def clean_one(path: Path) -> dict:
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    before = a.shape[:2]
    cs = max(4, min(a.shape[0], a.shape[1]) // 32)
    corners = [a[:cs, :cs], a[:cs, -cs:], a[-cs:, :cs], a[-cs:, -cs:]]
    light_corners = sum(
        1 for c in corners if float(is_light_sheet_pixel(c).mean()) > 0.6
    )
    trimmed = False
    if light_corners >= 2:
        a = trim_sheet_margins(a)
        trimmed = True
    a = center_square(a)
    if trimmed:
        a = trim_sheet_margins(a)
        a = center_square(a)
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize(
        (OUT_SIZE, OUT_SIZE), Image.Resampling.LANCZOS
    )
    out.save(path, quality=93, optimize=True)
    return {
        "file": path.name,
        "before": before,
        "trimmed": trimmed,
        "light_corners": light_corners,
        "after_crop": a.shape[:2],
    }


def main() -> None:
    results = []
    for d in DIRS:
        for path in sorted(d.glob("*.jpg")):
            results.append(clean_one(path))
    trimmed_n = sum(1 for r in results if r["trimmed"])
    print(f"Processed {len(results)} images; trimmed sheet margins on {trimmed_n}")
    for r in results:
        if r["trimmed"]:
            print(
                f"  TRIM {r['file']} corners={r['light_corners']} "
                f"{r['before']} -> crop {r['after_crop']}"
            )


if __name__ == "__main__":
    main()
