export default function AppWorkflowPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] p-6 text-[var(--ink)]">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <div className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">SubmitCheck</div>
            <h1 className="mt-2 text-3xl font-semibold">5-step workflow</h1>
          </div>
          <div className="flex items-center gap-3">
            <a href="/login" className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--panel)]">Log in</a>
            <a href="/signup" className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Create account</a>
            <div className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm">Free plan</div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="rounded-[28px] border border-[var(--line)] bg-white p-4">
            <div className="space-y-3">
              {['Find', 'Fix', 'Format', 'Verify', 'Submit'].map((step, index) => (
                <div key={step} className={`flex items-center gap-3 rounded-2xl px-3 py-3 ${index === 0 ? 'bg-[var(--panel)]' : ''}`}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand)] text-sm font-semibold text-white">{index + 1}</div>
                  <div className="font-medium">{step}</div>
                </div>
              ))}
            </div>
          </aside>

          <section className="rounded-[28px] border border-[var(--line)] bg-white p-6 shadow-[0_20px_40px_var(--shadow)]">
            <div className="space-y-6">
              <div>
                <div className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">Find</div>
                <h2 className="mt-2 text-2xl font-semibold">Paste your manuscript or upload a file</h2>
              </div>

              <textarea
                className="min-h-[220px] w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 text-base outline-none"
                placeholder="Paste your abstract or full manuscript text here..."
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <button className="rounded-full border border-[var(--line)] bg-white px-4 py-3 font-medium">Upload manuscript</button>
                <button className="rounded-full bg-[var(--brand)] px-4 py-3 font-medium text-white">Match journals</button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
