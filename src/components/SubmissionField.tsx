'use client';

type SubmissionFieldProps = {
  label: string;
  value: string;
  copied: string;
  onCopy: (label: string, value: string) => void;
};

export function SubmissionField({ label, value, copied, onCopy }: SubmissionFieldProps) {
  return (
    <div className="submission-field">
      <strong>{label}</strong>
      <p>{value}</p>
      <button type="button" className="btn-small" onClick={() => onCopy(label, value)}>
        {copied === label ? 'Copied' : `Copy ${label}`}
      </button>
    </div>
  );
}
