import Script from "next/script";

type WaitlistPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
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

export default function WaitlistPage({ searchParams }: WaitlistPageProps) {
  const tallySrc = buildTallySrc(searchParams ?? {});

  return (
    <>
      <Script src="https://tally.so/widgets/embed.js" strategy="afterInteractive" />
      <main className="fixed inset-0 overflow-hidden bg-white">
        <iframe
          data-tally-src={tallySrc}
          src={tallySrc}
          width="100%"
          height="100%"
          frameBorder="0"
          marginHeight={0}
          marginWidth={0}
          title="Join the waitlist"
          className="absolute inset-0 border-0"
        />
      </main>
    </>
  );
}
