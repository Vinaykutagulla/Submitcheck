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
      <header className="letterhead"><div className="letterhead-inner"><div><div className="brand"><span className="stamp">✓</span><h1>Submit<em>Check</em></h1></div><p className="tagline">Manuscript workspace</p></div><Link href="/app" className="btn btn-secondary">Back to dashboard</Link></div></header>
      <div className="wrap">
        <section className="dashboard-hero"><div><div className="eyebrow">Saved manuscript</div><h2>{manuscript.title}</h2><p>Saved {new Date(manuscript.updated_at || manuscript.created_at).toLocaleDateString()} · {manuscript.raw_text.trim().split(/\s+/).length.toLocaleString()} words</p></div><Link href={`/?manuscriptId=${encodeURIComponent(manuscript.id)}`} className="btn btn-primary">Continue analysis →</Link></section>
        <div className="dashboard-grid"><section className="panel dashboard-panel"><div className="dashboard-panel-head"><div><div className="panel-label">Manuscript text</div><p>Your saved draft, ready to analyze again.</p></div></div><pre className="manuscript-preview">{manuscript.raw_text}</pre></section><section className="panel dashboard-panel"><div className="dashboard-panel-head"><div><div className="panel-label">Saved journal matches</div><p>Your shortlist from the last analysis.</p></div></div>{matches.length ? <div className="dashboard-list">{matches.map((match) => <div key={match.id} className="dashboard-list-item"><div><strong>{match.journals?.name ?? 'Journal result'}</strong><span>{match.journals?.publisher ?? 'Publisher not listed'} · {match.journals?.quartile ?? 'Quartile pending'} · {match.journals?.apc_display ?? 'APC needs verification'}</span><small>{match.gaps?.length ?? 0} revision gaps</small></div><b className="fit-score">{match.fit_score}%</b></div>)}</div> : <div className="empty-note">No saved journal matches yet.</div>}</section></div>
      </div>
    </main>
  );
}