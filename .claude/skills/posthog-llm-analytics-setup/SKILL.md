---
name: llm-analytics-setup
description: PostHog LLM analytics for all supported providers
metadata:
  author: PostHog
  version: 1.8.1
---

# PostHog LLM analytics

This skill helps you add PostHog LLM analytics to any application using AI/LLM providers.

## Reference files

- `openai.md` - Openai llm analytics installation - docs
- `azure-openai.md` - Azure openai llm analytics installation - docs
- `anthropic.md` - Anthropic llm analytics installation - docs
- `google.md` - Google llm analytics installation - docs
- `cohere.md` - Cohere llm analytics installation - docs
- `mistral.md` - Mistral llm analytics installation - docs
- `perplexity.md` - Perplexity llm analytics installation - docs
- `deepseek.md` - Deepseek llm analytics installation - docs
- `groq.md` - Groq llm analytics installation - docs
- `together-ai.md` - Together ai llm analytics installation - docs
- `fireworks-ai.md` - Fireworks ai llm analytics installation - docs
- `xai.md` - Xai llm analytics installation - docs
- `cerebras.md` - Cerebras llm analytics installation - docs
- `hugging-face.md` - Hugging face llm analytics installation - docs
- `ollama.md` - Ollama llm analytics installation - docs
- `openrouter.md` - Openrouter llm analytics installation - docs
- `langchain.md` - Langchain llm analytics installation - docs
- `llamaindex.md` - Llamaindex llm analytics installation - docs
- `crewai.md` - Crewai llm analytics installation - docs
- `autogen.md` - Autogen llm analytics installation - docs
- `dspy.md` - Dspy llm analytics installation - docs
- `langgraph.md` - Langgraph llm analytics installation - docs
- `pydantic-ai.md` - Pydantic ai llm analytics installation - docs
- `vercel-ai.md` - Vercel ai llm analytics installation - docs
- `litellm.md` - Litellm llm analytics installation - docs
- `instructor.md` - Instructor llm analytics installation - docs
- `semantic-kernel.md` - Semantic kernel llm analytics installation - docs
- `mirascope.md` - Mirascope llm analytics installation - docs
- `mastra.md` - Mastra llm analytics installation - docs
- `smolagents.md` - Smolagents llm analytics installation - docs
- `openai-agents.md` - Openai agents SDK llm analytics installation - docs
- `portkey.md` - Portkey llm analytics installation - docs
- `helicone.md` - Helicone llm analytics installation - docs
- `manual-capture.md` - Manual capture llm analytics installation - docs
- `basics.md` - Llm analytics basics - docs
- `traces.md` - Traces - docs
- `calculating-costs.md` - Calculating llm costs - docs

Each provider reference contains installation instructions, SDK setup, and code examples specific to that provider or framework. Find the reference that matches the user's stack and follow its instructions.

If the user's provider isn't listed, use `manual-capture.md` as a fallback — it covers the generic event capture approach that works with any provider.

## Key principles

- **Environment variables**: Always use environment variables for PostHog and LLM provider keys. Never hardcode them.
- **Minimal changes**: Add LLM analytics alongside existing LLM calls. Don't replace or restructure existing code.
- **Trace all generations**: Capture input tokens, output tokens, model name, latency, and costs for every LLM call.
- **Link to users**: Associate LLM generations with identified users via distinct IDs when possible.
- **One provider at a time**: Only instrument the provider(s) the user is actually using. Don't add instrumentation for providers not present in the codebase.

## Framework guidelines

- Remember that source code is available in the venv/site-packages directory
- posthog is the Python SDK package name
- Install dependencies with `pip install posthog` or `pip install -r requirements.txt` and do NOT use unquoted version specifiers like `>=` directly in shell commands
- In CLIs and scripts: MUST call posthog.shutdown() before exit or all events are lost
- Always use the Posthog() class constructor (instance-based API) instead of module-level posthog.api_key config
- Always include enable_exception_autocapture=True in the Posthog() constructor to automatically track exceptions
- NEVER send PII in capture() event properties — no emails, full names, phone numbers, physical addresses, IP addresses, or user-generated content
- PII belongs in identify() person properties, NOT in capture() event properties. Safe event properties are metadata like message_length, form_type, boolean flags.
- Register posthog_client.shutdown with atexit.register() to ensure all events are flushed on exit
- The Python SDK has NO identify() method — use posthog_client.set(distinct_id=user_id, properties={...}) to set person properties, or use identify_context(user_id) within a context
