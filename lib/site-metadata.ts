import type { Metadata } from "next";

export const SITE_URL = "https://www.getstudi.com";

export const siteDescription =
  "An intuition-first AI tutor that asks the right next question and builds interactive Sparks so learners discover ideas for themselves.";

const socialImage = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "Studi — learn by figuring it out",
};

export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Studi",
  title: {
    default: "Studi — Learn by figuring it out",
    template: "%s — Studi",
  },
  description: siteDescription,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Studi",
    title: "Studi — Learn by figuring it out",
    description: siteDescription,
    images: [socialImage],
  },
  twitter: {
    card: "summary",
    title: "Studi — Learn by figuring it out",
    description: siteDescription,
    images: [socialImage.url],
  },
  category: "education",
};

function publicPageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = new URL(path, SITE_URL).toString();

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName: "Studi",
      title: `${title} — Studi`,
      description,
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — Studi`,
      description,
      images: [socialImage.url],
    },
  };
}

export const homeMetadata = publicPageMetadata({
  title: "Learn by figuring it out",
  description: siteDescription,
  path: "/",
});

export const pricingMetadata = publicPageMetadata({
  title: "Pricing",
  description:
    "Compare Studi plans and choose the tutoring pace and monthly limits that fit how you learn.",
  path: "/pricing",
});

export const waitlistMetadata = publicPageMetadata({
  title: "Join the waitlist",
  description: "Join the Studi waitlist for early access and product updates.",
  path: "/waitlist",
});

const privateRouteRobots: Metadata["robots"] = {
  index: false,
  follow: false,
  nocache: true,
};

export const chatMetadata: Metadata = {
  title: "Your tutor",
  description: "Your private Studi tutoring workspace.",
  robots: privateRouteRobots,
};

export const settingsMetadata: Metadata = {
  title: "Settings",
  description: "Manage your private Studi account and usage settings.",
  robots: privateRouteRobots,
};
