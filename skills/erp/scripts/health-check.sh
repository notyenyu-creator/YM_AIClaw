#!/usr/bin/env bash
set -euo pipefail

echo "[ERP health-check] Verifying skill files..."

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

required=(
  "$ROOT_DIR/SKILL.md"
  "$ROOT_DIR/reference/auto-schema-erp.md"
  "$ROOT_DIR/reference/db-schema-cheatsheet.md"
  "$ROOT_DIR/reference/feature-guide.md"
  "$ROOT_DIR/reference/analysis-templates.md"
)

missing=0
for file in "${required[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "missing: $file"
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  echo "[ERP health-check] FAILED"
  exit 1
fi

echo "[ERP health-check] OK"
