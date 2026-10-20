#!/usr/bin/env bash
# Run one skill's eval suite. Usage: scripts/eval.sh <skill> [claude plugin eval args…]
# e.g. scripts/eval.sh ship --case status-resume --runs 1 --keep-temp
set -euo pipefail
cd "$(dirname "$0")/.."

skill=${1:?usage: scripts/eval.sh <skill> [args…]}
shift
[ -d "evals/$skill" ] || { echo "no eval suite at evals/$skill" >&2; exit 2; }

scripts/sync-eval-fixtures.sh --check
mkdir -p "evals/$skill/results"
claude plugin eval . --eval-dir "evals/$skill" --scaffold --trust-plugin --no-publish --ablation none \
  --allow-tools Bash Edit Write Agent --judge-model sonnet -j 4 --max-cost-usd 20 \
  --json "evals/$skill/results/$(date -u +%Y%m%dT%H%M%SZ)-$$.json" "$@"
