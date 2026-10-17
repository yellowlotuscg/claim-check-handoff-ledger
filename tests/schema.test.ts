import { describe, expect, it } from 'vitest';
import { isValidHandoff, validateHandoff } from '../src/schema';
import type { Handoff } from '../src/types';

const valid: Handoff = {
  id: 'h-1', created_at: '2025-01-01T00:00:00.000Z', author_role: 'worker-1', task: 'Add a todo', state: 'in_progress',
  decisions: ['Use a text file'], open_items: ['Review output'], next_step: 'Ask reviewer to verify',
  source_of_truth: { repo: 'todo-app', ref: 'main', commit: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' },
  claim_checks: [{ sha256: 'a'.repeat(64), size: 4, media_type: 'text/plain', label: 'todos.txt' }]
};

describe('handoff schema', () => {
  it('accepts a valid record', () => expect(isValidHandoff(valid)).toBe(true));
  it('rejects missing required fields and bad hashes', () => {
    const invalid = { ...valid, next_step: '', claim_checks: [{ ...valid.claim_checks[0], sha256: 'bad' }] };
    expect(isValidHandoff(invalid)).toBe(false);
    expect(() => validateHandoff(invalid)).toThrow('Invalid handoff');
  });
});
