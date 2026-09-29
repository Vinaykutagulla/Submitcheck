export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[var(--paper)] p-6 text-[var(--ink)]">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 text-center">
          <div className="text-sm uppercase tracking-[0.2em] text-[var(--ink-soft)]">Pricing</div>
          <h1 className="mt-3 text-4xl font-semibold">Choose the plan that fits your submission workflow</h1>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[28px] border border-[var(--rule)] bg-white p-6 shadow-[0_20px_40px_rgba(31,45,61,0.12)]">
            <div className="text-sm uppercase tracking-[0.18em] text-[var(--ink-soft)]">Per manuscript</div>
            <div className="mt-4 text-4xl font-semibold">₹499</div>
            <p className="mt-3 text-[var(--ink-soft)]">One-time publication readiness check for a single manuscript.</p>
            <ul className="mt-6 space-y-3 text-sm text-[var(--ink-soft)]">
              <li>Journal match scoring</li>
              <li>Gap analysis</li>
              <li>Formatting checklist</li>
            </ul>
            <a href="/?pricing=1" className="mt-6 block w-full rounded-full bg-[var(--brand-blue)] px-4 py-3 text-center font-medium text-white">Buy now</a>
          </div>

          <div className="rounded-[28px] border border-[var(--rule)] bg-[var(--card)] p-6 shadow-[0_20px_40px_rgba(31,45,61,0.12)]">
            <div className="text-sm uppercase tracking-[0.18em] text-[var(--ink-soft)]">Author Pro</div>
            <div className="mt-4 text-4xl font-semibold">₹299/mo</div>
            <p className="mt-3 text-[var(--ink-soft)]">Unlimited manuscript checks and premium journal recommendations.</p>
            <ul className="mt-6 space-y-3 text-sm text-[var(--ink-soft)]">
              <li>Unlimited searches</li>
              <li>Advanced formatting rules</li>
              <li>Priority support</li>
            </ul>
            <a href="/?pricing=1" className="mt-6 block w-full rounded-full bg-[var(--ink)] px-4 py-3 text-center font-medium text-white">Start Pro</a>
          </div>
        </div>
      </div>
    </main>
  );
}
