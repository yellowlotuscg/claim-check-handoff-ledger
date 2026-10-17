import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileSystemClaimCheckStore } from '../src/claim-check-store';

describe('filesystem claim checks', () => {
  it('deduplicates identical content and detects tampering', async () => {
    const root = await mkdtemp(join(tmpdir(), 'claim-check-'));
    const store = new FileSystemClaimCheckStore(root);
    const first = await store.put('same', 'text/plain', 'one');
    const second = await store.put('same', 'text/plain', 'two');
    expect(second.sha256).toBe(first.sha256);
    expect(second.size).toBe(first.size);
    expect((await store.get(first.sha256)).toString()).toBe('same');
    await writeFile(join(root, first.sha256.slice(0, 2), first.sha256), 'tampered');
    await expect(store.get(first.sha256)).rejects.toThrow('tamper detected');
  });
});
