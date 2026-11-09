#!/usr/bin/env bash
set -euo pipefail
# Usage: ./scripts/rename.sh "New Name" new-slug
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NEW_NAME="${1:-}"
NEW_SLUG="${2:-}"
if [[ -z "$NEW_NAME" || -z "$NEW_SLUG" ]]; then
  echo "Usage: ./scripts/rename.sh \"New Name\" new-slug"
  exit 1
fi
OLD_NAME="$(python3 -c "import json; print(json.load(open('$ROOT/project.config.json'))['name'])")"
OLD_SLUG="$(python3 -c "import json; print(json.load(open('$ROOT/project.config.json'))['slug'])")"
export ROOT NEW_NAME NEW_SLUG OLD_NAME OLD_SLUG
python3 - << 'PY'
import json, os
from pathlib import Path
root = Path(os.environ["ROOT"])
path = root / "project.config.json"
cfg = json.loads(path.read_text())
cfg["name"] = os.environ["NEW_NAME"]
cfg["slug"] = os.environ["NEW_SLUG"]
path.write_text(json.dumps(cfg, indent=2) + "\n")
old_name = os.environ["OLD_NAME"]
new_name = os.environ["NEW_NAME"]
old_slug = os.environ["OLD_SLUG"]
new_slug = os.environ["NEW_SLUG"]
for rel in ("README.md", "docs/DEMO_SCRIPT.md", "package.json"):
    file = root / rel
    if file.exists():
        text = file.read_text()
        text = text.replace(old_name, new_name).replace(old_slug, new_slug)
        file.write_text(text)
print(f"Renamed {old_name} ({old_slug}) -> {new_name} ({new_slug})")
print("The running app reads project.config.json; restart npm run dev to pick up the change.")
PY
