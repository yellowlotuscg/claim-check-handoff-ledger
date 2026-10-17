import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
const run = promisify(execFile);

describe('CLI verify exit codes', () => {
  it('returns nonzero for a missing handoff', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cli-verify-'));
    await expect(run('npx', ['tsx', 'src/cli.ts', 'verify', '--id', 'missing'], { cwd: process.cwd(), env: { ...process.env, HANDOFF_DATA_DIR: root } })).rejects.toMatchObject({ code: 1 });
  });

  it('returns zero for a fresh valid handoff', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'cli-repo-'));
    const data = await mkdtemp(join(tmpdir(), 'cli-data-'));
    await run('git', ['-C', repo, 'init', '-b', 'main']);
    await run('git', ['-C', repo, 'config', 'user.name', 'Test']);
    await run('git', ['-C', repo, 'config', 'user.email', 'test@example.invalid']);
    await writeFile(join(repo, 'todos.txt'), 'one\n');
    await run('git', ['-C', repo, 'add', '.']); await run('git', ['-C', repo, 'commit', '-m', 'initial']);
    const env = { ...process.env, HANDOFF_DATA_DIR: data };
    await run('npx', ['tsx', 'src/cli.ts', 'new', '--id', 'fresh', '--author-role', 'worker-1', '--task', 'todo', '--next-step', 'review', '--repo-path', repo, '--context', join(repo, 'todos.txt')], { cwd: process.cwd(), env });
    const result = await run('npx', ['tsx', 'src/cli.ts', 'verify', '--id', 'fresh', '--repo-path', repo], { cwd: process.cwd(), env });
    expect(JSON.parse(result.stdout).status).toBe('FRESH');
  });
});
