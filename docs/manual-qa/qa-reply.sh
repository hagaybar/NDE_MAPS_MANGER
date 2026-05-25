#!/usr/bin/env bash
# qa-reply.sh — post a reply that the HTML will render inline in a test card.
#
# Usage:
#   qa-reply.sh <testId|->  <level>  "<message text>"
#
#   testId   id of the test card (e.g. preflight-1, core-3) or "-" for global
#   level    info | success | warn | error | question
#   message  the body text; supports `code` and **bold** and \n linebreaks
#
# Examples:
#   qa-reply.sh preflight-1 question "Paste the full network response for /api/staging/status please."
#   qa-reply.sh core-3 success "Confirmed reconcile applied. Promote should succeed now."
#   qa-reply.sh - info "I'm pushing a fix for the path bug, give me 30s."
set -euo pipefail

REPLIES_FILE="${QA_REPLIES_FILE:-/tmp/plan-b-qa-replies.json}"

if [[ $# -lt 3 ]]; then
  echo "usage: $0 <testId|-> <level> <text>" >&2
  exit 2
fi

test_id="$1"
level="$2"
text="$3"

# Init if missing
if [[ ! -f "$REPLIES_FILE" ]]; then
  echo "[]" > "$REPLIES_FILE"
fi

# Build the new reply object and append via jq
id="$(date +%s%3N)"
ts="$(date +%s)"

jq_args=(--arg id "$id" --argjson ts "$ts" --arg level "$level" --arg text "$text")
if [[ "$test_id" == "-" ]]; then
  filter='. += [{id: $id, ts: $ts, level: $level, text: $text}]'
else
  jq_args+=(--arg testId "$test_id")
  filter='. += [{id: $id, testId: $testId, ts: $ts, level: $level, text: $text}]'
fi

tmp="$(mktemp)"
jq "${jq_args[@]}" "$filter" "$REPLIES_FILE" > "$tmp"
mv "$tmp" "$REPLIES_FILE"

echo "posted reply id=$id testId=$test_id level=$level"
