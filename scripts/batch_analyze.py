"""Batch-analyze body photos and write annotated visualizations.

Usage:
    python -m scripts.batch_analyze --in ~/Desktop/fitness --out ~/Desktop/body-analysis-results
"""
import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.prompts import SYSTEM_PROMPT, USER_PROMPT
from backend.vlm_client import call_vlm_json

load_dotenv(ROOT / ".env")

REGION_ORDER = [
    "shoulders", "chest", "arms", "abs", "back", "legs",
    "posture", "symmetry", "body_fat", "conditioning",
]
PANEL_W = 560
PAD = 20


def grade_color(score):
    if score is None:
        return (110, 110, 120)
    if score >= 8:
        return (124, 242, 195)
    if score >= 6:
        return (106, 165, 255)
    if score >= 4:
        return (255, 184, 106)
    return (255, 122, 122)


def load_font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for p in candidates:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def wrap_text(draw, text, font, max_w):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def render(image_path: Path, result: dict, out_path: Path) -> None:
    img = Image.open(image_path).convert("RGB")
    W, H = img.size
    canvas = Image.new("RGB", (W + PANEL_W, H), (13, 15, 20))
    canvas.paste(img, (0, 0))
    draw = ImageDraw.Draw(canvas, "RGBA")

    f_lg = load_font(48, bold=True)
    f_md = load_font(22, bold=True)
    f_sm = load_font(15)
    f_xs = load_font(13)
    f_bar = load_font(14, bold=True)

    # annotations on image
    regions = result.get("regions", {}) or {}
    drawn_boxes = 0
    for key, r in regions.items():
        if not r or not r.get("bbox"):
            continue
        bbox = r["bbox"]
        if len(bbox) != 4:
            continue
        x, y, w, h = bbox
        x, y, w, h = x * W, y * H, w * W, h * H
        # ignore tiny / nonsensical boxes
        if w < 4 or h < 4 or x < -10 or y < -10 or x > W + 10 or y > H + 10:
            continue
        col = grade_color(r.get("score"))
        draw.rectangle([x, y, x + w, y + h], outline=col + (255,), width=4)
        label = f"{key.replace('_', ' ')} {r.get('score') if r.get('score') is not None else '?'}"
        tw = draw.textlength(label, font=f_xs)
        draw.rectangle([x, y - 22, x + tw + 12, y], fill=col + (220,))
        draw.text((x + 6, y - 20), label, fill=(0, 0, 0), font=f_xs)
        drawn_boxes += 1

    # side panel
    px = W + PAD
    py = PAD
    inner_w = PANEL_W - 2 * PAD

    overall = result.get("overall_score")
    bf = result.get("estimated_body_fat_percent")
    draw.text((px, py), str(overall if overall is not None else "–"), fill=(124, 242, 195), font=f_lg)
    overall_w = draw.textlength(str(overall if overall is not None else "–"), font=f_lg)
    draw.text((px + overall_w + 8, py + 28), "/ 100", fill=(138, 147, 166), font=f_sm)
    draw.text((px + 240, py), f"{bf if bf is not None else '–'}%", fill=(232, 236, 243), font=f_md)
    draw.text((px + 240, py + 32), "est. body fat", fill=(138, 147, 166), font=f_xs)
    py += 80
    draw.line([px, py, px + inner_w, py], fill=(38, 43, 58), width=1)
    py += 14

    for line in wrap_text(draw, result.get("summary", ""), f_sm, inner_w):
        draw.text((px, py), line, fill=(232, 236, 243), font=f_sm)
        py += 20
    py += 8

    bar_h = 8
    name_w = 110
    num_w = 32
    track_x0 = px + name_w + 8
    track_x1 = px + inner_w - num_w - 8
    for key in REGION_ORDER:
        r = regions.get(key)
        if not r:
            continue
        score = r.get("score")
        col = grade_color(score)
        draw.text((px, py - 4), key.replace("_", " "), fill=(138, 147, 166), font=f_xs)
        draw.rectangle([track_x0, py, track_x1, py + bar_h], fill=(31, 35, 48))
        pct = (score or 0) / 10.0
        fill_x1 = track_x0 + (track_x1 - track_x0) * pct
        draw.rectangle([track_x0, py, fill_x1, py + bar_h], fill=col)
        num = "–" if score is None else str(score)
        nw = draw.textlength(num, font=f_bar)
        draw.text((track_x1 + 8 + (num_w - nw) / 2 - 4, py - 4), num, fill=(232, 236, 243), font=f_bar)
        py += 14
        note = r.get("notes") or ""
        if note:
            for line in wrap_text(draw, note, f_xs, inner_w - name_w - 8 - num_w - 8)[:2]:
                draw.text((track_x0, py), line, fill=(120, 128, 144), font=f_xs)
                py += 15
        py += 6

    if py < H - 120:
        py += 6
        draw.line([px, py, px + inner_w, py], fill=(38, 43, 58), width=1)
        py += 12
        draw.text((px, py), "PRIORITIES", fill=(138, 147, 166), font=f_xs)
        py += 18
        for p in (result.get("priorities") or [])[:4]:
            if py > H - 20:
                break
            for line in wrap_text(draw, "• " + p, f_sm, inner_w)[:2]:
                draw.text((px, py), line, fill=(232, 236, 243), font=f_sm)
                py += 20

    canvas.save(out_path, "JPEG", quality=92)
    print(f"  → {out_path}  (boxes drawn: {drawn_boxes})")


async def analyze_one(image_path: Path, out_dir: Path) -> None:
    print(f"\n→ {image_path.name}")
    body = image_path.read_bytes()
    mime = "image/jpeg" if image_path.suffix.lower() in {".jpg", ".jpeg"} else "image/png"
    result = await call_vlm_json(SYSTEM_PROMPT, USER_PROMPT, body, mime)
    (out_dir / f"{image_path.stem}.json").write_text(json.dumps(result, indent=2))
    render(image_path, result, out_dir / f"{image_path.stem}_analyzed.jpg")
    print(f"  scored overall={result.get('overall_score')} bf={result.get('estimated_body_fat_percent')}%")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="in_dir", required=True)
    ap.add_argument("--out", dest="out_dir", required=True)
    args = ap.parse_args()

    in_dir = Path(os.path.expanduser(args.in_dir))
    out_dir = Path(os.path.expanduser(args.out_dir))
    out_dir.mkdir(parents=True, exist_ok=True)

    images = sorted(
        p for p in in_dir.iterdir()
        if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
    )
    if not images:
        print(f"no images found in {in_dir}")
        return

    print(f"analyzing {len(images)} image(s) → {out_dir}")
    for p in images:
        try:
            await analyze_one(p, out_dir)
        except Exception as e:
            print(f"  ! failed: {e}")


if __name__ == "__main__":
    asyncio.run(main())
