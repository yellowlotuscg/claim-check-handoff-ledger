#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { basename, extname, relative, resolve, join } from 'node:path';
import { buildResumeBrief } from './resume';
import { makeStore, loadHandoff, listHandoffs, saveHandoff, verifyHandoff, dataDir } from './runtime';
import { validateHandoff } from './schema';
import type { Handoff } from './types';

function value(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}
function values(args: string[], flag: string): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) if (args[index] === flag && args[index + 1]) result.push(args[index + 1]);
  return result;
}
function required(args: string[], flag: string): string {
  const found = value(args, flag);
  if (!found) throw new Error(`Missing ${flag}`);
  return found;
}
function git(repo: string, args: string[]): string { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim(); }
function parseList(args: string[], repeatedFlag: string, jsonFlag: string): string[] {
  const repeated = values(args, repeatedFlag);
  const raw = value(args, jsonFlag);
  if (!raw) return repeated;
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) throw new Error(`${jsonFlag} must be a JSON string array`);
  return [...repeated, ...parsed];
}
function mimeFor(file: string): string {
  return extname(file).toLowerCase() === '.json' ? 'application/json' : extname(file).toLowerCase() === '.md' ? 'text/markdown' : 'text/plain';
}

async function commandNew(args: string[]): Promise<void> {
  const repoPath = resolve(value(args, '--repo-path') ?? process.env.HANDOFF_REPO_PATH ?? '.');
  const jsonInput = value(args, '--json');
  let handoff: Handoff;
  if (jsonInput) {
    const raw = jsonInput.trim().startsWith('{') ? jsonInput : await readFile(resolve(jsonInput), 'utf8');
    handoff = JSON.parse(raw) as Handoff;
  } else {
    const ref = value(args, '--ref') ?? 'main';
    let commit = value(args, '--commit');
    if (!commit) commit = git(repoPath, ['rev-parse', '--verify', ref]).trim();
    handoff = {
      id: value(args, '--id') ?? `h-${Date.now()}`,
      created_at: new Date().toISOString(),
      author_role: required(args, '--author-role'),
      task: required(args, '--task'),
      state: (value(args, '--state') ?? 'in_progress') as Handoff['state'],
      decisions: parseList(args, '--decision', '--decisions'),
      open_items: parseList(args, '--open-item', '--open-items'),
      next_step: required(args, '--next-step'),
      source_of_truth: { repo: value(args, '--repo') ?? 'todo-app', ref, commit },
      claim_checks: []
    };
  }
  validateHandoff(handoff);
  const store = makeStore();
  for (const file of values(args, '--context')) {
    const absolute = resolve(file);
    const check = await store.put(await readFile(absolute), mimeFor(absolute), relative(repoPath, absolute) || basename(absolute));
    handoff.claim_checks.push(check);
  }
  validateHandoff(handoff);
  await saveHandoff(handoff);
  console.log(JSON.stringify(handoff, null, 2));
}

async function commandResume(args: string[]): Promise<void> {
  const handoff = await loadHandoff(required(args, '--id'));
  const store = makeStore();
  const resolved = new Map<string, Buffer>();
  for (const check of handoff.claim_checks) resolved.set(check.sha256, await store.get(check.sha256));
  const result = await verifyHandoff(handoff, resolve(value(args, '--repo-path') ?? process.env.HANDOFF_REPO_PATH ?? '.'), store);
  process.stdout.write(buildResumeBrief(handoff, resolved, result));
}

async function commandVerify(args: string[]): Promise<void> {
  try {
    const handoff = await loadHandoff(required(args, '--id'));
    const result = await verifyHandoff(handoff, resolve(value(args, '--repo-path') ?? process.env.HANDOFF_REPO_PATH ?? '.'), makeStore());
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'FRESH') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'new') return commandNew(args);
  if (command === 'resume') return commandResume(args);
  if (command === 'verify') return commandVerify(args);
  if (command === 'list') { for (const id of await listHandoffs()) console.log(id); return; }
  throw new Error('Usage: npm run handoff -- new|resume|verify|list');
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
