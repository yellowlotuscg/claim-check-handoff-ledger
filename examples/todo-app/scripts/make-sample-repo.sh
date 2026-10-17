#!/usr/bin/env bash
set -eu

repo_dir="$(mktemp -d "${TMPDIR:-/tmp}/todo-app.XXXXXX")"
git -C "$repo_dir" init -b main >/dev/null
git -C "$repo_dir" config user.name "Sample Worker"
git -C "$repo_dir" config user.email "worker@example.invalid"
printf '%s\n' '# Tiny todo app' '' '- write tests' > "$repo_dir/todos.txt"
git -C "$repo_dir" add todos.txt
git -C "$repo_dir" commit -m 'initial todo list' >/dev/null
printf '%s\n' "- write tests" "- review output" > "$repo_dir/todos.txt"
git -C "$repo_dir" add todos.txt
git -C "$repo_dir" commit -m 'add a review item' >/dev/null
printf '%s\n' "$repo_dir"
