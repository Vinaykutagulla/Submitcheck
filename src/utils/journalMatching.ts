export type JournalMatchCandidate = {
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
  requirements: {
    abstract?: { type?: 'structured' | 'unstructured' };
    wordLimit?: number;
    novelty?: { required?: boolean };
    limitations?: { required?: boolean };
    refStyle?: 'numbered' | 'APA' | 'Vancouver';
  };
  sponsored: boolean;
  sponsor_tier?: string;
  submission_url: string;
};

export function getGapsForJournal(manuscriptText: string, journal: JournalMatchCandidate) {
  const text = manuscriptText || '';
  const gaps: Array<{
    id: string;
    priority: 'critical' | 'important';
    icon: '❌' | '🟡';
    title: string;
    description: string;
    example: string;
  }> = [];

  if (journal.requirements.abstract?.type === 'structured') {
    const hasAbstractSections = /(background|objective|methods|results|conclusion)/i.test(text);
    if (!hasAbstractSections) {
      gaps.push({
        id: 'abstract_structure',
        priority: 'critical',
        icon: '❌',
        title: 'Structured abstract required',
        description: `${journal.name} requires a structured abstract with clear study sections.`,
        example: 'Add Background, Objective, Methods, Results, and Conclusion sections to the abstract.',
      });
    }
  }

  if (journal.requirements.wordLimit && text.length > journal.requirements.wordLimit * 5) {
    gaps.push({
      id: 'word_limit',
      priority: 'important',
      icon: '🟡',
      title: 'Word limit may be exceeded',
      description: `This journal has a word limit of ${journal.requirements.wordLimit} words for the manuscript or abstract.`,
      example: 'Trim background, duplicate methods language, and reduce non-essential discussion.',
    });
  }

  if (journal.requirements.novelty?.required && !/novelty|new contribution|originality|innovation/i.test(text)) {
    gaps.push({
      id: 'novelty_statement',
      priority: 'critical',
      icon: '❌',
      title: 'Novelty statement missing',
      description: 'This journal expects a clear statement of the manuscript’s novelty and contribution.',
      example: 'Add a sentence describing the new contribution and why it advances the field.',
    });
  }

  if (journal.requirements.limitations?.required && !/limitations|limitations of|study limitations/i.test(text)) {
    gaps.push({
      id: 'limitations_statement',
      priority: 'important',
      icon: '🟡',
      title: 'Limitations section missing',
      description: 'The journal asks for transparent reporting of study limitations.',
      example: 'Add a brief limitations section covering scope, bias, and external validity.',
    });
  }

  if (journal.requirements.refStyle && !/reference|references/i.test(text)) {
    gaps.push({
      id: 'reference_style',
      priority: 'important',
      icon: '🟡',
      title: 'Reference style may not match',
      description: `This journal expects ${journal.requirements.refStyle} reference formatting.`,
      example: 'Review the reference list and ensure all citations follow the required style sequence and punctuation.',
    });
  }

  return gaps;
}
