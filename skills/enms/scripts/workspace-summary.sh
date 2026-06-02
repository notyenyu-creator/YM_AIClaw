#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "# EnMS Skill Workspace Summary"
echo
echo "skill_root: $ROOT_DIR"
echo "updated_at: $(date '+%Y-%m-%d %H:%M:%S %z')"
echo
echo "## Files"
find "$ROOT_DIR" -maxdepth 3 -type f | sort
