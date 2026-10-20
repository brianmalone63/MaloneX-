#!/usr/bin/env sh
set -eu

TARGET_DIR="${1:-.}"

if [ ! -d "$TARGET_DIR" ]; then
  echo "scan-secrets: not a directory: $TARGET_DIR" >&2
  exit 2
fi

# High-confidence patterns only. No generic "password=" to avoid false positives.
# Do not print matched content; only file names.
PATTERNS='(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]{10,}|sk_live_[0-9a-zA-Z]{24,}'

TMPFILE=$(mktemp "${TMPDIR:-/tmp}/scan-secrets.XXXXXX")
trap 'rm -f "$TMPFILE"' EXIT

find "$TARGET_DIR" \
  \( -path '*/.git' -o -path '*/node_modules' -o -path '*/dist' -o -path '*/coverage' \) -prune -o \
  -type f \
  ! -name 'package-lock.json' \
  ! -path '*/scripts/scan-secrets.sh' \
  -exec grep -lIE "$PATTERNS" {} + > "$TMPFILE" 2>/dev/null || true

if [ -s "$TMPFILE" ]; then
  echo "Potential secrets found in:"
  cat "$TMPFILE"
  exit 1
fi

exit 0
