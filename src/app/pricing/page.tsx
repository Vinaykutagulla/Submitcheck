export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] p-6 text-[var(--ink)]">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 text-center">
          <div className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">Pricing</div>
          <h1 className="mt-3 text-4xl font-semibold">Choose the plan that fits your submission workflow</h1>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[28px] border border-[var(--line)] bg-white p-6 shadow-[0_20px_40px_var(--shadow)]">
            <div className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">Per manuscript</div>
            <div className="mt-4 text-4xl font-semibold">₹799</div>
            <p className="mt-3 text-[var(--muted)]">One-time publication readiness check for a single manuscript.</p>
            <ul className="mt-6 space-y-3 text-sm text-[var(--muted)]">
              <li>Journal match scoring</li>
              <li>Gap analysis</li>
              <li>Formatting checklist</li>
            </ul>
            <button className="mt-6 w-full rounded-full bg-[var(--brand)] px-4 py-3 font-medium text-white">Buy now</button>
          </div>

          <div className="rounded-[28px] border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[0_20px_40px_var(--shadow)]">
            <div className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">Author Pro</div>
            <div className="mt-4 text-4xl font-semibold">₹1,999/mo</div>
            <p className="mt-3 text-[var(--muted)]">Unlimited manuscript checks and premium journal recommendations.</p>
            <ul className="mt-6 space-y-3 text-sm text-[var(--muted)]">
              <li>Unlimited searches</li>
              <li>Advanced formatting rules</li>
              <li>Priority support</li>
            </ul>
            <button className="mt-6 w-full rounded-full bg-[var(--ink)] px-4 py-3 font-medium text-white">Start Pro</button>
          </div>
        </div>
      </div>
    </main>
  );
}
