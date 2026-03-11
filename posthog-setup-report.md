# PostHog post-wizard report

## Summary

PostHog analytics was integrated into the Studi Next.js App Router project. The integration uses `instrumentation-client.ts` for client-side initialization (the correct approach for Next.js 15.3+), a reverse proxy via Next.js rewrites to route events through `/ingest`, and `posthog-js` for capturing custom business events.

### Files modified

| File | Change |
|------|--------|
| `instrumentation-client.ts` | Created — initializes PostHog with reverse proxy, exception capture, and debug mode |
| `next.config.ts` | Added `/ingest` reverse proxy rewrites and `skipTrailingSlashRedirect: true` |
| `components/landing/WaitlistForm.tsx` | Added waitlist conversion and Tally form events + exception capture |
| `components/StudiChat.tsx` | Added chat, attachment, voice, spark, track, plan, and thread delete events |
| `components/analytics/PricingPageView.tsx` | Created — client component that fires `pricing_page_viewed` on mount |
| `app/pricing/page.tsx` | Imported and rendered `<PricingPageView />` |
| `.env.local` | Set `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` |

---

## Events

| Event | Description | File |
|-------|-------------|------|
| `waitlist_joined` | User successfully joined the waitlist (new entry) | `components/landing/WaitlistForm.tsx` |
| `waitlist_already_on_list` | User tried to join but was already registered | `components/landing/WaitlistForm.tsx` |
| `waitlist_tally_form_opened` | User clicked the "Get ahead in line" Tally form link | `components/landing/WaitlistForm.tsx` |
| `thread_created` | User sent their first message, creating a new thread | `components/StudiChat.tsx` |
| `message_sent` | User sent a message in an existing thread | `components/StudiChat.tsx` |
| `attachment_uploaded` | User successfully uploaded one or more files | `components/StudiChat.tsx` |
| `voice_mode_opened` | User activated voice tutoring mode | `components/StudiChat.tsx` |
| `voice_mode_closed` | User manually ended a voice session | `components/StudiChat.tsx` |
| `track_started` | User converted a thread into a learning track | `components/StudiChat.tsx` |
| `plan_accepted` | User accepted a learning plan | `components/StudiChat.tsx` |
| `spark_expanded` | User expanded a spark artifact into the side panel | `components/StudiChat.tsx` |
| `thread_deleted` | User deleted a thread | `components/StudiChat.tsx` |
| `pricing_page_viewed` | User visited the /pricing page | `components/analytics/PricingPageView.tsx` |

---

## LLM Analytics

PostHog LLM analytics (`$ai_generation` events) was added to the Convex backend so every agent and spark-worker generation is traced. The approach uses the existing `capturePosthogEvent()` HTTP helper (safe for Convex's serverless environment) rather than `posthog-node` or `@posthog/ai` wrappers, which require lifecycle management.

### Packages installed

| Package | Version | Purpose |
|---------|---------|---------|
| `@posthog/ai` | 7.11.0 | Installed for reference; manual capture used instead |
| `posthog-node` | 5.28.0 | Installed for reference; manual capture used instead |

### Files modified

| File | Change |
|------|--------|
| `convex/agent.ts` | Added `$ai_generation` capture in `usageHandler` for all agent LLM calls |
| `convex/sparks/tools.ts` | Added `$ai_generation` capture in the `workerUsage` loop for spark worker LLM calls |

### LLM events

| Event | Properties | Source |
|-------|-----------|--------|
| `$ai_generation` | `$ai_trace_id` (threadId), `$ai_model`, `$ai_provider`, `$ai_input_tokens`, `$ai_output_tokens`, `$ai_total_cost_usd`, `$ai_span_name` | `convex/agent.ts` `usageHandler` |
| `$ai_generation` | same as above; `$ai_span_name` = `spark_worker:{sparkId}:{attempt}` | `convex/sparks/tools.ts` worker loop |

`$ai_trace_id` is set to `threadId` so all generations within a conversation are grouped as a trace in PostHog's LLM Analytics UI.

`$ai_span_name` follows the pattern `{agentName}` (e.g. `studi-balanced`) for agents and `spark_worker:{sparkId}:{attempt}` (e.g. `spark_worker:scene:initial`) for spark workers, enabling per-source filtering.

### Agent skill

The PostHog LLM analytics setup skill is stored at `.claude/skills/posthog-llm-analytics-setup/`. It can be reused or referenced for future LLM analytics work in this project.

---

## Next steps

### Dashboards

- [Analytics basics](https://us.posthog.com/project/138887/dashboard/1350938)
- [LLM analytics](https://us.posthog.com/project/138887/dashboard/1350950)

### Insights

**Product analytics**
- [Waitlist → Tally form funnel](https://us.posthog.com/project/138887/insights/coxm2Q4t)
- [Chat engagement: threads & messages](https://us.posthog.com/project/138887/insights/xUd3ZoOO)
- [Pricing page → first thread funnel](https://us.posthog.com/project/138887/insights/hSFlzFd2)
- [Spark & learning engagement](https://us.posthog.com/project/138887/insights/YqEOlq4J)
- [Voice session usage](https://us.posthog.com/project/138887/insights/D1BkRvYD)

**LLM analytics**
- [AI generation volume & active users](https://us.posthog.com/project/138887/insights/AbbDIyN8)
- [Token usage: input vs output](https://us.posthog.com/project/138887/insights/w4tSwnao)
- [Daily LLM cost (USD)](https://us.posthog.com/project/138887/insights/MP0i931I)
- [Agent vs spark worker generations](https://us.posthog.com/project/138887/insights/UOVQlH6d)

### Agent skills

- PostHog Next.js App Router integration: `.claude/skills/posthog-integration-nextjs-app-router/`
- PostHog LLM analytics setup: `.claude/skills/posthog-llm-analytics-setup/`
