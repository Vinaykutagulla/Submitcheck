'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Manuscript = { id: string; title: string; raw_text: string; created_at: string };
type SavedMatch = { id: string; manuscript_id: string; journal_id: string; fit_score: number; gaps: Array<{ title?: string }>; created_at: string; journals?: { name?: string; publisher?: string; quartile?: string; apc_display?: string | null; oa?: boolean } | null };
type Account = { email: string; fullName: string };

export default function AppWorkflowPage() {
  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);
  const [matches, setMatches] = useState<SavedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [plan, setPlan] = useState<'free' | 'pro'>('free');
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const accountResponse = await fetch('/api/account');
        if (!accountResponse.ok) {
          setSignedIn(false);
          return;
        }
        const accountPayload = await accountResponse.json() as { user?: Account | null };
        if (!accountPayload.user) {
          setSignedIn(false);
          return;
        }
        setAccount(accountPayload.user);
        const planResponse = await fetch('/api/payments');
        const planPayload = await planResponse.json() as { plan?: 'free' | 'pro' };
        setPlan(planPayload.plan === 'pro' ? 'pro' : 'free');
        const manuscriptResponse = await fetch('/api/manuscripts');
        const manuscriptPayload = await manuscriptResponse.json() as { manuscripts?: Manuscript[] };
        if (!manuscriptPayload.manuscripts?.length) {
          setSignedIn(manuscriptResponse.ok);
          setManuscripts([]);
          return;
        }

        setManuscripts(manuscriptPayload.manuscripts);
        const savedMatches = await Promise.all(manuscriptPayload.manuscripts.map(async (manuscript) => {
          const response = await fetch(`/api/manuscript-matches?manuscriptId=${encodeURIComponent(manuscript.id)}`);
          const payload = await response.json() as { matches?: SavedMatch[] };
          return payload.matches ?? [];
        }));
        setMatches(savedMatches.flat());
      } catch {
        setSignedIn(false);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const topMatches = [...matches].sort((left, right) => right.fit_score - left.fit_score).slice(0, 8);

  if (loading) {
    return <main className="min-h-screen bg-[var(--background)] p-6 text-[var(--ink)]"><div className="mx-auto max-w-3xl rounded-[28px] border border-[var(--line)] bg-white p-10 text-center"><div className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">SubmitCheck</div><h1 className="mt-3 text-3xl font-semibold">Loading your workspace...</h1><p className="mt-2 text-[var(--muted)]">Checking your account and saved research.</p></div></main>;
  }

  if (!signedIn) {
    return <main className="jmatch-shell"><header className="letterhead"><div className="letterhead-inner"><div><div className="brand"><span className="stamp">✓</span><h1>Submit<em>Check</em></h1></div><p className="tagline">Author workspace</p></div></div></header><div className="wrap"><section className="panel dashboard-empty"><div className="panel-label">Private author workspace</div><h2>Sign in to view your research desk</h2><p>Your manuscripts, saved journal matches, and revision progress are private to your account.</p><Link href="/login" className="btn btn-primary">Log in</Link></section></div></main>;
  }

  return (
    <main className="jmatch-shell"><header className="letterhead"><div className="letterhead-inner"><div><div className="brand"><span className="stamp">✓</span><h1>Submit<em>Check</em></h1></div><p className="tagline">Get submission-ready. Get closer to acceptance.</p></div><div className="header-actions"><div className="plan-actions"><span className={plan === 'pro' ? 'plan-pill pro' : 'plan-pill'}>{plan === 'pro' ? '⭐ Pro plan' : '🔓 Free plan'}</span><Link href="/" className="btn btn-gold">+ New manuscript</Link></div><div className="author-chip"><strong>{account?.fullName || 'Author'}</strong><span>{account?.email}</span></div></div></div></header><div className="wrap">

        <section className="dashboard-hero"><div><div className="eyebrow">SubmitCheck / Workspace</div><h2>Hi, {account?.fullName || 'Author'}</h2><p>Your private place for manuscripts, journal shortlists, and revision decisions.</p></div><Link href="/" className="btn btn-primary">Find a journal →</Link>
        </section>

        <section className="dashboard-stats">
          <div className="stat-card"><span>Manuscripts</span><strong>{manuscripts.length}</strong></div><div className="stat-card"><span>Saved matches</span><strong>{matches.length}</strong></div><div className="stat-card accent"><span>Best fit score</span><strong>{matches.length ? `${Math.max(...matches.map((match) => match.fit_score))}%` : '—'}</strong></div><div className="stat-card"><span>Plan</span><strong>{plan === 'pro' ? '⭐ Pro' : 'Free'}</strong><small>{plan === 'pro' ? 'Precision results active' : 'Upgrade for full results'}</small></div>
        </section>

        <div className="dashboard-grid"><section className="panel dashboard-panel"><div className="dashboard-panel-head"><div><div className="panel-label">My manuscripts</div><p>Drafts saved to your account.</p></div><Link href="/" className="btn-small primary-btn">Add manuscript</Link></div>{loading ? <p className="muted">Loading your workspace...</p> : manuscripts.length ? <div className="dashboard-list">{manuscripts.map((manuscript) => <div key={manuscript.id} className="dashboard-list-item"><div><strong>{manuscript.title}</strong><span>{new Date(manuscript.created_at).toLocaleDateString()} · {manuscript.raw_text.trim().split(/\s+/).length.toLocaleString()} words</span></div><Link href={`/app/manuscripts/${encodeURIComponent(manuscript.id)}`} className="text-link">Open workspace →</Link></div>)}</div> : <div className="empty-note">No saved manuscripts yet. Start with a manuscript to build your private workspace.</div>}</section><section className="panel dashboard-panel"><div className="dashboard-panel-head"><div><div className="panel-label">Saved journal results</div><p>Your strongest matches, sorted by fit.</p></div></div>{topMatches.length ? <div className="dashboard-list">{topMatches.map((match) => <div key={match.id} className="dashboard-list-item"><div><Link href={`/app/manuscripts/${encodeURIComponent(match.manuscript_id)}`} className="text-link"><strong>{match.journals?.name ?? 'Journal result'}</strong></Link><span>{match.journals?.publisher ?? 'Publisher not listed'} · {match.journals?.quartile ?? 'Quartile pending'} · {match.journals?.apc_display ?? 'APC needs verification'}</span><small>{match.gaps?.length ?? 0} revision gaps · {new Date(match.created_at).toLocaleDateString()}</small></div><b className="fit-score">{match.fit_score}%</b></div>)}</div> : <div className="empty-note">Saved journal matches will appear here after you save a result.</div>}</section></div></div></main>
  );
}
