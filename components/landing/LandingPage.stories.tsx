import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, fn, waitFor } from "storybook/test";

import { LandingPage } from "./LandingPage";

const joinWaitlist = fn(async () => ({
  success: true,
  alreadyOnList: false,
})).mockName("landingPageJoinWaitlist");

const scrollIntoView = fn().mockName("landingPageScrollIntoView");

const meta = {
  component: LandingPage,
  tags: ["autodocs", "ai-generated"],
  parameters: {
    layout: "fullscreen",
    studi: {
      auth: { status: "unauthenticated", user: null },
      convex: {
        actions: { "waitlistPublic:joinWaitlist": joinWaitlist },
      },
    },
  },
} satisfies Meta<typeof LandingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedOutDesktop: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", {
        level: 1,
        name: /learn it like you invented it/i,
      }),
    ).toBeInTheDocument();
    for (const signInLink of canvas.getAllByRole("link", { name: "Sign in" })) {
      await expect(signInLink).toHaveAttribute("href", "/chat");
    }
    await expect(
      canvas.getAllByRole("textbox", { name: "Email address" }),
    ).toHaveLength(2);
    await expect(
      canvas.queryByRole("link", { name: "Open chat" }),
    ).not.toBeInTheDocument();
  },
};

export const SignedInLearner: Story = {
  parameters: {
    studi: {
      auth: { status: "authenticated" },
    },
  },
  play: async ({ canvas }) => {
    for (const linkName of ["Open chat", "Continue learning →"]) {
      const links = canvas.getAllByRole("link", { name: linkName });
      await expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        await expect(link).toHaveAttribute("href", "/chat");
      }
    }

    await expect(
      canvas.queryByRole("textbox", { name: "Email address" }),
    ).not.toBeInTheDocument();
  },
};

export const MobileSignedOut: Story = {
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
  play: async ({ canvas, userEvent }) => {
    const freeQuestion = canvas.getByRole("button", { name: /^Is it free\?/ });
    const sparkQuestion = canvas.getByRole("button", {
      name: /^What is a Spark\?/,
    });

    freeQuestion.scrollIntoView({ block: "center" });
    await waitFor(() => expect(freeQuestion).toBeVisible());
    await expect(freeQuestion).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(freeQuestion);
    await expect(freeQuestion).toHaveAttribute("aria-expanded", "true");
    await expect(
      canvas.getByText(/free for students during early access/i),
    ).toBeInTheDocument();

    await userEvent.click(sparkQuestion);
    await expect(sparkQuestion).toHaveAttribute("aria-expanded", "true");
    await expect(
      canvas.getByText(
        /a small interactive artifact Studi generates mid-conversation/i,
      ),
    ).toBeInTheDocument();

    await userEvent.click(freeQuestion);
    await expect(freeQuestion).toHaveAttribute("aria-expanded", "false");
    await waitFor(() =>
      expect(
        canvas.queryByText(/free for students during early access/i),
      ).not.toBeInTheDocument(),
    );
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
    await expect(
      await canvas.findByRole("dialog", { name: "You're on the list!" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        canvas.getByText(
          "We'll let you know the moment Studi opens its doors.",
        ),
      ).toBeVisible(),
    );

    await userEvent.click(canvas.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(canvas.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await expect(
      canvas.getByText("You're on the list!", { selector: "p" }),
    ).toBeVisible();
  },
};
