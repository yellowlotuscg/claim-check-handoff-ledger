import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Handoff } from './types';
import { validateHandoff } from './schema';
import { FileSystemClaimCheckStore, verifyClaimChecks, type ClaimCheckStore } from './claim-check-store';
import { buildQueueMessage, type HandoffQueue } from './queue';
import { detectStaleness } from './staleness';
import { JsonlLedger, ledgerEntry, type Ledger } from './ledger';

export function dataDir(): string { return process.env.HANDOFF_DATA_DIR ?? '.handoff-ledger'; }
export function makeStore(root = join(dataDir(), 'claimchecks')): ClaimCheckStore { return new FileSystemClaimCheckStore(root); }
export async function saveHandoff(handoff: Handoff, root = dataDir()): Promise<void> {
  validateHandoff(handoff);
  const dir = join(root, 'handoffs');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${handoff.id}.json`), `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');
}
export async function loadHandoff(id: string, root = dataDir()): Promise<Handoff> {
  const handoff = JSON.parse(await readFile(join(root, 'handoffs', `${id}.json`), 'utf8')) as unknown;
  validateHandoff(handoff);
  return handoff;
}
export async function listHandoffs(root = dataDir()): Promise<string[]> {
  try { return (await readdir(join(root, 'handoffs'))).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5)).sort(); }
  catch { return []; }
}
export async function verifyHandoff(handoff: Handoff, repoPath: string, store: ClaimCheckStore): Promise<ReturnType<typeof detectStaleness>> {
  validateHandoff(handoff);
  await verifyClaimChecks(store, handoff.claim_checks);
  return detectStaleness(handoff, repoPath, handoff.claim_checks.map((check) => check.label));
}

export async function processHandoff(handoff: Handoff, repoPath: string, store: ClaimCheckStore, ledger: Ledger): Promise<void> {
  const staleness = await verifyHandoff(handoff, repoPath, store);
  await ledger.append(ledgerEntry(handoff, staleness));
}

export { buildQueueMessage, FileSystemClaimCheckStore, JsonlLedger };
