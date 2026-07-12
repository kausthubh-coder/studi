import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, fn, waitFor } from "storybook/test";

import { WaitlistForm } from "./WaitlistForm";

const joinSuccessfully = fn(async () => ({
  success: true,
  alreadyOnList: false,
}));
const joinAgain = fn(async () => ({ success: true, alreadyOnList: true }));
const rejectJoin = fn(async () => ({
  success: false,
  error: "Early access is paused for a moment. Please try again soon.",
}));
const failJoin = fn(async () => {
  throw new Error("Storybook network failure");
});
const keepSubmitting = fn(() => new Promise(() => undefined));

const meta = {
  component: WaitlistForm,
  tags: ["autodocs", "ai-generated"],
  parameters: {
    layout: "fullscreen",
    studi: {
      convex: {
        actions: { "waitlistPublic:joinWaitlist": joinSuccessfully },
      },
    },
  },
  decorators: [
    (Story) => (
      <main
        style={{
          minHeight: "100vh",
          padding: "5rem 1rem",
          background: "#fdf8f2",
        }}
      >
        <div style={{ width: "min(100%, 580px)", margin: "0 auto" }}>
          <Story />
        </div>
      </main>
    ),
  ],
  args: { variant: "coral" },
} satisfies Meta<typeof WaitlistForm>;

export default meta;
type Story = StoryObj<typeof meta>;

async function submitEmail(
  canvas: Parameters<NonNullable<Story["play"]>>[0]["canvas"],
  userEvent: Parameters<NonNullable<Story["play"]>>[0]["userEvent"],
  email = "learner@studi.test",
) {
  const emailInput = canvas.getByRole("textbox", { name: /email/i });
  fireEvent.change(emailInput, { target: { value: email } });
  await expect(emailInput).toHaveValue(email);
  await userEvent.click(
    canvas.getByRole("button", { name: "Get Early Access" }),
  );
}

export const CoralIdle: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: /email/i })).toBeEnabled();
    await expect(
      canvas.getByText("No credit card required. Free for students."),
    ).toBeInTheDocument();
  },
};

export const TealIdle: Story = { args: { variant: "teal" } };

export const InvalidEmailFocus: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Get Early Access" }),
    );
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Please enter a valid email address.",
    );
    await expect(canvas.getByRole("textbox", { name: /email/i })).toHaveFocus();
  },
};

export const Submitting: Story = {
  parameters: {
    studi: {
      convex: {
        actions: { "waitlistPublic:joinWaitlist": keepSubmitting },
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await submitEmail(canvas, userEvent);
    await expect(canvas.getByText("Joining...")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: /joining/i }),
    ).toBeDisabled();
  },
};

export const NewSignupSuccessModal: Story = {
  play: async ({ canvas, userEvent }) => {
    await submitEmail(canvas, userEvent);
    await waitFor(() =>
      expect(canvas.getByRole("dialog")).toHaveAccessibleName(
        "You're on the list!",
      ),
    );
    await expect(canvas.getByText(/opens its doors/i)).toBeInTheDocument();
    const closeButton = canvas.getByRole("button", { name: "Close" });
    await waitFor(() => expect(closeButton).toHaveFocus());

    await userEvent.click(closeButton);
    await waitFor(() =>
      expect(canvas.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    const reopenButton = canvas.getByRole("button", {
      name: "Get ahead in line →",
    });
    await waitFor(() => expect(reopenButton).toHaveFocus());

    await userEvent.click(reopenButton);
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Close" })).toHaveFocus(),
    );
    await userEvent.tab({ shift: true });
    await expect(
      canvas.getByRole("button", { name: "No thanks, I'll wait my turn" }),
    ).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(canvas.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(reopenButton).toHaveFocus());
  },
};

export const AlreadyRegistered: Story = {
  parameters: {
    studi: {
      convex: { actions: { "waitlistPublic:joinWaitlist": joinAgain } },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await submitEmail(canvas, userEvent);
    await expect(
      await canvas.findByRole("heading", { name: "Already on the list!" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText(/already registered/i)).toBeInTheDocument();
  },
};

export const BackendRejected: Story = {
  parameters: {
    studi: {
      convex: { actions: { "waitlistPublic:joinWaitlist": rejectJoin } },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await submitEmail(canvas, userEvent);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Early access is paused for a moment.",
    );
  },
};

export const NetworkError: Story = {
  parameters: {
    studi: {
      convex: { actions: { "waitlistPublic:joinWaitlist": failJoin } },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await submitEmail(canvas, userEvent);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
  },
};

export const MobileModal: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  play: NewSignupSuccessModal.play,
};
