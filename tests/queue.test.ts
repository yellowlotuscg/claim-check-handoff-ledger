import { describe, expect, it } from 'vitest';
import { assertQueueMessageSize, buildQueueMessage, InMemoryQueue } from '../src/queue';
import type { Handoff } from '../src/types';

const base = { id: 'h', claim_checks: [] } as unknown as Handoff;
describe('queue messages', () => {
  it('contains only id and refs and stays under 4 KB', async () => {
    const handoff = { ...base, claim_checks: [{ sha256: 'a'.repeat(64), size: 1, media_type: 'text/plain', label: 'x' }] };
    const message = buildQueueMessage(handoff);
    expect(Object.keys(message).sort()).toEqual(['claim_check_refs', 'handoff_id']);
    assertQueueMessageSize(message);
    const queue = new InMemoryQueue(); await queue.send(message); expect(queue.messages).toHaveLength(1);
  });
  it('rejects an oversized message', () => expect(() => assertQueueMessageSize({ handoff_id: 'h', claim_check_refs: ['a'.repeat(5000)] })).toThrow('under 4096'));
});
