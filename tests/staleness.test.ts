import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectStaleness } from '../src/staleness';
import type { Handoff } from '../src/types';

function git(repo: string, ...args: string[]): string { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim(); }
async function repo(): Promise<{ path: string; commit: string }> {
  const path = await mkdtemp(join(tmpdir(), 'stale-repo-'));
  git(path, 'init', '-b', 'main'); git(path, 'config', 'user.email', 'test@example.invalid'); git(path, 'config', 'user.name', 'Test');
  await writeFile(join(path, 'todos.txt'), 'one\n'); git(path, 'add', '.'); git(path, 'commit', '-m', 'initial');
  return { path, commit: git(path, 'rev-parse', 'main') };
}
function handoff(commit: string, ref = 'main'): Handoff { return { id: 'h', created_at: '2025-01-01T00:00:00Z', author_role: 'worker-1', task: 'todo', state: 'in_progress', decisions: [], open_items: [], next_step: 'review', source_of_truth: { repo: 'todo-app', ref, commit }, claim_checks: [{ sha256: 'a'.repeat(64), size: 1, media_type: 'text/plain', label: 'todos.txt' }] }; }

describe('staleness detector', () => {
  it('reports FRESH at the recorded commit', async () => { const r = await repo(); expect(detectStaleness(handoff(r.commit), r.path).status).toBe('FRESH'); });
  it('reports STALE after a new commit', async () => { const r = await repo(); await writeFile(join(r.path, 'todos.txt'), 'two\n'); git(r.path, 'add', '.'); git(r.path, 'commit', '-m', 'move on'); expect(detectStaleness(handoff(r.commit), r.path).status).toBe('STALE'); });
  it('reports STALE when a referenced file changes in the worktree', async () => { const r = await repo(); await writeFile(join(r.path, 'todos.txt'), 'changed\n'); const result = detectStaleness(handoff(r.commit), r.path, ['todos.txt']); expect(result.status).toBe('STALE'); expect(result.changedFiles).toContain('todos.txt'); });
  it('flags a branch behind main', async () => { const r = await repo(); git(r.path, 'switch', '-c', 'feature'); const featureCommit = git(r.path, 'rev-parse', 'HEAD'); await writeFile(join(r.path, 'todos.txt'), 'main move\n'); git(r.path, 'switch', 'main'); git(r.path, 'add', '.'); git(r.path, 'commit', '-m', 'main move'); git(r.path, 'switch', 'feature'); const result = detectStaleness(handoff(featureCommit, 'feature'), r.path); expect(result.status).toBe('STALE'); expect(result.branchBehindDefault).toBe(true); });
});
