import { render, screen } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import NotFound from "@/app/not-found";
import manifest from "@/app/manifest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import {
  SITE_URL,
  chatMetadata,
  homeMetadata,
  pricingMetadata,
  settingsMetadata,
  siteMetadata,
  waitlistMetadata,
} from "@/lib/site-metadata";

describe("Studi public metadata and recovery routes", () => {
  it("uses Studi branding rather than framework defaults", () => {
    expect(siteMetadata.metadataBase?.toString()).toBe(`${SITE_URL}/`);
    expect(JSON.stringify(siteMetadata.icons)).toContain("/icon.svg");
    expect(JSON.stringify(siteMetadata.icons)).toContain("/favicon.ico");
    expect(JSON.stringify(siteMetadata.icons)).toContain("/apple-icon.png");
    expect(JSON.stringify(siteMetadata.icons)).not.toContain("convex.svg");
    expect(siteMetadata.alternates).toBeUndefined();
    expect(siteMetadata.openGraph).toMatchObject({
      siteName: "Studi",
      url: SITE_URL,
    });
    expect(JSON.stringify(siteMetadata.openGraph)).toContain(
      "/opengraph-image.png",
    );
    expect(existsSync(join(process.cwd(), "app/favicon.ico"))).toBe(true);
    expect(existsSync(join(process.cwd(), "app/apple-icon.png"))).toBe(true);
    expect(existsSync(join(process.cwd(), "app/opengraph-image.png"))).toBe(
      true,
    );
  });

  it("gives each indexed route its own canonical metadata", () => {
    expect(homeMetadata.alternates?.canonical).toBe(`${SITE_URL}/`);
    expect(pricingMetadata.alternates?.canonical).toBe(`${SITE_URL}/pricing`);
    expect(waitlistMetadata.alternates?.canonical).toBe(
      `${SITE_URL}/waitlist`,
    );
    expect(pricingMetadata.title).not.toEqual(homeMetadata.title);
    expect(waitlistMetadata.title).not.toEqual(homeMetadata.title);
  });

  it("keeps authenticated application routes out of search results", () => {
    expect(chatMetadata.robots).toMatchObject({ index: false, follow: false });
    expect(settingsMetadata.robots).toMatchObject({
      index: false,
      follow: false,
    });
  });

  it("publishes a crawler policy, sitemap, and installable manifest", () => {
    const robotsConfig = robots();
    const sitemapEntries = sitemap();
    const appManifest = manifest();

    expect(robotsConfig.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(JSON.stringify(robotsConfig.rules)).toContain("/chat");
    expect(sitemapEntries.map((entry) => entry.url)).toEqual(
      expect.arrayContaining([
        `${SITE_URL}/`,
        `${SITE_URL}/pricing`,
        `${SITE_URL}/waitlist`,
      ]),
    );
    expect(appManifest).toMatchObject({
      name: "Studi",
      start_url: "/",
      display: "standalone",
    });
    expect(JSON.stringify(appManifest.icons)).toContain("/icon.svg");
  });

  it("offers a branded 404 recovery path", () => {
    render(<NotFound />);

    expect(
      screen.getByRole("heading", { name: /page wandered off/i }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /back to home/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: /open studi/i })).toHaveAttribute(
      "href",
      "/chat",
    );
    expect(
      readFileSync(join(process.cwd(), "app/not-found.tsx"), "utf8"),
    ).toContain("prefetch={false}");
  });
});
