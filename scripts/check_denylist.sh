#!/usr/bin/env bash
set -eu

terms_file=".github/denylist.txt"
if [ ! -f "$terms_file" ]; then exit 0; fi
term_list="${TMPDIR:-/tmp}/claim-check-denylist.$$.terms"
tracked_list="${TMPDIR:-/tmp}/claim-check-denylist.$$.files"
trap 'rm -f "$term_list" "$tracked_list"' EXIT HUP INT TERM
# Strip blank lines and comments while preserving each term literally.
while IFS= read -r term || [ -n "$term" ]; do
  case "$term" in ''|'#'*) continue ;; esac
  printf '%s\n' "$term"
done < "$terms_file" > "$term_list"
if [ ! -s "$term_list" ]; then exit 0; fi
git ls-files > "$tracked_list"
status=0
while IFS= read -r file || [ -n "$file" ]; do
  [ "$file" = "$terms_file" ] && continue
  while IFS= read -r term || [ -n "$term" ]; do
    if grep -Fqi -- "$term" "$file"; then
      printf 'deny-list term found in %s: %s\n' "$file" "$term" >&2
      status=1
    fi
  done < "$term_list"
done < "$tracked_list"
exit "$status"
