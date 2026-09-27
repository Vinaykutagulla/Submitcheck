export type ScopusField =
  | 'General'
  | 'Agricultural and Biological Sciences'
  | 'Arts and Humanities'
  | 'Biochemistry, Genetics and Molecular Biology'
  | 'Business, Management and Accounting'
  | 'Chemical Engineering'
  | 'Chemistry'
  | 'Computer Science'
  | 'Decision Sciences'
  | 'Earth and Planetary Sciences'
  | 'Economics, Econometrics and Finance'
  | 'Energy'
  | 'Engineering'
  | 'Environmental Science'
  | 'Immunology and Microbiology'
  | 'Materials Science'
  | 'Mathematics'
  | 'Medicine'
  | 'Neuroscience'
  | 'Nursing'
  | 'Pharmacology, Toxicology and Pharmaceutics'
  | 'Physics and Astronomy'
  | 'Psychology'
  | 'Social Sciences'
  | 'Veterinary'
  | 'Dentistry'
  | 'Health Professions';

// ASJC codes are four-digit codes. The first two digits identify the Scopus
// subject family; preserving the full code still allows future subfield rules.
export const asjcFieldPrefixes: Record<string, ScopusField> = {
  '10': 'General',
  '11': 'Agricultural and Biological Sciences',
  '12': 'Arts and Humanities',
  '13': 'Biochemistry, Genetics and Molecular Biology',
  '14': 'Business, Management and Accounting',
  '15': 'Chemical Engineering',
  '16': 'Chemistry',
  '17': 'Computer Science',
  '18': 'Decision Sciences',
  '19': 'Earth and Planetary Sciences',
  '20': 'Economics, Econometrics and Finance',
  '21': 'Energy',
  '22': 'Engineering',
  '23': 'Environmental Science',
  '24': 'Immunology and Microbiology',
  '25': 'Materials Science',
  '26': 'Mathematics',
  '27': 'Medicine',
  '28': 'Neuroscience',
  '29': 'Nursing',
  '30': 'Pharmacology, Toxicology and Pharmaceutics',
  '31': 'Physics and Astronomy',
  '32': 'Psychology',
  '33': 'Social Sciences',
  '34': 'Veterinary',
  '35': 'Dentistry',
  '36': 'Health Professions',
};

export function fieldsForAsjcCodes(codes: string[] = []): ScopusField[] {
  return [...new Set(codes
    .map((code) => String(code).trim().match(/^(\d{2})/)?.[1])
    .map((prefix) => prefix ? asjcFieldPrefixes[prefix] : undefined)
    .filter((field): field is ScopusField => Boolean(field)))];
}

export function normalizeScopusField(value: string | undefined): string {
  return value?.replace(/^\d+\s*/, '').trim().toLowerCase() ?? '';
}
