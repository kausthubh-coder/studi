export type StudiPlanKey = "free_onboarding" | "intro" | "pro";

export type StudiPlanStatus =
  | "onboarding"
  | "active"
  | "past_due"
  | "canceled"
  | "inactive";

export type StudiPlanDefinition = {
  key: StudiPlanKey;
  name: string;
  summary: string;
  benefits: readonly string[];
};

export const STUDI_PLAN_CATALOG: Readonly<
  Record<StudiPlanKey, StudiPlanDefinition>
> = Object.freeze({
  free_onboarding: {
    key: "free_onboarding",
    name: "Guided preview",
    summary: "Try Studi's question-led tutoring before choosing a paid plan.",
    benefits: [
      "Three text chats to experience the tutoring flow",
      "Question-led explanations that build understanding",
      "No payment method required",
    ],
  },
  intro: {
    key: "intro",
    name: "Starter",
    summary:
      "A steady plan for focused, everyday learning, with monthly AI capacity.",
    benefits: [
      "Full text tutoring beyond the guided preview",
      "File uploads for learning from your own material",
      "Interactive Sparks with monthly AI capacity",
    ],
  },
  pro: {
    key: "pro",
    name: "Pro",
    summary: "More monthly capacity for frequent and deeper study sessions.",
    benefits: [
      "Everything in Starter",
      "Higher monthly AI capacity",
      "Higher monthly Code Spark run allowance",
      "Designed for frequent study across subjects",
    ],
  },
});

export const PRICING_FAQ_ANSWER =
  "Studi starts with a free guided preview. Starter and Pro are paid plans; current prices, billing cadence, and availability are always shown on the Pricing page.";

export const WAITLIST_PRICING_ASSURANCE =
  "No credit card required to join. Studi starts with a free guided preview.";

export const CLERK_BILLING_BOUNDARY_COPY =
  "Studi explains what each plan is for. Clerk supplies the live prices, billing cadence, purchase availability, renewal dates, and subscription actions shown below.";

export const CLERK_UPCOMING_EXPLANATION =
  'If Clerk marks a plan "Upcoming" or shows a future start date, that plan is scheduled in the billing dashboard and is not yet available to purchase.';

const STUDI_PLAN_STATUS: Readonly<
  Record<StudiPlanStatus, { label: string; detail: string }>
> = Object.freeze({
  onboarding: {
    label: "Preview",
    detail: "Your guided preview is active.",
  },
  active: {
    label: "Active",
    detail: "Your paid plan access is active.",
  },
  past_due: {
    label: "Payment needs attention",
    detail: "Clerk needs an updated payment method before access can renew.",
  },
  canceled: {
    label: "Canceled",
    detail:
      "Renewal is canceled. Access may continue through the current paid period.",
  },
  inactive: {
    label: "Inactive",
    detail: "Choose an available plan in Clerk to restore paid access.",
  },
});

export function getStudiPlan(planKey: StudiPlanKey): StudiPlanDefinition {
  return STUDI_PLAN_CATALOG[planKey];
}

export function getStudiPlanStatus(status: StudiPlanStatus) {
  return STUDI_PLAN_STATUS[status];
}
