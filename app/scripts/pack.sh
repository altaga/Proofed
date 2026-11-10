#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ROOT
python3 - << 'PY'
import json, os, zipfile
from datetime import datetime
from pathlib import Path

root = Path(os.environ["ROOT"])
cfg = json.loads((root / "project.config.json").read_text())
slug = cfg["slug"]
name = cfg["name"]
stamp = datetime.now().strftime("%Y%m%d-%H%M")
out_dir = Path(os.environ.get("DIST_DIR", str(root / "dist")))
out_dir.mkdir(parents=True, exist_ok=True)
zip_path = out_dir / f"{slug}-{stamp}.zip"

skip_dirs = {".git", "node_modules", ".next", "data", "dist", "coverage", "test-artifacts", "playwright-report", "test-results", "blob-report"}
skip_names = {".env", ".env.local"}
skip_suffixes = {".sqlite", ".sqlite-shm", ".sqlite-wal"}

with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]
        for filename in filenames:
            path = Path(dirpath) / filename
            if path.name in skip_names:
                continue
            if path.suffix in skip_suffixes or any(str(path).endswith(suf) for suf in skip_suffixes):
                continue
            rel = path.relative_to(root)
            zf.write(path, arcname=str(Path(slug) / rel))
    # Keep an empty data directory in the archive.
    zf.writestr(f"{slug}/data/.gitkeep", "# SQLite and evidence files are created here at runtime.\n")

print(f"Packed {name} into {zip_path}")
print(f"size_bytes={zip_path.stat().st_size}")
PY
