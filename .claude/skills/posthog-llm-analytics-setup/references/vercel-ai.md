# Vercel AI LLM analytics installation - Docs

1.  1

    ## Install the PostHog SDK

    Required

    Setting up analytics starts with installing the PostHog SDK.

    ```bash
    npm install @posthog/ai posthog-node
    ```

2.  2

    ## Install the Vercel AI SDK

    Required

    Install the Vercel AI SDK. The PostHog SDK instruments your LLM calls by wrapping the Vercel AI client. The PostHog SDK **does not** proxy your calls.

    ```bash
    npm install ai @ai-sdk/openai
    ```

    **Proxy note**

    These SDKs **do not** proxy your calls. They only fire off an async call to PostHog in the background to send the data. You can also use LLM analytics with other SDKs or our API, but you will need to capture the data in the right format. See the schema in the [manual capture section](/docs/llm-analytics/installation/manual-capture.md) for more details.

3.  3

    ## Initialize PostHog and Vercel AI

    Required

    Initialize PostHog with your project token and host from [your project settings](https://app.posthog.com/settings/project), then pass the Vercel AI OpenAI client and the PostHog client to the `withTracing` wrapper.

    ```typescript
    import { PostHog } from "posthog-node";
    import { withTracing } from "@posthog/ai"
    import { generateText } from "ai"
    import { createOpenAI } from "@ai-sdk/openai"
    const phClient = new PostHog(
      '<ph_project_token>',
      { host: 'https://us.i.posthog.com' }
    );
    const openaiClient = createOpenAI({
      apiKey: 'your_openai_api_key',
      compatibility: 'strict'
    });
    const model = withTracing(openaiClient("gpt-4-turbo"), phClient, {
      posthogDistinctId: "user_123", // optional
      posthogTraceId: "trace_123", // optional
      posthogProperties: { conversationId: "abc123", paid: true }, // optional
      posthogPrivacyMode: false, // optional
      posthogGroups: { company: "companyIdInYourDb" }, // optional
    });
    phClient.shutdown()
    ```

    You can enrich LLM events with additional data by passing parameters such as the trace ID, distinct ID, custom properties, groups, and privacy mode options.

4.  4

    ## Call Vercel AI

    Required

    Now, when you use the Vercel AI SDK to call LLMs, PostHog automatically captures an `$ai_generation` event. This works for both `text` and `image` message types.

    ```typescript
    const { text } = await generateText({
      model: model,
      prompt: message
    });
    console.log(text)
    ```

    > **Note:** If you want to capture LLM events anonymously, **don't** pass a distinct ID to the request. See our docs on [anonymous vs identified events](/docs/data/anonymous-vs-identified-events.md) to learn more.

    You can expect captured `$ai_generation` events to have the following properties:

    | Property | Description |
    | --- | --- |
    | $ai_model | The specific model, like gpt-5-mini or claude-4-sonnet |
    | $ai_latency | The latency of the LLM call in seconds |
    | $ai_time_to_first_token | Time to first token in seconds (streaming only) |
    | $ai_tools | Tools and functions available to the LLM |
    | $ai_input | List of messages sent to the LLM |
    | $ai_input_tokens | The number of tokens in the input (often found in response.usage) |
    | $ai_output_choices | List of response choices from the LLM |
    | $ai_output_tokens | The number of tokens in the output (often found in response.usage) |
    | $ai_total_cost_usd | The total cost in USD (input + output) |
    | [...] | See full list of properties |

5.  ## Verify traces and generations

    Recommended

    *Confirm LLM events are being sent to PostHog*

    Let's make sure LLM events are being captured and sent to PostHog. Under **LLM analytics**, you should see rows of data appear in the **Traces** and **Generations** tabs.

    ![LLM generations in PostHog](https://res.cloudinary.com/dmukukwp6/image/upload/SCR_20250807_syne_ecd0801880.png)![LLM generations in PostHog](https://res.cloudinary.com/dmukukwp6/image/upload/SCR_20250807_syjm_5baab36590.png)

    [Check for LLM events in PostHog](https://app.posthog.com/llm-analytics/generations)

6.  5

    ## Next steps

    Recommended

    Now that you're capturing AI conversations, continue with the resources below to learn what else LLM Analytics enables within the PostHog platform.

    | Resource | Description |
    | --- | --- |
    | Basics | Learn the basics of how LLM calls become events in PostHog. |
    | Generations | Read about the $ai_generation event and its properties. |
    | Traces | Explore the trace hierarchy and how to use it to debug LLM calls. |
    | Spans | Review spans and their role in representing individual operations. |
    | Anaylze LLM performance | Learn how to create dashboards to analyze LLM performance. |

### Community questions

Ask a question

### Was this page useful?

HelpfulCould be better