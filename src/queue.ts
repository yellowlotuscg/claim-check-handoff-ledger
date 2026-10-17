import { Buffer } from 'node:buffer';
import type { Handoff } from './types';

export const MAX_QUEUE_MESSAGE_BYTES = 4096;

export interface QueueMessage {
  handoff_id: string;
  claim_check_refs: string[];
}

export interface HandoffQueue {
  send(message: QueueMessage): Promise<void>;
}

export function buildQueueMessage(handoff: Handoff): QueueMessage {
  return { handoff_id: handoff.id, claim_check_refs: handoff.claim_checks.map((check) => check.sha256) };
}

export function assertQueueMessageSize(message: QueueMessage): void {
  const bytes = Buffer.byteLength(JSON.stringify(message), 'utf8');
  if (bytes >= MAX_QUEUE_MESSAGE_BYTES) throw new Error(`Queue message is ${bytes} bytes; limit is under ${MAX_QUEUE_MESSAGE_BYTES}`);
}

export class InMemoryQueue implements HandoffQueue {
  public readonly messages: QueueMessage[] = [];
  public async send(message: QueueMessage): Promise<void> {
    assertQueueMessageSize(message);
    this.messages.push(structuredClone(message));
  }
}

export class AzureStorageQueue implements HandoffQueue {
  private constructor(private readonly client: { sendMessage(message: string): Promise<unknown> }) {}

  public static async fromEnvironment(): Promise<AzureStorageQueue> {
    const queueUrl = process.env.AZURE_STORAGE_QUEUE_URL;
    if (!queueUrl) throw new Error('AZURE_STORAGE_QUEUE_URL is required for Azure queues');
    const [{ QueueClient }, { DefaultAzureCredential }] = await Promise.all([
      import('@azure/storage-queue'), import('@azure/identity')
    ]);
    return new AzureStorageQueue(new QueueClient(queueUrl, new DefaultAzureCredential()));
  }

  public async send(message: QueueMessage): Promise<void> {
    assertQueueMessageSize(message);
    await this.client.sendMessage(Buffer.from(JSON.stringify(message), 'utf8').toString('base64'));
  }
}
