import { execFileSync } from 'node:child_process';
import type { Handoff, StalenessResult } from './types';

function git(repoPath: string, args: string[]): string {
  return execFileSync('git', ['-C', repoPath, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tryGit(repoPath: string, args: string[]): string | undefined {
  try { return git(repoPath, args); } catch { return undefined; }
}

function changedFilesSince(repoPath: string, commit: string): string[] {
  const committed = tryGit(repoPath, ['diff', '--name-only', `${commit}..HEAD`]) ?? '';
  const workingTree = tryGit(repoPath, ['diff', '--name-only', commit]) ?? '';
  return [...new Set(`${committed}\n${workingTree}`.split('\n').map((line) => line.trim()).filter(Boolean))];
}

function gitSucceeds(repoPath: string, args: string[]): boolean {
  try { execFileSync('git', ['-C', repoPath, ...args], { stdio: 'ignore' }); return true; } catch { return false; }
}

function branchIsBehind(repoPath: string, ref: string, defaultBranch: string): boolean {
  const branch = ref.replace(/^refs\/heads\//, '');
  const candidates = [defaultBranch, defaultBranch === 'main' ? 'master' : 'main', 'origin/HEAD'];
  const defaultRef = candidates.find((candidate) => Boolean(tryGit(repoPath, ['rev-parse', '--verify', candidate])));
  if (!defaultRef) return false;
  const branchCommit = tryGit(repoPath, ['rev-parse', '--verify', branch]);
  const defaultCommit = tryGit(repoPath, ['rev-parse', '--verify', defaultRef]);
  if (!branchCommit || !defaultCommit) return false;
  return branchCommit !== defaultCommit && gitSucceeds(repoPath, ['merge-base', '--is-ancestor', branch, defaultRef]);
}

export function detectStaleness(
  handoff: Handoff,
  repoPath: string,
  referencedFiles: string[] = [],
  defaultBranch = process.env.HANDOFF_DEFAULT_BRANCH ?? 'main'
): StalenessResult {
  const ref = handoff.source_of_truth.ref;
  const currentCommit = tryGit(repoPath, ['rev-parse', '--verify', ref]) ?? '';
  const reasons: string[] = [];
  if (!currentCommit || currentCommit !== handoff.source_of_truth.commit) reasons.push(`ref ${ref} is not at commit ${handoff.source_of_truth.commit}`);

  const allChanged = changedFilesSince(repoPath, handoff.source_of_truth.commit);
  const relevant = referencedFiles.length > 0 ? allChanged.filter((file) => referencedFiles.includes(file)) : allChanged;
  if (relevant.length > 0) reasons.push(`referenced files changed: ${relevant.join(', ')}`);

  const branchBehindDefault = branchIsBehind(repoPath, ref, defaultBranch);
  if (branchBehindDefault) reasons.push(`ref ${ref} is behind ${defaultBranch}`);
  return { status: reasons.length === 0 ? 'FRESH' : 'STALE', reasons, currentCommit, ref, changedFiles: relevant, branchBehindDefault };
}
