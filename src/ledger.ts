import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Handoff, StalenessResult } from './types';

export interface LedgerEntry {
  recorded_at: string;
  handoff_id: string;
  status: StalenessResult['status'];
  reasons: string[];
}

export interface Ledger {
  append(entry: LedgerEntry): Promise<void>;
}

export class JsonlLedger implements Ledger {
  public constructor(private readonly path: string) {}
  public async append(entry: LedgerEntry): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(entry)}\n`, 'utf8');
  }
}

export class AzureAppendBlobLedger implements Ledger {
  private constructor(private readonly blob: any) {}
  public static async fromEnvironment(): Promise<AzureAppendBlobLedger> {
    const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL;
    if (!accountUrl) throw new Error('AZURE_STORAGE_ACCOUNT_URL is required for Azure ledger');
    const [{ BlobServiceClient }, { DefaultAzureCredential }] = await Promise.all([
      import('@azure/storage-blob'), import('@azure/identity')
    ]);
    const service = new BlobServiceClient(accountUrl, new DefaultAzureCredential());
    const container = service.getContainerClient(process.env.AZURE_LEDGER_CONTAINER ?? 'ledger');
    await container.createIfNotExists();
    const blob = container.getAppendBlobClient('handoffs.jsonl');
    if (!(await blob.exists())) await blob.create();
    return new AzureAppendBlobLedger(blob);
  }
  public async append(entry: LedgerEntry): Promise<void> {
    await this.blob.appendBlock(`${JSON.stringify(entry)}\n`, Buffer.byteLength(`${JSON.stringify(entry)}\n`));
  }
}

export function ledgerEntry(handoff: Handoff, staleness: StalenessResult): LedgerEntry {
  return { recorded_at: new Date().toISOString(), handoff_id: handoff.id, status: staleness.status, reasons: staleness.reasons };
}
