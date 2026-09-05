'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      router.push('/');
      router.refresh();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : '';
      setError(message.toLowerCase().includes('invalid login credentials')
        ? 'Account not found or email not confirmed. Create an account first, then confirm the email from your inbox.'
        : message || 'Unable to log in.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <a href="/" className="auth-back">← Back to SubmitCheck</a>
        <div className="auth-mark">✓</div>
        <p className="auth-kicker">Author workspace</p>
        <h1>Welcome back</h1>
        <p className="auth-subtitle">Sign in to continue preparing your manuscript.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>Email address<input required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" type="email" autoComplete="email" /></label>
          <label>Password<input required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" type="password" autoComplete="current-password" /></label>
          <button disabled={loading} className="auth-submit">{loading ? 'Signing in...' : 'Sign in'}</button>
        </form>
        {error && <p role="alert" className="auth-error">{error}</p>}
        <div className="auth-switch">New to SubmitCheck? <a href="/signup">Create a free account</a></div>
      </div>
    </main>
  );
}
