# Todo-app walkthrough

This walkthrough uses only a throwaway local repository and generic roles. It demonstrates why a small queue message should point to durable context instead of carrying the context itself.

1. Create the sample repository:

   ```sh
   REPO_PATH="$(npm run sample --silent)"
   DATA_DIR="$(mktemp -d)"
   ```

2. Create a handoff at the current `main` commit. The context file is stored as a content-addressed claim check:

   ```sh
   export HANDOFF_DATA_DIR="$DATA_DIR"
   npm run handoff -- new \
     --id todo-handoff-1 \
     --author-role worker-1 \
     --task "Review the todo list" \
     --state blocked \
     --decision "Keep the sample intentionally small" \
     --open-item "Ask reviewer to check the list" \
     --next-step "Review todos.txt" \
     --repo todo-app \
     --ref main \
     --repo-path "$REPO_PATH" \
     --context "$REPO_PATH/todos.txt"
   ```

3. Move the source repository forward:

   ```sh
   printf '%s\n' '- write tests' '- review output' '- add a third item' > "$REPO_PATH/todos.txt"
   git -C "$REPO_PATH" add todos.txt
   git -C "$REPO_PATH" commit -m 'move todo work forward'
   ```

4. Verification now reports `STALE` and exits nonzero because `main` is no longer at the recorded commit:

   ```sh
   npm run handoff -- verify --id todo-handoff-1 --repo-path "$REPO_PATH"
   ```

5. A resume still produces a useful brief, but clearly carries the stale status so the next worker can re-check before acting:

   ```sh
   npm run handoff -- resume --id todo-handoff-1 --repo-path "$REPO_PATH"
   ```

The sample directory and handoff data are temporary and can be removed after the walkthrough.
