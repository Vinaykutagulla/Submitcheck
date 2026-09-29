'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Manuscript = { id: string; title: string; raw_text: string; created_at: string; updated_at: string };
type SavedMatch = {
  id: string;
  fit_score: number;
  gaps: Array<{ title?: string }>;
  created_at: string;
  journals?: { name?: string; publisher?: string; quartile?: string; apc_display?: string | null; oa?: boolean } | null;
};

export default function ManuscriptWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const [manuscript, setManuscript] = useState<Manuscript | null>(null);
  const [matches, setMatches] = useState<SavedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadWorkspace() {
      const { id } = await params;
      try {
        const [manuscriptResponse, matchesResponse] = await Promise.all([
          fetch(`/api/manuscripts/${encodeURIComponent(id)}`),
          fetch(`/api/manuscript-matches?manuscriptId=${encodeURIComponent(id)}`),
        ]);
        const manuscriptPayload = await manuscriptResponse.json() as { manuscript?: Manuscript; error?: string };
        const matchesPayload = await matchesResponse.json() as { matches?: SavedMatch[] };

        if (!manuscriptResponse.ok || !manuscriptPayload.manuscript) {
          throw new Error(manuscriptPayload.error || 'Unable to load manuscript.');
        }

        setManuscript(manuscriptPayload.manuscript);
        setMatches(matchesPayload.matches ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load manuscript.');
      } finally {
        setLoading(false);
      }
    }

    loadWorkspace();
  }, [params]);

  if (loading) {
    return <main className="jmatch-shell"><div className="wrap"><section className="panel dashboard-empty"><h2>Loading manuscript...</h2></section></div></main>;
  }

  if (error || !manuscript) {
    return <main className="jmatch-shell"><div className="wrap"><section className="panel dashboard-empty"><h2>{error || 'Manuscript not found.'}</h2><Link href="/app" className="btn btn-primary">Back to workspace</Link></section></div></main>;
  }

  return (
    <main className="jmatch-shell">
      <header className="letterhead"><div className="letterhead-inner"><div><div className="brand"><div className="brand-mark" aria-label="SubmitCheck logo"><svg viewBox="0 0 250 220" aria-hidden="true" role="img"><defs><linearGradient id="submitcheck-mark-blue" x1="0%" x2="100%" y1="0%" y2="100%"><stop offset="0%" stopColor="#1b5dc9" /><stop offset="100%" stopColor="#0d3d8f" /></linearGradient><linearGradient id="submitcheck-mark-coral" x1="0%" x2="100%" y1="0%" y2="100%"><stop offset="0%" stopColor="#e8705f" /><stop offset="100%" stopColor="#c8493a" /></linearGradient></defs><path d="M52 18h98l52 52v104a20 20 0 0 1-20 20H72a20 20 0 0 1-20-20V38a20 20 0 0 1 20-20z" fill="#f5f8fd" stroke="url(#submitcheck-mark-blue)" strokeWidth="6" /><path d="M150 18L198 66L150 66Z" fill="#e1eafc" /><path d="M150 18v48h48" fill="none" stroke="#114ea9" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /><path d="M82 82h64M82 102h80M82 122h50" fill="none" stroke="#a9c6f2" strokeWidth="10" strokeLinecap="round" /><circle cx="152" cy="170" r="47" fill="#f5f8fd" /><circle cx="152" cy="170" r="41" fill="url(#submitcheck-mark-coral)" /><path d="M133 170l14 14 30-34" fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" /></svg></div><div className="brand-wordmark">Submit<em>Check</em></div></div><p className="tagline">Manuscript workspace</p></div><Link href="/app" className="btn btn-secondary">Back to dashboard</Link></div></header>
      <div className="wrap">
        <section className="dashboard-hero"><div><div className="eyebrow">Saved manuscript</div><h2>{manuscript.title}</h2><p>Saved {new Date(manuscript.updated_at || manuscript.created_at).toLocaleDateString()} · {manuscript.raw_text.trim().split(/\s+/).length.toLocaleString()} words</p></div><Link href={`/?manuscriptId=${encodeURIComponent(manuscript.id)}`} className="btn btn-primary">Continue analysis →</Link></section>
        <div className="dashboard-grid"><section className="panel dashboard-panel"><div className="dashboard-panel-head"><div><div className="panel-label">Manuscript text</div><p>Your saved draft, ready to analyze again.</p></div></div><pre className="manuscript-preview">{manuscript.raw_text}</pre></section><section className="panel dashboard-panel"><div className="dashboard-panel-head"><div><div className="panel-label">Saved journal matches</div><p>Your shortlist from the last analysis.</p></div></div>{matches.length ? <div className="dashboard-list">{matches.map((match) => <div key={match.id} className="dashboard-list-item"><div><strong>{match.journals?.name ?? 'Journal result'}</strong><span>{match.journals?.publisher ?? 'Publisher not listed'} · {match.journals?.quartile ?? 'Quartile pending'} · {match.journals?.apc_display ?? 'APC needs verification'}</span><small>{match.gaps?.length ?? 0} revision gaps</small></div><b className="fit-score">{match.fit_score}%</b></div>)}</div> : <div className="empty-note">No saved journal matches yet.</div>}</section></div>
      </div>
    </main>
  );
}