export type PlanType = 'free' | 'pro';

export type GapPriority = 'critical' | 'important';

export type GapObject = {
  id: string;
  priority: GapPriority;
  icon: '❌' | '🟡';
  title: string;
  description: string;
  example: string;
};

export type JournalRequirement = {
  abstract?: {
    type?: 'structured' | 'unstructured';
  };
  wordLimit?: number;
  novelty?: {
    required?: boolean;
  };
  limitations?: {
    required?: boolean;
  };
  refStyle?: 'numbered' | 'APA' | 'Vancouver';
};

export type Journal = {
  id: string;
  name: string;
  publisher: string;
  field: string;
  quartile: string;
  oa: boolean;
  apc_display: string;
  turnaround_days: number;
  indexed: string[];
  scope: string[];
  requirements: JournalRequirement;
  sponsored: boolean;
  sponsor_tier?: string;
  submission_url: string;
};

export type Profile = {
  id: string;
  email: string;
  plan: PlanType;
  plan_expires_at?: string | null;
  created_at: string;
};

export type Manuscript = {
  id: string;
  user_id: string;
  title: string;
  raw_text: string;
  created_at: string;
  updated_at: string;
};

export type JournalMatch = {
  id: string;
  manuscript_id: string;
  journal_id: string;
  gaps: GapObject[];
  fixed_gap_ids: string[];
  formatting_reviewed: boolean;
  verification_complete: boolean;
  created_at: string;
};
