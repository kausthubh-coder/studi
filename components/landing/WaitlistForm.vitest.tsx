import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WaitlistForm } from "./WaitlistForm";

const { joinWaitlist } = vi.hoisted(() => ({
  joinWaitlist: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useAction: () => joinWaitlist,
}));

describe("WaitlistForm", () => {
  beforeEach(() => {
    joinWaitlist.mockReset();
  });

  it("finishes signup after one email and offers the long form as optional", async () => {
    joinWaitlist.mockResolvedValue({ success: true, alreadyOnList: false });
    render(<WaitlistForm />);

    fireEvent.change(screen.getByRole("textbox", { name: "Email address" }), {
      target: { value: "learner@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Get Early Access" }));

    await waitFor(() => {
      expect(screen.getByText("You're on the list!")).toBeVisible();
    });
    const success = screen.getByRole("status");
    expect(success).toHaveAttribute("aria-live", "polite");
    expect(success).toHaveFocus();
    expect(
      screen
        .getByRole("link", { name: /optional: answer 8 short steps/i })
        .getAttribute("href"),
    ).toMatch(/^\/waitlist\/?\?source=landing$/);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses unique helper-text ids when both landing forms render", () => {
    render(
      <>
        <WaitlistForm />
        <WaitlistForm variant="teal" />
      </>,
    );

    const inputs = screen.getAllByRole("textbox", { name: "Email address" });
    const describedBy = inputs.map((input) =>
      input.getAttribute("aria-describedby"),
    );

    expect(new Set(describedBy).size).toBe(2);
    for (const id of describedBy) {
      expect(document.getElementById(id!)).toBeInTheDocument();
    }
  });

  it("shows the server's safe retry guidance when signup is rate limited", async () => {
    joinWaitlist.mockResolvedValue({
      success: false,
      error:
        "Too many signup attempts right now. Please wait a moment and try again.",
    });
    render(<WaitlistForm />);

    fireEvent.change(screen.getByRole("textbox", { name: "Email address" }), {
      target: { value: "learner@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Get Early Access" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many signup attempts right now. Please wait a moment and try again.",
    );
    expect(
      screen.getByRole("button", { name: "Get Early Access" }),
    ).toBeEnabled();
  });
});
