#!/usr/bin/env bash
# Enforces constitution §2.1 / §5: the single allowed-operator email must be
# byte-identical across all three enforcement locations. Fails (naming the
# mismatch) if they diverge. Wired into the validate-specs CI workflow.
set -euo pipefail

cd "$(dirname "$0")/.."

EMAIL_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'

declare -a FILES=(
  "firestore.rules"
  "trigger-api/src/auth.ts"
  "pwa/src/config.ts"
)

# Extract the email from each file's `allowed-email-pin` marker line.
extract() {
  local file="$1"
  grep -E 'allowed-email-pin' "$file" | grep -oE "$EMAIL_RE" | head -n1
}

declare -a VALUES=()
fail=0
for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "MISSING: $f" >&2
    fail=1
    continue
  fi
  v="$(extract "$f" || true)"
  if [[ -z "$v" ]]; then
    echo "NO allowed-email-pin marker in: $f" >&2
    fail=1
    continue
  fi
  VALUES+=("$v")
  echo "$f -> $v"
done

if [[ "$fail" -ne 0 ]]; then
  echo "FAIL: allowed-email invariant could not be verified." >&2
  exit 1
fi

first="${VALUES[0]}"
for i in "${!VALUES[@]}"; do
  if [[ "${VALUES[$i]}" != "$first" ]]; then
    echo "FAIL: allowed-email mismatch across the three locations." >&2
    exit 1
  fi
done

echo "OK: allowed-email is identical across all ${#FILES[@]} locations ($first)."
