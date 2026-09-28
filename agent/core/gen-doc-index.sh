#!/usr/bin/env bash
# Generates a compact doc index: path + first heading, one line per md file.
set -euo pipefail
root="${1:-.}"; out="$root/.context/DOC-INDEX.md"; mkdir -p "$root/.context"
{ echo "# Doc index — generated $(date +%F), $(find "$root" -name '*.md' -not -path '*/node_modules/*' -not -path '*/.git/*' | wc -l | tr -d ' ') files"
  find "$root" -name '*.md' -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/vendor/*' | sort | while read -r f; do
    h=$(grep -m1 '^#' "$f" 2>/dev/null | cut -c1-80 || true)
    echo "- ${f#"$root"/} — ${h:-'(no heading)'}"
  done; } > "$out"
echo "wrote $out ($(wc -l < "$out" | tr -d ' ') lines)"
