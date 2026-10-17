import { describe, expect, it } from 'vitest';
import { buildResumeBrief } from '../src/resume';
import type { Handoff, StalenessResult } from '../src/types';

const handoff: Handoff = { id: 'h-1', created_at: '2025-01-01T00:00:00Z', author_role: 'worker-1', task: 'Add todo', state: 'blocked', decisions: ['Keep it small'], open_items: ['Review it'], next_step: 'Run the tests', source_of_truth: { repo: 'todo-app', ref: 'main', commit: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' }, claim_checks: [{ sha256: 'a'.repeat(64), size: 3, media_type: 'text/plain', label: 'todos.txt' }] };
const fresh: StalenessResult = { status: 'FRESH', reasons: [], currentCommit: handoff.source_of_truth.commit, ref: 'main', changedFiles: [], branchBehindDefault: false };
describe('resume brief', () => it('renders a concise stable markdown brief', () => expect(buildResumeBrief(handoff, new Map([[handoff.claim_checks[0].sha256, Buffer.from('yes')]]), fresh)).toMatchInlineSnapshot(`
"# Resume: Add todo

- Handoff: h-1
- Author role: worker-1
- State: blocked
- Source: todo-app @ main (0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef)
- Source status: FRESH

## Decisions
- Keep it small

## Open items
- Review it

## Next step
Run the tests

## Claim checks
- todos.txt (text/plain, 3 bytes, resolved)
"
`)));
