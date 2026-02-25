# Base PostHog Guidance

Use this file with a framework file.

## Event and Property Standards

- Naming format: `[object]_[action]` in snake_case.
- Prefer specific past-tense actions (`project_created`) over generic actions (`click`).
- Add properties that explain why the event happened, not just where.

Good examples:

- `user_signed_up`
- `feature_used`
- `checkout_started`
- `payment_completed`

Bad examples:

- `click`
- `ButtonClick`
- `user signup`

## Identification Lifecycle

- Identify on signup/login with durable `distinct_id` (usually app user id).
- Keep user properties updated (`plan`, `onboarding_completed`, `company_id`).
- Reset identity on logout.

```ts
posthog.identify(user.id, {
  email: user.email,
  plan: user.plan,
  created_at: user.createdAt,
});

posthog.capture("user_logged_out");
posthog.reset();
```

## Feature Flags

- Use flags for staged rollout and experimentation.
- Capture exposure event when experiment components render.
- Include variant details in analysis events.

```ts
posthog.capture("experiment_viewed", {
  experiment: "checkout_experiment",
  variant: "control",
});
```

## Privacy and Compliance

- Never track secrets, credentials, payment card details, government IDs, or medical data.
- Respect DNT and user cookie consent.
- Add a sanitization layer before sending properties.

```ts
const SENSITIVE_KEYS = ["password", "token", "secret", "credit", "ssn"];

export function sanitizeProperties(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key]) =>
        !SENSITIVE_KEYS.some((sensitive) =>
          key.toLowerCase().includes(sensitive),
        ),
    ),
  );
}
```

## Dashboard Planning

Design dashboards around decisions:

- Acquisition: where users come from, what converts
- Activation: whether users reach first value quickly
- Engagement: which features drive repeat usage
- Retention: who returns and what predicts churn
- Revenue: upgrades, downgrades, conversion to paid

## Testing and Debugging

- In development, use PostHog debug logs and inspect outgoing events.
- In E2E tests, mock PostHog and assert expected event payloads.
- Ensure key flows emit events exactly once (avoid duplicate capture).

## Credentials Pattern

If the project keeps a secret-pattern registry, add this pattern:

`'POSTHOG_API_KEY': r'phc_[A-Za-z0-9]+'`
