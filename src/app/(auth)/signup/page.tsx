'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function SignUpPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
      if (signUpError) throw signUpError;
      if (data.session) {
        router.push('/');
        router.refresh();
      } else {
        setMessage('Check your email to confirm your account.');
      }
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : '';
      setError(message.toLowerCase().includes('rate limit')
        ? 'Supabase email limit reached. Wait a few minutes, or disable email confirmation in Supabase for local testing, then try again.'
        : message || 'Unable to create your account.');
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
        <h1>Create your account</h1>
        <p className="auth-subtitle">Use any email address, including Gmail, to create your free account.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>Full name<input required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" type="text" autoComplete="name" /></label>
          <label>Email address<input required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" type="email" autoComplete="email" /></label>
          <label>Password<input required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" type="password" autoComplete="new-password" /></label>
          <button disabled={loading} className="auth-submit">{loading ? 'Creating account...' : 'Create account'}</button>
        </form>
        {message && <p className="quote-message">{message}</p>}
        {error && <p role="alert" className="auth-error">{error}</p>}
        <div className="auth-switch">Already have an account? <a href="/login">Sign in</a></div>
      </div>
    </main>
  );
}
