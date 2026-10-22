"""Build lighter browser images from the supplied PNG artwork (requires Pillow)."""
from pathlib import Path
from io import BytesIO
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public" / "assets" / "brand"
NAMES = ("disc", "camera", "crowd", "record-frames", "headphones", "jazz")

for name in NAMES:
    source = ROOT / f"{name}.png"
    target = ROOT / f"{name}.webp"
    if source.exists():
        raw = source.read_bytes()
    else:
        relative = f"public/assets/brand/{name}.png"
        commit = subprocess.check_output(["git", "log", "-1", "--format=%H", "--diff-filter=A", "--", relative], cwd=ROOT.parents[2], text=True).strip()
        if not commit:
            raise FileNotFoundError(f"Original asset not found in Git history: {relative}")
        raw = subprocess.check_output(["git", "show", f"{commit}:{relative}"], cwd=ROOT.parents[2])
    with Image.open(BytesIO(raw)) as image:
        image.save(target, "WEBP", quality=86, method=6, exact=True)
    print(f"{name}: {len(raw):,} -> {target.stat().st_size:,} bytes")
