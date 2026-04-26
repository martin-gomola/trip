#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scan_pii.sh [--staged|--all] [--] [path...]

Modes:
  --staged   Scan staged files (default)
  --all      Scan all tracked files

If one or more paths are provided, only those paths are scanned.
EOF
}

mode="staged"
explicit_paths=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --staged)
      mode="staged"
      shift
      ;;
    --all)
      mode="all"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      explicit_paths=1
      break
      ;;
  esac
done

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "Run this script inside a git repository."
  exit 2
fi

declare -a files=()
if [[ $# -gt 0 ]]; then
  files=("$@")
elif [[ "$mode" == "staged" ]]; then
  while IFS= read -r -d '' f; do
    files+=("$f")
  done < <(git diff --cached --name-only -z --diff-filter=ACMR)
else
  while IFS= read -r -d '' f; do
    files+=("$f")
  done < <(git ls-files -z)
fi

declare -a existing_files=()
if [[ ${#files[@]} -gt 0 ]]; then
  for f in "${files[@]}"; do
    if [[ "$mode" == "staged" && "$explicit_paths" -eq 0 ]]; then
      git cat-file -e ":$f" >/dev/null 2>&1 && existing_files+=("$f")
    elif [[ "$mode" == "staged" && "$explicit_paths" -eq 1 ]]; then
      if git cat-file -e ":$f" >/dev/null 2>&1; then
        existing_files+=("$f")
      elif [[ -f "$f" ]]; then
        existing_files+=("$f")
      fi
    elif [[ -f "$f" ]]; then
      existing_files+=("$f")
    fi
  done
fi

if [[ ${#existing_files[@]} -eq 0 ]]; then
  echo "No files to scan."
  exit 0
fi

ignore_pattern='pii:allow|yourusername|<service-user>|<your-user>|example\.com|trip\.yourdomain\.com|user@example\.com|admin@example\.com|noreply@example\.com|your-email@example\.com|your-email@gmail\.com|your@email\.com|TRIP_API_TOKEN=replace-me|OIDC_CLIENT_SECRET=replace-me|ACCESS_TOKEN_EXPIRE_MINUTES=[0-9]+|REFRESH_TOKEN_EXPIRE_MINUTES=[0-9]+'

declare -a checks=(
  'Email address|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
  'AWS access key|AKIA[0-9A-Z]{16}'
  'GitHub token|ghp_[[:alnum:]]{36}|github_pat_[[:alnum:]_]{20,}'
  'OpenAI-style secret key|sk-[[:alnum:]]{20,}'
  'Private key block|-----BEGIN ([A-Z0-9 ]+ )?PRIVATE KEY-----'
  'User home path|/Users/[A-Za-z0-9._-]+/'
  'Concrete TRIP public URL|https?://trip\.[A-Za-z0-9.-]+'
  'Env token assignment|[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|API_KEY)[A-Z0-9_]*=[^#[:space:]][^[:space:]]+'
)

found=0

for entry in "${checks[@]}"; do
  label="${entry%%|*}"
  pattern="${entry#*|}"
  check_output=""

  if [[ "$mode" == "staged" ]]; then
    for f in "${existing_files[@]}"; do
      if git cat-file -e ":$f" >/dev/null 2>&1; then
        matches="$(git show ":$f" 2>/dev/null | LC_ALL=C grep -nEa -e "$pattern" || true)"
        if [[ -n "$matches" ]]; then
          matches="$(printf '%s\n' "$matches" | sed "s|^|$f:|")"
          check_output+="$matches"$'\n'
        fi
      elif [[ -f "$f" ]]; then
        matches="$(LC_ALL=C grep -nHEa -e "$pattern" "$f" 2>/dev/null || true)"
        [[ -n "$matches" ]] && check_output+="$matches"$'\n'
      fi
    done
  else
    matches="$(rg -n --with-filename --no-heading -I -e "$pattern" -- "${existing_files[@]}" 2>/dev/null || true)"
    if [[ -z "$matches" ]]; then
      matches="$(LC_ALL=C grep -nHEa -e "$pattern" "${existing_files[@]}" 2>/dev/null || true)"
    fi
    check_output="$matches"
  fi

  if [[ -z "$check_output" ]]; then
    continue
  fi

  filtered="$(printf '%s\n' "$check_output" | grep -Ev "$ignore_pattern" || true)"
  if [[ -z "$filtered" ]]; then
    continue
  fi

  found=1
  echo
  echo "[PII/Secret] $label"
  printf '%s\n' "$filtered"
done

if [[ "$found" -eq 1 ]]; then
  echo
  echo "PII/secret scan failed. Redact findings and re-run before commit."
  exit 1
fi

echo "PII/secret scan passed."
