import type { Handoff, StalenessResult } from './types';

export function buildResumeBrief(handoff: Handoff, claimChecks: Map<string, Buffer>, staleness: StalenessResult): string {
  const lines = [
    `# Resume: ${handoff.task}`,
    '',
    `- Handoff: ${handoff.id}`,
    `- Author role: ${handoff.author_role}`,
    `- State: ${handoff.state}`,
    `- Source: ${handoff.source_of_truth.repo} @ ${handoff.source_of_truth.ref} (${handoff.source_of_truth.commit})`,
    `- Source status: ${staleness.status}${staleness.reasons.length ? ` — ${staleness.reasons.join('; ')}` : ''}`,
    '',
    '## Decisions',
    ...(handoff.decisions.length ? handoff.decisions.map((item) => `- ${item}`) : ['- None recorded']),
    '',
    '## Open items',
    ...(handoff.open_items.length ? handoff.open_items.map((item) => `- ${item}`) : ['- None']),
    '',
    `## Next step\n${handoff.next_step}`,
    '',
    '## Claim checks',
    ...(handoff.claim_checks.length
      ? handoff.claim_checks.map((check) => `- ${check.label} (${check.media_type}, ${check.size} bytes, ${claimChecks.has(check.sha256) ? 'resolved' : 'missing'})`)
      : ['- None'])
  ];
  return `${lines.join('\n')}\n`;
}
