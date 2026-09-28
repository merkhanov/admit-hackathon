#!/usr/bin/env bash
# Usage: visual-diff.sh <before-dir> <after-dir> — diffs matching PNGs, prints mask paths.
set -euo pipefail
fail=0
for b in "$1"/*.png; do
  a="$2/$(basename "$b")"; m="$2/$(basename "$b" .png).diff.png"
  [ -f "$a" ] || { echo "MISSING $a"; fail=1; continue; }
  if npx odiff-bin "$b" "$a" "$m" --antialiasing --threshold 0.1; then
    echo "SAME $(basename "$b")"
  else
    code=$?; [ "$code" = 21 ] && echo "DIMENSION-MISMATCH $(basename "$b")" || echo "CHANGED $(basename "$b") — READ the mask: $m"; fail=1
  fi
done
exit $fail
