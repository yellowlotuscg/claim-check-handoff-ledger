import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { resolve } from 'node:path';
import { AzureBlobClaimCheckStore, verifyClaimChecks } from './claim-check-store';
import { AzureStorageQueue, buildQueueMessage, InMemoryQueue, type QueueMessage } from './queue';
import { AzureAppendBlobLedger, JsonlLedger } from './ledger';
import { loadHandoff, makeStore, saveHandoff, dataDir, processHandoff } from './runtime';
import { validateHandoff } from './schema';
import type { Handoff } from './types';

async function bodyAsHandoff(request: HttpRequest): Promise<Handoff> {
  const body = await request.json() as unknown;
  validateHandoff(body);
  return body;
}

export async function acceptHandoff(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const handoff = await bodyAsHandoff(request);
    const store = process.env.AZURE_STORAGE_ACCOUNT_URL ? await AzureBlobClaimCheckStore.fromEnvironment() : makeStore();
    await verifyClaimChecks(store, handoff.claim_checks);
    await saveHandoff(handoff);
    const queue = process.env.AZURE_STORAGE_QUEUE_URL ? await AzureStorageQueue.fromEnvironment() : new InMemoryQueue();
    await queue.send(buildQueueMessage(handoff));
    context.log(`accepted handoff ${handoff.id}`);
    return { status: 202, jsonBody: { id: handoff.id, queued: true } };
  } catch (error) {
    return { status: 400, jsonBody: { error: error instanceof Error ? error.message : String(error) } };
  }
}

export async function processHandoffQueue(message: string | QueueMessage, context: InvocationContext): Promise<void> {
  const parsed = typeof message === 'string'
    ? (message.trim().startsWith('{') ? JSON.parse(message) as QueueMessage : JSON.parse(Buffer.from(message, 'base64').toString('utf8')) as QueueMessage)
    : message;
  const handoff = await loadHandoff(parsed.handoff_id);
  const store = process.env.AZURE_STORAGE_ACCOUNT_URL ? await AzureBlobClaimCheckStore.fromEnvironment() : makeStore();
  const ledger = process.env.AZURE_STORAGE_ACCOUNT_URL ? await AzureAppendBlobLedger.fromEnvironment() : new JsonlLedger(resolve(dataDir(), 'ledger.jsonl'));
  await processHandoff(handoff, resolve(process.env.HANDOFF_REPO_PATH ?? '.'), store, ledger);
  context.log(`recorded handoff ${handoff.id}`);
}

app.http('acceptHandoff', { methods: ['POST'], authLevel: 'function', handler: acceptHandoff });
app.storageQueue('processHandoffQueue', { queueName: process.env.HANDOFF_QUEUE_NAME ?? 'handoffs', connection: 'AzureWebJobsStorage', handler: processHandoffQueue });
