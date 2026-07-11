import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLERK_BILLING_BOUNDARY_COPY,
  STUDI_PLAN_CATALOG,
} from "@/lib/billing/plan-catalog";
import { ClerkPricingTableShell, PlanBenefits } from "./PricingExperience";

const pricingTableMock = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  PricingTable: (props: unknown) => {
    pricingTableMock(props);
    return <div data-testid="clerk-pricing-table" />;
  },
}));

describe("PricingExperience", () => {
  beforeEach(() => {
    pricingTableMock.mockReset();
  });

  it("renders canonical benefits for preview, Starter, and Pro", () => {
    render(<PlanBenefits plans={Object.values(STUDI_PLAN_CATALOG)} />);

    expect(
      screen.getByRole("heading", { name: "Guided preview" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Starter" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Pro" })).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });

  it("reserves responsive space and explains that Clerk owns live billing truth", () => {
    render(
      <ClerkPricingTableShell boundaryCopy={CLERK_BILLING_BOUNDARY_COPY} />,
    );

    expect(screen.getByTestId("clerk-pricing-table-shell")).toHaveAttribute(
      "data-layout-reserve",
      "responsive",
    );
    expect(screen.getByText(CLERK_BILLING_BOUNDARY_COPY)).toBeVisible();
    expect(screen.getByText(/Upcoming/i)).toBeVisible();
    expect(pricingTableMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collapseFeatures: false,
        appearance: expect.objectContaining({
          elements: expect.objectContaining({
            pricingTableCardDescription: { display: "none" },
            pricingTableCardFeatures: { display: "none" },
          }),
        }),
      }),
    );
  });
});
