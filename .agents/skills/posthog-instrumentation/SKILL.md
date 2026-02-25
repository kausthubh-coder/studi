---
name: posthog-instrumentation
description: Implement PostHog product analytics with event tracking, user identification, feature flags, and project-specific dashboards. Triggers when users ask to add tracking, instrument events, add analytics, or implement feature flags.
---

# PostHog Analytics Skill

Load with: `base.md` + `[framework].md`

For this repository, default to: `base.md` + `nextjs-convex.md`.

Sources: PostHog Docs, Product Analytics, Feature Flags.

## Philosophy

Measure what matters, not everything.

Analytics should answer specific questions:

- Are users getting value (activation, retention)?
- Where do users struggle (funnels, drop-offs)?
- What features drive engagement (feature usage)?
- Is the product growing (acquisition, referrals, revenue)?

Do not track everything. Track what informs decisions.

## When to Use

- User asks to add PostHog or analytics
- User asks to track events or user actions
- User asks for user identification lifecycle tracking
- User asks to implement feature flags or A/B tests
- User asks to create analytics dashboards and funnels

## Workflow

1. Identify framework/runtime and package manager (use `bun` in this repo).
2. Check for existing PostHog setup before adding new files.
3. Define event taxonomy tied to product decisions.
4. Implement instrumentation (capture, identify, reset, flags).
5. Add privacy-safe property sanitization and consent behavior.
6. Add or propose project-specific dashboards.

## Defaults for This Codebase

- Stack: Next.js App Router + Convex backend.
- Package manager: `bun` only.
- Recommended setup: client with `posthog-js`, server with `posthog-node` where needed.
- Prefer wrappers/hooks over ad hoc `posthog.capture` calls.

## Core Rules

- Event names use snake_case and clear object_action semantics.
- Include relevant properties for analysis context.
- Identify users after auth events, and reset on logout.
- Use feature flags for gradual rollouts and experiments.
- Never track secrets or sensitive personal data.

## Quick Event Checklist

- Acquisition: `user_signed_up`, `user_logged_in`
- Activation: `onboarding_started`, `onboarding_step_completed`, `onboarding_completed`
- Engagement: `[feature]_used`, `[resource]_created`, `search_performed`, `invite_sent`
- Revenue: `pricing_page_viewed`, `checkout_started`, `subscription_upgraded`, `subscription_cancelled`

## Privacy Requirements

- Respect opt-in/opt-out preferences.
- Prefer `person_profiles: 'identified_only'` where available.
- Sanitize event properties to remove secrets (password, token, secret, credit, ssn).

## Dashboard Templates

- SaaS: Acquisition, Activation, Engagement, Retention, Revenue
- E-commerce: Conversion Funnel, Product Performance, Customer LTV
- Content: Consumption, Engagement, Growth
- AI apps: Usage, Quality, Cost

If PostHog MCP tooling is available, list existing dashboards first, then create missing dashboards and add funnel insights.
