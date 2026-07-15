import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-5 py-12 text-fg">
      <section className="w-full max-w-2xl rounded-[32px] border-4 border-fg bg-bg-card p-7 shadow-[9px_9px_0_var(--accent2)] sm:p-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <span className="font-brand text-3xl tracking-tight">
            studi<span className="text-accent">.</span>
          </span>
          <span className="rounded-full border-2 border-fg bg-accent3 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.14em]">
            404
          </span>
        </div>

        <p className="mb-3 font-ui text-xs font-bold uppercase tracking-[0.16em] text-[#217567]">
          A useful wrong turn
        </p>
        <h1 className="max-w-xl font-brand text-4xl leading-tight sm:text-6xl">
          This page wandered off the study path.
        </h1>
        <p className="mt-5 max-w-xl font-body text-lg leading-relaxed text-fg-muted">
          There is nothing to learn from a dead end. Head home, or open Studi
          and keep following the next good question.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-fg bg-[#b64028] px-5 py-2.5 font-ui text-sm font-bold text-white shadow-[3px_3px_0_var(--fg)] transition hover:-translate-y-0.5"
          >
            Back to home
          </Link>
          <Link
            href="/chat"
            prefetch={false}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-fg bg-white px-5 py-2.5 font-ui text-sm font-bold text-fg shadow-[3px_3px_0_var(--fg)] transition hover:-translate-y-0.5"
          >
            Open Studi
          </Link>
        </div>
      </section>
    </main>
  );
}
