import Link from "next/link";

type WaitlistPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const FALLBACK_TALLY_URL = "https://tally.so/r/WOAjRv";

function buildTallySrc(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const base =
    process.env.NEXT_PUBLIC_TALLY_WAITLIST_FORM_URL ?? FALLBACK_TALLY_URL;
  const url = new URL(base);

  for (const [key, raw] of Object.entries(searchParams)) {
    if (raw === undefined) {
      continue;
    }

    if (Array.isArray(raw)) {
      for (const value of raw) {
        url.searchParams.append(key, value);
      }
      continue;
    }

    url.searchParams.append(key, raw);
  }

  url.searchParams.set("formEventsForwarding", "1");
  return url.toString();
}

export default async function WaitlistPage({ searchParams }: WaitlistPageProps) {
  const tallySrc = buildTallySrc((await searchParams) ?? {});

  return (
    <main className="min-h-screen bg-[#fdf8f2] px-4 py-5 text-[#1c1208] md:px-6 md:py-8">
      <div className="mx-auto w-full max-w-5xl">
        <nav className="flex items-center justify-between gap-4" aria-label="Waitlist navigation">
          <Link
            href="/"
            aria-label="Studi home"
            className="inline-flex min-h-11 items-center gap-1 rounded-full border-2 border-[#1c1208] bg-white px-4 py-2 font-brand text-xl shadow-[3px_3px_0px_#1c1208]"
          >
            studi<span className="mb-1 inline-block h-2 w-2 rounded-full bg-[#e05a3a]" aria-hidden="true" />
          </Link>
          <Link
            href="/#get-early-access"
            className="inline-flex min-h-11 items-center rounded-full border-2 border-[#1c1208] bg-white px-4 py-2 text-sm font-bold shadow-[2px_2px_0px_#1c1208]"
          >
            Join with email instead
          </Link>
        </nav>

        <header className="mx-auto max-w-3xl py-12 text-center md:py-16">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[#217567]">
            Optional research
          </p>
          <h1 className="font-brand text-4xl leading-tight sm:text-5xl md:text-6xl">
            Help shape what Studi teaches next.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl font-body text-lg leading-relaxed text-[#6b5a47]">
            Joining the waitlist only takes one email on the Studi homepage. This optional questionnaire has 8 short steps and helps us understand what learners need. It is not required to keep your place.
          </p>
        </header>

        <section
          aria-labelledby="optional-questionnaire-title"
          className="overflow-hidden rounded-3xl border-4 border-[#1c1208] bg-white shadow-[8px_8px_0px_#3a9e8a]"
        >
          <div className="border-b-2 border-[#1c1208] bg-[#fff8f0] px-5 py-4 md:px-7">
            <h2 id="optional-questionnaire-title" className="font-brand text-2xl">
              Optional questionnaire
            </h2>
            <p className="mt-1 text-sm text-[#6b5a47]">8 short steps · about two minutes · powered by Tally</p>
          </div>
        <iframe
          data-tally-src={tallySrc}
          src={tallySrc}
          width="100%"
          height="760"
          frameBorder="0"
          marginHeight={0}
          marginWidth={0}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          title="Optional Studi learner questionnaire"
          className="block min-h-[760px] w-full border-0 bg-white"
        />
        </section>

        <p className="py-8 text-center text-sm text-[#6b5a47]">
          Finished or changed your mind? <Link href="/" className="font-bold underline underline-offset-4">Return to Studi</Link>.
        </p>
      </div>
    </main>
  );
}
