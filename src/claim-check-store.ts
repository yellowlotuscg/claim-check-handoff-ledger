import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ClaimCheck } from './types';

export interface ClaimCheckStore {
  put(content: Buffer | string, mediaType: string, label: string): Promise<ClaimCheck>;
  get(sha256: string): Promise<Buffer>;
  verify(check: ClaimCheck): Promise<void>;
}

export function sha256Of(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export class FileSystemClaimCheckStore implements ClaimCheckStore {
  public constructor(private readonly root: string) {}

  private pathFor(hash: string): string {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid claim-check hash');
    return join(this.root, hash.slice(0, 2), hash);
  }

  public async put(content: Buffer | string, mediaType: string, label: string): Promise<ClaimCheck> {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const sha256 = sha256Of(buffer);
    const target = this.pathFor(sha256);
    await mkdir(dirname(target), { recursive: true });
    try {
      await stat(target);
    } catch {
      const temp = `${target}.${process.pid}.tmp`;
      await writeFile(temp, buffer, { flag: 'wx' });
      await rename(temp, target);
    }
    return { sha256, size: buffer.byteLength, media_type: mediaType, label };
  }

  public async get(sha256: string): Promise<Buffer> {
    const content = await readFile(this.pathFor(sha256));
    const actual = sha256Of(content);
    if (actual !== sha256) throw new Error(`Claim-check tamper detected: expected ${sha256}, got ${actual}`);
    return content;
  }

  public async verify(check: ClaimCheck): Promise<void> {
    const content = await this.get(check.sha256);
    if (content.byteLength !== check.size) throw new Error(`Claim-check size mismatch for ${check.sha256}`);
  }
}

export class AzureBlobClaimCheckStore implements ClaimCheckStore {
  private constructor(private readonly container: { getBlockBlobClient(name: string): any }) {}

  public static async fromEnvironment(): Promise<AzureBlobClaimCheckStore> {
    const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL;
    if (!accountUrl) throw new Error('AZURE_STORAGE_ACCOUNT_URL is required for Azure claim checks');
    const [{ BlobServiceClient }, { DefaultAzureCredential }] = await Promise.all([
      import('@azure/storage-blob'), import('@azure/identity')
    ]);
    const service = new BlobServiceClient(accountUrl, new DefaultAzureCredential());
    const container = service.getContainerClient(process.env.AZURE_CLAIMCHECK_CONTAINER ?? 'claimchecks');
    await container.createIfNotExists();
    return new AzureBlobClaimCheckStore(container);
  }

  public async put(content: Buffer | string, mediaType: string, label: string): Promise<ClaimCheck> {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const sha256 = sha256Of(buffer);
    const blob = this.container.getBlockBlobClient(sha256);
    if (!(await blob.exists())) await blob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: mediaType }, metadata: { label } });
    return { sha256, size: buffer.byteLength, media_type: mediaType, label };
  }

  public async get(sha256: string): Promise<Buffer> {
    const blob = this.container.getBlockBlobClient(sha256);
    const content = await blob.downloadToBuffer();
    const actual = sha256Of(content);
    if (actual !== sha256) throw new Error(`Claim-check tamper detected: expected ${sha256}, got ${actual}`);
    return content;
  }

  public async verify(check: ClaimCheck): Promise<void> {
    const content = await this.get(check.sha256);
    if (content.byteLength !== check.size) throw new Error(`Claim-check size mismatch for ${check.sha256}`);
  }
}

export async function verifyClaimChecks(store: ClaimCheckStore, checks: ClaimCheck[]): Promise<void> {
  for (const check of checks) await store.verify(check);
}
