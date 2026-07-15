import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, fn, waitFor } from "storybook/test";

import { PRICING_FAQ_ANSWER } from "@/lib/billing/plan-catalog";
import { LandingPage } from "./LandingPage";

const joinWaitlist = fn(async () => ({
  success: true,
})).mockName("landingPageJoinWaitlist");

const scrollIntoView = fn().mockName("landingPageScrollIntoView");

const meta = {
  component: LandingPage,
  tags: ["autodocs", "ai-generated"],
  parameters: {
    layout: "fullscreen",
    studi: {
      convex: {
        actions: { "waitlistPublic:joinWaitlist": joinWaitlist },
      },
    },
  },
} satisfies Meta<typeof LandingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", {
        level: 1,
        name: /learn it like you invented it/i,
      }),
    ).toBeInTheDocument();
    for (const openChatLink of canvas.getAllByRole("link", {
      name: "Open chat",
    })) {
      await expect(openChatLink).toHaveAttribute("href", "/chat");
    }
    await expect(
      canvas.getAllByRole("textbox", { name: "Email address" }),
    ).toHaveLength(2);
    await expect(
      canvas.queryByRole("link", { name: "Sign in" }),
    ).not.toBeInTheDocument();
  },
};

export const UniversalChatEntry: Story = {
  play: async ({ canvas }) => {
    const openChatLinks = canvas.getAllByRole("link", { name: "Open chat" });
    await expect(openChatLinks.length).toBeGreaterThan(0);
    for (const link of openChatLinks) {
      await expect(link).toHaveAttribute("href", "/chat");
    }

    await expect(
      canvas.getAllByRole("textbox", { name: "Email address" }),
    ).toHaveLength(2);
  },
};

export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
  play: async ({ canvas }) => {
    const heading = canvas.getByRole("heading", {
      level: 1,
      name: /learn it like you invented it/i,
    });

    await waitFor(() => expect(heading).toBeVisible());
    await expect(
      canvas.getAllByRole("button", { name: "Get Early Access" })[0],
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("textbox", { name: "Email address" })[0],
    ).toBeEnabled();
  },
};

export const EarlyAccessCtaFocusesHeroForm: Story = {
  beforeEach: () => {
    scrollIntoView.mockClear();
    const originalScrollIntoView = Element.prototype.scrollIntoView;

    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    return () => {
      if (originalScrollIntoView) {
        Object.defineProperty(Element.prototype, "scrollIntoView", {
          configurable: true,
          value: originalScrollIntoView,
        });
      } else {
        delete (Element.prototype as { scrollIntoView?: unknown })
          .scrollIntoView;
      }
    };
  },
  play: async ({ canvas, userEvent }) => {
    const [navigationCta] = canvas.getAllByRole("button", {
      name: "Get Early Access",
    });
    const [heroEmail] = canvas.getAllByRole("textbox", {
      name: "Email address",
    });

    await userEvent.click(navigationCta);
    await expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    await waitFor(() => expect(heroEmail).toHaveFocus(), { timeout: 1_500 });
  },
};

export const FaqAccordion: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const freeQuestion = canvas.getByRole("button", { name: /^Is it free\?/ });
    const sparkQuestion = canvas.getByRole("button", {
      name: /^What is a Spark\?/,
    });
    const freeRegionId = freeQuestion.getAttribute("aria-controls");
    const freeRegion = freeRegionId
      ? canvasElement.ownerDocument.getElementById(freeRegionId)
      : null;
    if (!freeRegion) throw new Error("The free FAQ region was not rendered");

    freeQuestion.scrollIntoView({ block: "center" });
    await waitFor(() => expect(freeQuestion).toBeVisible());
    await expect(freeQuestion).toHaveAttribute("aria-expanded", "false");
    await expect(freeRegion).not.toBeVisible();
    await userEvent.click(freeQuestion);
    await expect(freeQuestion).toHaveAttribute("aria-expanded", "true");
    await expect(freeRegion).toBeVisible();
    await expect(freeRegion).toHaveTextContent(PRICING_FAQ_ANSWER);

    await userEvent.click(sparkQuestion);
    await expect(sparkQuestion).toHaveAttribute("aria-expanded", "true");
    await expect(
      canvas.getByText(
        /a small interactive artifact Studi generates mid-conversation/i,
      ),
    ).toBeInTheDocument();

    await userEvent.click(freeQuestion);
    await expect(freeQuestion).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(freeRegion).not.toBeVisible());
    await expect(freeRegion).toHaveAttribute("hidden");
    await expect(freeRegion).toHaveTextContent(PRICING_FAQ_ANSWER);
  },
};

export const WaitlistSignupSuccess: Story = {
  play: async ({ canvas, userEvent }) => {
    const [heroEmail] = canvas.getAllByRole("textbox", {
      name: "Email address",
    });
    const [, heroSubmit] = canvas.getAllByRole("button", {
      name: "Get Early Access",
    });

    fireEvent.change(heroEmail, {
      target: { value: "learner@studi.test" },
    });
    await expect(heroEmail).toHaveValue("learner@studi.test");
    await userEvent.click(heroSubmit);

    await expect(joinWaitlist).toHaveBeenCalledWith({
      email: "learner@studi.test",
    });
    const successMessage = await canvas.findByText(
      "One email is all it takes. Check your inbox for updates.",
    );
    await waitFor(() => expect(successMessage).toBeVisible());
    await expect(
      canvas.getByRole("link", { name: "Optional: answer 8 short steps →" }),
    ).toHaveAttribute("href", "/waitlist?source=landing");
    await expect(
      canvas.queryByText(/already (?:on|joined)/i),
    ).not.toBeInTheDocument();
  },
};
