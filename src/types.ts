export interface SourceOfTruth {
  repo: string;
  ref: string;
  commit: string;
}

export interface ClaimCheck {
  sha256: string;
  size: number;
  media_type: string;
  label: string;
}

export type HandoffState = string;

export interface Handoff {
  id: string;
  created_at: string;
  author_role: string;
  task: string;
  state: HandoffState;
  decisions: string[];
  open_items: string[];
  next_step: string;
  source_of_truth: SourceOfTruth;
  claim_checks: ClaimCheck[];
}

export interface StalenessResult {
  status: 'FRESH' | 'STALE';
  reasons: string[];
  currentCommit: string;
  ref: string;
  changedFiles: string[];
  branchBehindDefault: boolean;
}
